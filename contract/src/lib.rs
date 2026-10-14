//! Distant Worlds galaxy: one colonist per planet. Shared instance; parameters = admin ed25519
//! pubkey (32 bytes) || app path (the delegations' scope, as in FreeNames).
//!
//! Time spent on a planet is measured as proof of work: while a player stays on a planet the UI
//! mines in the background, keeping, for each of LANES lanes, the nonce with the lowest
//! `sha256("dwc1|<seed>|<persona>|<lane>|<nonce>")`. The sum of the lanes' top 64 bits (the score)
//! shrinks as work accumulates, so a lower score means more time spent. The colony goes to the
//! lowest score: spend more time than the colonist and the planet is yours. Lanes are bound to the
//! seed and the persona, so work cannot be moved to another planet or player.
//! The colonist (a whoiam/viso persona) signs the colony with a delegated app key; the colonist
//! names the planet and plants a beacon at `x`. A colonist must also show a Viso persona level: the
//! persona's own `ante` slot (a self-signed proof of work, see viso-ante), at least MIN_ANTE_BITS.
//! Admin-signed blocklist hides stars or personas.
//!
//! Homes: each persona can publish its home planet (buildings and creatures), signed like a colony,
//! so other explorers see it. The newest signed home of a persona wins. What a home holds is
//! self-declared (resources are gathered in the client); MAX_BUILT and MAX_ANIMALS bound it.
//!
//! Sieges: an explorer besieges another one's home by spending time there, measured like a colony
//! but bound to the defender and the day (`dwr1|<target>|<attacker>|<day>|<lane>|<nonce>`), so a
//! siege cannot be reused on another home or another day. One raid per attacker, target and day; more
//! work replaces it. Who wins is decided by the clients (the defence is the self-declared home).
//!
//! Names: the first explorer to name a species (wild or bred) or a plant gives it its common name.
//! "First" is the lowest self-declared ts (then the signature), so every merge order converges; a
//! modified client can backdate, as with chat times.
use freenet_stdlib::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use whoiam_delegation::{check, key, verify, Cert};

pub const LANES: usize = 8;
/// Viso persona level needed to hold a colony (each persona costs about 2^20 hashes to make).
pub const MIN_ANTE_BITS: u32 = 20;
/// Minimum work for a colony. Work ≈ LANES² / (score / 2^64); 2^21 hashes give a mean score of 2^49,
/// so this bound (twice that) lets about 2^21 hashes (a few minutes on a planet) through almost always.
pub const MAX_SCORE: u128 = 1 << 50;
pub const MAX_COLONIES: usize = 20_000;
const GALAXY: u32 = 10_000;
pub const MAX_HOMES: usize = 20_000;
pub const MAX_BUILT: usize = 64;
pub const MAX_ANIMALS: usize = 64;
pub const MAX_RAIDS: usize = 20_000;
pub const MAX_NAMES: usize = 50_000;
/// Bred species: up to MAX_GEN generations, ids up to MAX_ID bytes (world.js MAX_GEN, MAX_ID).
pub const MAX_GEN: u32 = 3;
pub const MAX_ID: usize = 256;
pub const BUILDINGS: [&str; 8] = ["house", "windmill", "longhouse", "factory", "temple", "castle", "tower", "dome"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Colony {
    pub persona: String, // hex ed25519 pubkey
    pub name: String,    // the planet's name, chosen by the colonist
    pub nick: String,    // the colonist's display name (signed by them, not unique)
    pub x: i64,          // beacon position in hundredths of a screen
    pub ts: u64,         // self-declared (ms); only orders a colonist's own updates
    pub nonces: Vec<u64>,
    pub ante: String, // hex: the persona's Viso `ante` slot content
    pub sig: String,  // hex, by the delegated app key over `msg()`
    pub cert: Cert,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Home {
    pub persona: String,
    pub nick: String,
    pub seed: String,              // the home planet
    pub built: Vec<(String, i64)>, // (building kind, position in hundredths of a screen)
    pub animals: Vec<String>,      // species ids: wild "<star seed>#<k>" or bred (see is_animal)
    pub ts: u64,                   // self-declared (ms); the newest home of a persona wins
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub peace: bool, // opted out of sieges, both ways
    pub ante: String,
    pub sig: String, // by the delegated app key over `home_msg()`
    pub cert: Cert,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Raid {
    pub attacker: String, // hex ed25519 pubkey
    pub nick: String,
    pub target: String, // the besieged persona
    pub day: u64,       // days since 1970 (UTC), self-declared; clients ignore old and future ones
    pub nonces: Vec<u64>,
    pub ante: String,
    pub sig: String, // by the attacker's delegated app key over `raid_msg()`
    pub cert: Cert,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Name {
    pub persona: String,
    pub nick: String,
    pub id: String,   // a species id (see is_animal) or a plant id "<star seed>~<k>"
    pub name: String, // the common name
    pub ts: u64,      // self-declared (ms): the earliest name wins
    pub ante: String,
    pub sig: String, // by the delegated app key over `name_msg()`
    pub cert: Cert,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Blocklist {
    pub ts: u64,
    pub list: Vec<String>, // star seeds or persona keys
    pub sig: String,       // hex, by admin over `dwb1|<ts>|<list joined by ,>`
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct GalaxyState {
    pub colonies: BTreeMap<String, Colony>, // seed -> colony
    pub blocked: Blocklist,
    #[serde(default)]
    pub homes: BTreeMap<String, Home>, // persona -> home
    #[serde(default)]
    pub raids: BTreeMap<String, Raid>, // "<attacker>|<target>|<day>" -> raid
    #[serde(default)]
    pub names: BTreeMap<String, Name>, // species or plant id -> its first name
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Summary {
    pub colonies: BTreeMap<String, (String, u64)>, // seed -> (score as decimal string, ts)
    pub blocked_ts: u64,
    #[serde(default)]
    pub homes: BTreeMap<String, u64>, // persona -> ts
    #[serde(default)]
    pub raids: BTreeMap<String, String>, // key -> score as decimal string
    #[serde(default)]
    pub names: BTreeMap<String, (u64, String)>, // id -> (ts, sig)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Delta {
    #[serde(default)]
    pub colonies: BTreeMap<String, Colony>,
    #[serde(default)]
    pub blocked: Option<Blocklist>,
    #[serde(default)]
    pub homes: BTreeMap<String, Home>,
    #[serde(default)]
    pub raids: BTreeMap<String, Raid>,
    #[serde(default)]
    pub names: BTreeMap<String, Name>,
}

type R<T> = Result<T, String>;

pub fn lane_hash(seed: &str, persona: &str, lane: usize, nonce: u64) -> [u8; 32] {
    Sha256::digest(format!("dwc1|{seed}|{persona}|{lane}|{nonce}").as_bytes()).into()
}

/// Sum of the lanes' top 64 bits: lower = more work.
pub fn score(seed: &str, c: &Colony) -> u128 {
    c.nonces
        .iter()
        .enumerate()
        .map(|(i, n)| u64::from_be_bytes(lane_hash(seed, &c.persona, i, *n)[..8].try_into().unwrap()) as u128)
        .sum()
}

pub fn raid_hash(r: &Raid, lane: usize, nonce: u64) -> [u8; 32] {
    Sha256::digest(format!("dwr1|{}|{}|{}|{lane}|{nonce}", r.target, r.attacker, r.day).as_bytes()).into()
}

/// Like a colony's score: lower = a longer siege.
pub fn raid_score(r: &Raid) -> u128 {
    r.nonces.iter().enumerate().map(|(i, n)| u64::from_be_bytes(raid_hash(r, i, *n)[..8].try_into().unwrap()) as u128).sum()
}

pub fn raid_key(r: &Raid) -> String {
    format!("{}|{}|{}", r.attacker, r.target, r.day)
}

pub fn raid_msg(r: &Raid) -> String {
    let n: Vec<String> = r.nonces.iter().map(u64::to_string).collect();
    format!("dwr1|{}|{}|{}|{}|{}", r.attacker, r.nick, r.target, r.day, n.join(","))
}

fn raid_rank(r: &Raid) -> (u128, &str) {
    (raid_score(r), &r.sig)
}

pub fn check_raid(app: &str, r: &Raid) -> R<()> {
    if !is_persona(&r.attacker) || !is_persona(&r.target) || r.attacker == r.target || !text_ok(&r.nick, 24) || r.nonces.len() != LANES {
        return Err("bad raid".into());
    }
    if raid_score(r) > MAX_SCORE {
        return Err("siege too short".into());
    }
    let ante = hex::decode(&r.ante).map_err(|e| e.to_string())?;
    if viso_ante::verify_slot(&key(&r.attacker)?, &ante)? < MIN_ANTE_BITS {
        return Err("persona level too low".into());
    }
    let app_key = check(&r.attacker, app, &r.cert)?;
    verify(&app_key, raid_msg(r).as_bytes(), &r.sig)
}

fn raid_blocked(b: &Blocklist, r: &Raid) -> bool {
    b.list.iter().any(|x| *x == r.attacker || *x == r.target)
}

/// Keep the MAX_RAIDS most recent raids (then the longest sieges).
fn prune_raids(raids: &mut BTreeMap<String, Raid>) {
    if raids.len() <= MAX_RAIDS {
        return;
    }
    let mut order: Vec<_> = raids.iter().map(|(k, r)| ((std::cmp::Reverse(r.day), raid_score(r), r.sig.clone()), k.clone())).collect();
    order.sort();
    for (_, k) in order.into_iter().skip(MAX_RAIDS) {
        raids.remove(&k);
    }
}

pub fn msg(seed: &str, c: &Colony) -> String {
    let n: Vec<String> = c.nonces.iter().map(u64::to_string).collect();
    format!("dwc1|{seed}|{}|{}|{}|{}|{}|{}", c.persona, c.name, c.nick, c.x, c.ts, n.join(","))
}

/// Total order: lower score first; for equal score, the newer update; then the signature.
fn rank(seed: &str, c: &Colony) -> (u128, std::cmp::Reverse<u64>, String) {
    (score(seed, c), std::cmp::Reverse(c.ts), c.sig.clone())
}

/// `v1-<x>_<y>_<n>` with x, y < GALAXY and n a single digit (sectors hold at most 9 stars), optionally
/// `.<g>` (g ≥ 1): the g-th world born from that star after the earlier ones collapsed.
pub fn is_star(seed: &str) -> bool {
    let Some(rest) = seed.strip_prefix("v1-") else { return false };
    let num = |s: &str, max: u32| {
        !s.is_empty() && s.len() <= 6 && s.bytes().all(|b| b.is_ascii_digit()) && (s == "0" || !s.starts_with('0')) && s.parse::<u32>().is_ok_and(|v| v < max)
    };
    let (star, gen) = match rest.split_once('.') {
        Some((s, g)) => (s, Some(g)),
        None => (rest, None),
    };
    let p: Vec<&str> = star.split('_').collect();
    p.len() == 3 && num(p[0], GALAXY) && num(p[1], GALAXY) && num(p[2], 10) && gen.is_none_or(|g| g != "0" && num(g, 1_000_000))
}

pub fn home_msg(h: &Home) -> String {
    let b: Vec<String> = h.built.iter().map(|(k, x)| format!("{k}:{x}")).collect();
    let peace = if h.peace { "|peace" } else { "" }; // absent for homes signed before sieges
    format!("dwh1|{}|{}|{}|{}|{}|{}{peace}", h.persona, h.nick, h.seed, h.ts, b.join(","), h.animals.join(","))
}

/// `<star seed><sep><k>` with k one or two digits: a wild species ('#') or a plant ('~').
fn is_kind(a: &str, sep: char) -> bool {
    a.split_once(sep).is_some_and(|(seed, k)| is_star(seed) && !k.is_empty() && k.len() <= 2 && k.bytes().all(|b| b.is_ascii_digit()))
}

/// The parents of a bred id ("a+b", sorted, a bred parent in parentheses), only in its canonical spelling.
fn parents(id: &str) -> Option<(&str, &str)> {
    let (mut depth, mut at) = (0i32, None);
    for (i, c) in id.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            '+' if depth == 0 && at.replace(i).is_some() => return None,
            _ => {}
        }
        if depth < 0 {
            return None;
        }
    }
    let at = at.filter(|_| depth == 0)?;
    fn side(s: &str) -> Option<&str> {
        if s.contains('+') { s.strip_prefix('(')?.strip_suffix(')') } else { Some(s) }
    }
    let (a, b) = (side(&id[..at])?, side(&id[at + 1..])?);
    let wrap = |s: &str| if s.contains('+') { format!("({s})") } else { s.to_string() };
    (a < b && format!("{}+{}", wrap(a), wrap(b)) == id).then_some((a, b))
}

/// Generations behind a species id: 0 wild, n bred (at most MAX_GEN); None if it is not a valid id.
fn generation(id: &str) -> Option<u32> {
    if id.len() > MAX_ID {
        return None;
    }
    if !id.contains('+') {
        return is_kind(id, '#').then_some(0);
    }
    let (a, b) = parents(id)?;
    let g = generation(a)?.max(generation(b)?) + 1;
    (g <= MAX_GEN).then_some(g)
}

/// A plant id: wild "<star seed>~<k>", or two wild ones crossed at a mill ("a+b", sorted; world.js crossPlant).
fn is_plant(p: &str) -> bool {
    is_kind(p, '~') || parents(p).is_some_and(|(a, b)| is_kind(a, '~') && is_kind(b, '~'))
}

/// A species id: wild "<star seed>#<k>", or bred (world.js bredId) up to MAX_GEN generations.
pub fn is_animal(a: &str) -> bool {
    generation(a).is_some()
}

pub fn name_msg(n: &Name) -> String {
    format!("dwn1|{}|{}|{}|{}|{}", n.persona, n.nick, n.id, n.name, n.ts)
}

pub fn check_name(app: &str, n: &Name) -> R<()> {
    if !is_persona(&n.persona) || !text_ok(&n.nick, 24) || !text_ok(&n.name, 24) || !(is_animal(&n.id) || is_plant(&n.id)) {
        return Err("bad name".into());
    }
    let ante = hex::decode(&n.ante).map_err(|e| e.to_string())?;
    if viso_ante::verify_slot(&key(&n.persona)?, &ante)? < MIN_ANTE_BITS {
        return Err("persona level too low".into());
    }
    let app_key = check(&n.persona, app, &n.cert)?;
    verify(&app_key, name_msg(n).as_bytes(), &n.sig)
}

/// Earliest first; equal ts falls back to the signature, so every merge order converges.
fn name_rank(n: &Name) -> (u64, &str) {
    (n.ts, &n.sig)
}

/// Keep the MAX_NAMES earliest names.
fn prune_names(names: &mut BTreeMap<String, Name>) {
    if names.len() <= MAX_NAMES {
        return;
    }
    let mut order: Vec<_> = names.iter().map(|(k, n)| ((n.ts, n.sig.clone()), k.clone())).collect();
    order.sort();
    for (_, k) in order.into_iter().skip(MAX_NAMES) {
        names.remove(&k);
    }
}

pub fn check_home(app: &str, h: &Home) -> R<()> {
    if !is_persona(&h.persona) || !is_star(&h.seed) || !text_ok(&h.nick, 24) {
        return Err("bad home".into());
    }
    if h.built.len() > MAX_BUILT || h.animals.len() > MAX_ANIMALS {
        return Err("home too big".into());
    }
    if !h.built.iter().all(|(k, x)| BUILDINGS.contains(&k.as_str()) && x.abs() <= 1_000_000_000) || !h.animals.iter().all(|a| is_animal(a)) {
        return Err("bad home fields".into());
    }
    let ante = hex::decode(&h.ante).map_err(|e| e.to_string())?;
    if viso_ante::verify_slot(&key(&h.persona)?, &ante)? < MIN_ANTE_BITS {
        return Err("persona level too low".into());
    }
    let app_key = check(&h.persona, app, &h.cert)?;
    verify(&app_key, home_msg(h).as_bytes(), &h.sig)
}

/// Newest first; equal ts falls back to the signature, so every merge order converges.
fn home_rank(h: &Home) -> (u64, &str) {
    (h.ts, &h.sig)
}

fn is_persona(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn text_ok(s: &str, max: usize) -> bool {
    let n = s.chars().count();
    n > 0 && n <= max && s.trim() == s && !s.chars().any(|c| c.is_control() || c == '|')
}

pub fn check_colony(app: &str, seed: &str, c: &Colony) -> R<()> {
    if !is_star(seed) || !is_persona(&c.persona) {
        return Err("bad star or persona".into());
    }
    if !text_ok(&c.name, 32) || !text_ok(&c.nick, 24) || c.nonces.len() != LANES || c.x.abs() > 1_000_000_000 {
        return Err("bad colony fields".into());
    }
    if score(seed, c) > MAX_SCORE {
        return Err("not enough time spent on this planet".into());
    }
    let ante = hex::decode(&c.ante).map_err(|e| e.to_string())?;
    if viso_ante::verify_slot(&key(&c.persona)?, &ante)? < MIN_ANTE_BITS {
        return Err("persona level too low".into());
    }
    let app_key = check(&c.persona, app, &c.cert)?;
    verify(&app_key, msg(seed, c).as_bytes(), &c.sig)
}

fn check_blocklist(admin: &str, b: &Blocklist) -> R<()> {
    if b.ts == 0 && b.list.is_empty() && b.sig.is_empty() {
        return Ok(()); // initial empty state
    }
    if b.list.len() > 10_000 || !b.list.iter().all(|s| is_star(s) || is_persona(s)) {
        return Err("bad blocklist".into());
    }
    verify(&key(admin)?, format!("dwb1|{}|{}", b.ts, b.list.join(",")).as_bytes(), &b.sig)
}

fn blocked(b: &Blocklist, seed: &str, c: &Colony) -> bool {
    b.list.iter().any(|x| x == seed || *x == c.persona)
}

/// Keep the MAX_COLONIES most-worked colonies; deterministic, so merge order does not matter.
fn prune(colonies: &mut BTreeMap<String, Colony>) {
    if colonies.len() <= MAX_COLONIES {
        return;
    }
    let mut order: Vec<_> = colonies.iter().map(|(s, c)| (rank(s, c), s.clone())).collect();
    order.sort();
    for (_, s) in order.into_iter().skip(MAX_COLONIES) {
        colonies.remove(&s);
    }
}

/// Keep the MAX_HOMES newest homes.
fn prune_homes(homes: &mut BTreeMap<String, Home>) {
    if homes.len() <= MAX_HOMES {
        return;
    }
    let mut order: Vec<_> = homes.iter().map(|(p, h)| (std::cmp::Reverse((h.ts, h.sig.clone())), p.clone())).collect();
    order.sort();
    for (_, p) in order.into_iter().skip(MAX_HOMES) {
        homes.remove(&p);
    }
}

fn home_blocked(b: &Blocklist, h: &Home) -> bool {
    b.list.iter().any(|x| *x == h.persona || *x == h.seed)
}

pub fn validate(admin: &str, app: &str, s: &GalaxyState) -> R<()> {
    check_blocklist(admin, &s.blocked)?;
    if s.colonies.len() > MAX_COLONIES || s.colonies.iter().any(|(k, c)| blocked(&s.blocked, k, c)) {
        return Err("state out of bounds".into());
    }
    if s.homes.len() > MAX_HOMES || s.homes.iter().any(|(p, h)| *p != h.persona || home_blocked(&s.blocked, h)) {
        return Err("homes out of bounds".into());
    }
    if s.raids.len() > MAX_RAIDS || s.raids.iter().any(|(k, r)| *k != raid_key(r) || raid_blocked(&s.blocked, r)) {
        return Err("raids out of bounds".into());
    }
    if s.names.len() > MAX_NAMES || s.names.iter().any(|(k, n)| *k != n.id || s.blocked.list.contains(&n.persona)) {
        return Err("names out of bounds".into());
    }
    s.colonies.iter().try_for_each(|(k, c)| check_colony(app, k, c))?;
    s.homes.values().try_for_each(|h| check_home(app, h))?;
    s.raids.values().try_for_each(|r| check_raid(app, r))?;
    s.names.values().try_for_each(|n| check_name(app, n))
}

pub fn apply(admin: &str, app: &str, s: &mut GalaxyState, d: Delta) -> R<()> {
    if let Some(b) = d.blocked {
        if b.ts > s.blocked.ts {
            check_blocklist(admin, &b)?;
            s.blocked = b;
        }
    }
    for (seed, c) in d.colonies {
        if blocked(&s.blocked, &seed, &c) || s.colonies.get(&seed).is_some_and(|old| rank(&seed, old) <= rank(&seed, &c)) {
            continue; // blocked or not better: ignore, so every merge order converges
        }
        check_colony(app, &seed, &c)?;
        s.colonies.insert(seed, c);
    }
    for (persona, h) in d.homes {
        if persona != h.persona || home_blocked(&s.blocked, &h) || s.homes.get(&persona).is_some_and(|old| home_rank(old) >= home_rank(&h)) {
            continue;
        }
        check_home(app, &h)?;
        s.homes.insert(persona, h);
    }
    for (k, r) in d.raids {
        if k != raid_key(&r) || raid_blocked(&s.blocked, &r) || s.raids.get(&k).is_some_and(|old| raid_rank(old) <= raid_rank(&r)) {
            continue;
        }
        check_raid(app, &r)?;
        s.raids.insert(k, r);
    }
    for (k, n) in d.names {
        if k != n.id || s.blocked.list.contains(&n.persona) || s.names.get(&k).is_some_and(|old| name_rank(old) <= name_rank(&n)) {
            continue;
        }
        check_name(app, &n)?;
        s.names.insert(k, n);
    }
    let b = s.blocked.clone();
    s.colonies.retain(|k, c| !blocked(&b, k, c));
    s.homes.retain(|_, h| !home_blocked(&b, h));
    s.raids.retain(|_, r| !raid_blocked(&b, r));
    prune(&mut s.colonies);
    prune_homes(&mut s.homes);
    prune_raids(&mut s.raids);
    s.names.retain(|_, n| !b.list.contains(&n.persona));
    prune_names(&mut s.names);
    Ok(())
}

pub fn summarize(s: &GalaxyState) -> Summary {
    Summary {
        colonies: s.colonies.iter().map(|(k, c)| (k.clone(), (score(k, c).to_string(), c.ts))).collect(),
        blocked_ts: s.blocked.ts,
        homes: s.homes.iter().map(|(p, h)| (p.clone(), h.ts)).collect(),
        raids: s.raids.iter().map(|(k, r)| (k.clone(), raid_score(r).to_string())).collect(),
        names: s.names.iter().map(|(k, n)| (k.clone(), (n.ts, n.sig.clone()))).collect(),
    }
}

pub fn delta(s: &GalaxyState, sum: &Summary) -> Delta {
    let better = |k: &String, c: &Colony| match sum.colonies.get(k) {
        None => true,
        Some((sc, ts)) => (score(k, c), std::cmp::Reverse(c.ts)) < (sc.parse().unwrap_or(u128::MAX), std::cmp::Reverse(*ts)),
    };
    Delta {
        colonies: s.colonies.iter().filter(|(k, c)| better(k, c)).map(|(k, c)| (k.clone(), c.clone())).collect(),
        blocked: (s.blocked.ts > sum.blocked_ts).then(|| s.blocked.clone()),
        homes: s.homes.iter().filter(|(p, h)| sum.homes.get(*p).is_none_or(|ts| h.ts > *ts)).map(|(p, h)| (p.clone(), h.clone())).collect(),
        raids: s.raids.iter().filter(|(k, r)| sum.raids.get(*k).is_none_or(|sc| raid_score(r) < sc.parse().unwrap_or(u128::MAX))).map(|(k, r)| (k.clone(), r.clone())).collect(),
        names: s.names.iter().filter(|(k, n)| sum.names.get(*k).is_none_or(|(ts, sig)| name_rank(n) < (*ts, sig.as_str()))).map(|(k, n)| (k.clone(), n.clone())).collect(),
    }
}

// ---- Freenet glue ----

/// Parameters: admin key (32 bytes) || app path.
fn params(p: &Parameters) -> Result<(String, String), ContractError> {
    let b = p.as_ref();
    if b.len() < 33 {
        return Err(ContractError::Other("bad parameters".into()));
    }
    let app = std::str::from_utf8(&b[32..]).map_err(|e| ContractError::Other(e.to_string()))?;
    Ok((hex::encode(&b[..32]), app.to_string()))
}

fn de<T: for<'a> Deserialize<'a>>(b: &[u8]) -> Result<T, ContractError> {
    serde_json::from_slice(b).map_err(|e| ContractError::Deser(e.to_string()))
}

/// Empty bytes (e.g. subscribe with no summary) mean "nothing known yet".
fn de_or_default<T: for<'a> Deserialize<'a> + Default>(b: &[u8]) -> Result<T, ContractError> {
    if b.is_empty() { Ok(T::default()) } else { de(b) }
}

fn ser<T: Serialize>(v: &T) -> Result<Vec<u8>, ContractError> {
    serde_json::to_vec(v).map_err(|e| ContractError::Deser(e.to_string()))
}

struct Contract;

#[contract]
impl ContractInterface for Contract {
    fn validate_state(
        parameters: Parameters<'static>,
        state: State<'static>,
        _related: RelatedContracts<'static>,
    ) -> Result<ValidateResult, ContractError> {
        let (admin, app) = params(&parameters)?;
        let s: GalaxyState = de_or_default(state.as_ref())?;
        Ok(match validate(&admin, &app, &s) {
            Ok(()) => ValidateResult::Valid,
            Err(_) => ValidateResult::Invalid,
        })
    }

    fn update_state(
        parameters: Parameters<'static>,
        state: State<'static>,
        data: Vec<UpdateData<'static>>,
    ) -> Result<UpdateModification<'static>, ContractError> {
        let (admin, app) = params(&parameters)?;
        let mut s: GalaxyState = de_or_default(state.as_ref())?;
        for u in data {
            let d: Delta = match u {
                UpdateData::State(st) => {
                    let o: GalaxyState = de(st.as_ref())?;
                    Delta { colonies: o.colonies, blocked: Some(o.blocked), homes: o.homes, raids: o.raids, names: o.names }
                }
                UpdateData::Delta(d) => de(d.as_ref())?,
                UpdateData::StateAndDelta { delta, .. } => de(delta.as_ref())?,
                _ => return Err(ContractError::InvalidUpdate),
            };
            apply(&admin, &app, &mut s, d).map_err(|_| ContractError::InvalidUpdate)?;
        }
        Ok(UpdateModification::valid(State::from(ser(&s)?)))
    }

    fn summarize_state(
        _parameters: Parameters<'static>,
        state: State<'static>,
    ) -> Result<StateSummary<'static>, ContractError> {
        Ok(StateSummary::from(ser(&summarize(&de_or_default(state.as_ref())?))?))
    }

    fn get_state_delta(
        _parameters: Parameters<'static>,
        state: State<'static>,
        summary: StateSummary<'static>,
    ) -> Result<StateDelta<'static>, ContractError> {
        Ok(StateDelta::from(ser(&delta(&de_or_default(state.as_ref())?, &de_or_default(summary.as_ref())?))?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use whoiam_delegation::connect_message;

    const APP: &str = "/v1/contract/web/Worlds1/";

    fn sk(n: u8) -> SigningKey {
        SigningKey::from_bytes(&[n; 32])
    }
    fn pk(k: &SigningKey) -> String {
        hex::encode(k.verifying_key().to_bytes())
    }

    /// Mine each lane for `per_lane` nonces, keeping the best; then sign as the persona's app key.
    fn colony(seed: &str, persona: &SigningKey, name: &str, per_lane: u64, ts: u64) -> Colony {
        let p = pk(persona);
        let nonces = (0..LANES)
            .map(|i| (0..per_lane).min_by_key(|n| u64::from_be_bytes(lane_hash(seed, &p, i, *n)[..8].try_into().unwrap())).unwrap())
            .collect();
        let app_key = sk(100);
        let (base, challenge) = (format!("http://127.0.0.1:7509{APP}"), format!("wd1.{}.n1", pk(&app_key)));
        let csig = persona.sign(&connect_message(persona.verifying_key().as_bytes(), &base, &challenge, 1));
        let cert = Cert { base, challenge, ts: 1, sig: hex::encode(csig.to_bytes()) };
        let mut c = Colony { persona: p, name: name.into(), nick: "nick".into(), x: 150, ts, nonces, ante: ante(persona, MIN_ANTE_BITS), sig: String::new(), cert };
        c.sig = hex::encode(app_key.sign(msg(seed, &c).as_bytes()).to_bytes());
        c
    }
    /// The persona's Viso level proof, at least `bits`.
    fn ante(k: &SigningKey, bits: u32) -> String {
        let n = viso_ante::grind_step(&k.verifying_key(), 0, u64::MAX, bits).unwrap();
        hex::encode(viso_ante::make_slot(k, n, 1))
    }
    fn one(seed: &str, c: Colony) -> Delta {
        Delta { colonies: [(seed.into(), c)].into(), blocked: None, homes: Default::default(), raids: Default::default(), names: Default::default() }
    }

    #[test]
    fn lane_hash_matches_ui() {
        // same vector as freenet/net.test.mjs
        assert_eq!(hex::encode(lane_hash("v1-1_2_3", &"ab".repeat(32), 5, 42)), "c156661a5b0f0186153c7c20a30288ae1cff31fb5817d58a79ab886e09f0d997");
    }

    #[test]
    fn more_time_takes_the_planet_in_any_order() {
        let admin = pk(&sk(1));
        let seed = "v1-12_34_5";
        let a = colony(seed, &sk(2), "Aurora", 1 << 18, 10); // 2^21 hashes in total
        let b = colony(seed, &sk(3), "Bellatrix", 1 << 21, 5); // 8x the time
        assert!(score(seed, &b) < score(seed, &a));

        let mut s1 = GalaxyState::default();
        validate(&admin, APP, &s1).unwrap();
        apply(&admin, APP, &mut s1, one(seed, a.clone())).unwrap();
        assert_eq!(s1.colonies[seed].name, "Aurora");
        apply(&admin, APP, &mut s1, one(seed, b.clone())).unwrap();
        let mut s2 = GalaxyState::default();
        apply(&admin, APP, &mut s2, one(seed, b.clone())).unwrap();
        apply(&admin, APP, &mut s2, one(seed, a.clone())).unwrap();
        assert_eq!(s1, s2);
        assert_eq!(s1.colonies[seed].name, "Bellatrix");
        validate(&admin, APP, &s1).unwrap();

        // the colonist renames with the same work and a newer ts
        let mut renamed = b.clone();
        renamed.name = "Bella".into();
        renamed.ts = 6;
        renamed.sig = hex::encode(sk(100).sign(msg(seed, &renamed).as_bytes()).to_bytes());
        apply(&admin, APP, &mut s1, one(seed, renamed)).unwrap();
        assert_eq!(s1.colonies[seed].name, "Bella");

        assert!(delta(&s1, &summarize(&s1)).colonies.is_empty());
        assert!(delta(&s1, &Summary::default()).colonies.contains_key(seed));
    }

    #[test]
    fn rejects_cheats() {
        let admin = pk(&sk(1));
        let mut s = GalaxyState::default();
        let seed = "v1-1_1_1";
        // too little time
        assert!(apply(&admin, APP, &mut s, one(seed, colony(seed, &sk(2), "Quick", 1 << 10, 1))).is_err());
        let good = colony(seed, &sk(2), "Vega", 1 << 18, 1);
        // work moved to another planet or another persona
        assert!(check_colony(APP, "v1-1_1_2", &good).is_err());
        let mut stolen = good.clone();
        stolen.persona = pk(&sk(3));
        assert!(check_colony(APP, seed, &stolen).is_err());
        // a field changed after signing
        let mut forged = good.clone();
        forged.name = "Mine now".into();
        assert!(check_colony(APP, seed, &forged).is_err());
        // a delegation made for another app
        assert!(check_colony("/v1/contract/web/Other/", seed, &good).is_err());
        // persona level: too low, or another persona's proof
        let mut weak = good.clone();
        weak.ante = hex::encode(viso_ante::make_slot(&sk(2), 0, 1)); // nonce 0: almost surely < 20 bits
        assert!(check_colony(APP, seed, &weak).is_err());
        let mut borrowed = good.clone();
        borrowed.ante = ante(&sk(5), MIN_ANTE_BITS);
        assert!(check_colony(APP, seed, &borrowed).is_err());

        apply(&admin, APP, &mut s, one(seed, good.clone())).unwrap();
        let block = |k: &SigningKey, list: Vec<String>| {
            let sig = hex::encode(k.sign(format!("dwb1|1|{}", list.join(",")).as_bytes()).to_bytes());
            Blocklist { ts: 1, list, sig }
        };
        assert!(apply(&admin, APP, &mut s, Delta { colonies: Default::default(), homes: Default::default(), raids: Default::default(), names: Default::default(), blocked: Some(block(&sk(9), vec![seed.into()])) }).is_err());
        apply(&admin, APP, &mut s, Delta { colonies: Default::default(), homes: Default::default(), raids: Default::default(), names: Default::default(), blocked: Some(block(&sk(1), vec![pk(&sk(2))])) }).unwrap();
        assert!(s.colonies.is_empty());
        apply(&admin, APP, &mut s, one(seed, good)).unwrap(); // a blocked persona cannot come back
        assert!(s.colonies.is_empty());
        validate(&admin, APP, &s).unwrap();
    }

    fn home(persona: &SigningKey, seed: &str, built: &[(&str, i64)], ts: u64) -> Home {
        let c = colony("v1-1_1_1", persona, "x", 1, 1); // borrow its delegation and level
        let mut h = Home {
            persona: c.persona, nick: "nick".into(), seed: seed.into(), built: built.iter().map(|(k, x)| (k.to_string(), *x)).collect(),
            animals: vec![format!("{seed}#0")], ts, peace: false, ante: c.ante, sig: String::new(), cert: c.cert,
        };
        h.sig = hex::encode(sk(100).sign(home_msg(&h).as_bytes()).to_bytes());
        h
    }
    fn homes(h: Home) -> Delta {
        Delta { colonies: Default::default(), blocked: None, homes: [(h.persona.clone(), h)].into(), raids: Default::default(), names: Default::default() }
    }

    #[test]
    fn homes_newest_wins_and_cheats_fail() {
        let admin = pk(&sk(1));
        let old = home(&sk(2), "v1-5_5_5", &[("house", 50)], 1);
        let new = home(&sk(2), "v1-5_5_5.2", &[("house", 50), ("castle", 80)], 2);
        let mut s1 = GalaxyState::default();
        apply(&admin, APP, &mut s1, homes(old.clone())).unwrap();
        apply(&admin, APP, &mut s1, homes(new.clone())).unwrap();
        let mut s2 = GalaxyState::default();
        apply(&admin, APP, &mut s2, homes(new.clone())).unwrap();
        apply(&admin, APP, &mut s2, homes(old.clone())).unwrap();
        assert_eq!(s1, s2);
        assert_eq!(s1.homes[&new.persona].built.len(), 2);
        validate(&admin, APP, &s1).unwrap();
        assert!(delta(&s1, &summarize(&s1)).homes.is_empty());
        assert!(delta(&s1, &Summary::default()).homes.contains_key(&new.persona));

        let mut forged = new.clone();
        forged.built.push(("dome".into(), 0));
        assert!(check_home(APP, &forged).is_err(), "changed after signing");
        assert!(check_home(APP, &home(&sk(2), "v1-5_5_5", &[("palace", 0)], 3)).is_err(), "unknown building");
        assert!(check_home(APP, &home(&sk(2), "v1-5_5_5", &vec![("house", 0); MAX_BUILT + 1], 3)).is_err(), "too many buildings");
        assert!(check_home(APP, &home(&sk(2), "my-world", &[], 3)).is_err(), "not a star");
        let mut stolen = new.clone();
        stolen.persona = pk(&sk(3));
        assert!(apply(&admin, APP, &mut GalaxyState::default(), homes(stolen)).is_err());
    }

    #[test]
    fn home_msg_matches_ui() {
        // same vector as freenet/net.test.mjs
        let c = colony("v1-1_1_1", &sk(2), "x", 1, 1);
        let h = Home { persona: "ab".repeat(32), nick: "Zed".into(), seed: "v1-1_2_3.4".into(), built: vec![("house".into(), 50), ("dome".into(), -20)],
            animals: vec!["v1-1_2_3#0".into(), "v1-9_9_9#2".into()], ts: 7, peace: false, ante: String::new(), sig: String::new(), cert: c.cert };
        assert_eq!(home_msg(&h), format!("dwh1|{}|Zed|v1-1_2_3.4|7|house:50,dome:-20|v1-1_2_3#0,v1-9_9_9#2", "ab".repeat(32)));
        let p = Home { peace: true, ..h };
        assert_eq!(home_msg(&p), format!("dwh1|{}|Zed|v1-1_2_3.4|7|house:50,dome:-20|v1-1_2_3#0,v1-9_9_9#2|peace", "ab".repeat(32)));
        assert!(!serde_json::to_string(&Home { peace: false, ..p.clone() }).unwrap().contains("peace"), "old homes keep their JSON");
    }

    /// A siege of `per_lane` nonces per lane by `attacker` on `target`'s home on `day`.
    fn raid(attacker: &SigningKey, target: &SigningKey, day: u64, per_lane: u64) -> Raid {
        let c = colony("v1-1_1_1", attacker, "x", 1, 1);
        let mut r = Raid { attacker: c.persona, nick: "nick".into(), target: pk(target), day, nonces: vec![0; LANES], ante: c.ante, sig: String::new(), cert: c.cert };
        r.nonces = (0..LANES).map(|i| (0..per_lane).min_by_key(|n| u64::from_be_bytes(raid_hash(&r, i, *n)[..8].try_into().unwrap())).unwrap()).collect();
        r.sig = hex::encode(sk(100).sign(raid_msg(&r).as_bytes()).to_bytes());
        r
    }
    fn raids(r: Raid) -> Delta {
        Delta { colonies: Default::default(), blocked: None, homes: Default::default(), raids: [(raid_key(&r), r)].into(), names: Default::default() }
    }

    #[test]
    fn raid_hash_matches_ui() {
        // same vector as freenet/net.test.mjs
        let c = colony("v1-1_1_1", &sk(2), "x", 1, 1);
        let r = Raid { attacker: "ab".repeat(32), nick: "Zed".into(), target: "cd".repeat(32), day: 20000, nonces: vec![1, 2, 3, 4, 5, 6, 7, 8], ante: String::new(), sig: String::new(), cert: c.cert };
        assert_eq!(hex::encode(raid_hash(&r, 5, 42)), "782e4f8b7edc06a6094fa0e898d387fd2aa5e2479ade126103a82bd4b519986e");
        assert_eq!(raid_msg(&r), format!("dwr1|{}|Zed|{}|20000|1,2,3,4,5,6,7,8", "ab".repeat(32), "cd".repeat(32)));
    }

    #[test]
    fn longer_sieges_win_and_cheats_fail() {
        let admin = pk(&sk(1));
        let short = raid(&sk(2), &sk(3), 20000, 1 << 18);
        let long = raid(&sk(2), &sk(3), 20000, 1 << 20);
        assert!(raid_score(&long) < raid_score(&short));
        let mut s1 = GalaxyState::default();
        apply(&admin, APP, &mut s1, raids(short.clone())).unwrap();
        apply(&admin, APP, &mut s1, raids(long.clone())).unwrap();
        let mut s2 = GalaxyState::default();
        apply(&admin, APP, &mut s2, raids(long.clone())).unwrap();
        apply(&admin, APP, &mut s2, raids(short.clone())).unwrap();
        assert_eq!(s1, s2);
        assert_eq!(s1.raids.len(), 1);
        // another day is another raid
        apply(&admin, APP, &mut s1, raids(raid(&sk(2), &sk(3), 20001, 1 << 18))).unwrap();
        assert_eq!(s1.raids.len(), 2);
        validate(&admin, APP, &s1).unwrap();
        assert!(delta(&s1, &summarize(&s1)).raids.is_empty());
        assert_eq!(delta(&s1, &Summary::default()).raids.len(), 2);

        assert!(check_raid(APP, &raid(&sk(2), &sk(3), 20000, 1 << 10)).is_err(), "too short");
        assert!(check_raid(APP, &raid(&sk(2), &sk(2), 20000, 1 << 18)).is_err(), "besieging yourself");
        let mut moved = long.clone();
        moved.day = 20005;
        moved.sig = hex::encode(sk(100).sign(raid_msg(&moved).as_bytes()).to_bytes());
        assert!(check_raid(APP, &moved).is_err(), "work bound to its day");
        let mut retarget = long.clone();
        retarget.target = pk(&sk(4));
        retarget.sig = hex::encode(sk(100).sign(raid_msg(&retarget).as_bytes()).to_bytes());
        assert!(check_raid(APP, &retarget).is_err(), "work bound to its target");
        let mut forged = long.clone();
        forged.nick = "other".into();
        assert!(check_raid(APP, &forged).is_err(), "changed after signing");
        let mut wrong_key = GalaxyState::default();
        let d = Delta { raids: [("x".into(), long.clone())].into(), ..Default::default() };
        apply(&admin, APP, &mut wrong_key, d).unwrap();
        assert!(wrong_key.raids.is_empty(), "keyed by attacker, target and day");
    }

    #[test]
    fn animal_ids() {
        // same vectors as atlas.test.mjs (world.js generation)
        let (a, b, c) = ("v1-1_2_3#0", "v1-4_5_6#1", "v1-7_8_9.2#3");
        for ok in [a, "v1-1_2_3#0+v1-4_5_6#1", "(v1-1_2_3#0+v1-4_5_6#1)+v1-7_8_9.2#3", "((v1-1_2_3#0+v1-4_5_6#1)+v1-7_8_9.2#3)+(v1-1_2_3#0+v1-7_8_9.2#3)"] {
            assert!(is_animal(ok), "{ok}");
        }
        let gen4 = format!("(((v1-1_2_3#0+v1-4_5_6#1)+v1-7_8_9.2#3)+(v1-1_2_3#0+v1-7_8_9.2#3))+{a}");
        for bad in ["", "x", "v1-1_1_1", "(v1-1_1_1#0)", &format!("{b}+{a}"), &format!("{a}+{a}"), &format!("{a}+"), &format!("({a}+{b}"), &format!("{a}+{b}+{c}"), &format!("{a}+{b})"), &format!("v1-1_2_3#0+v1-4_5_6#1+v1-7_8_9.2#3"), &gen4, "v1-1_2_3~0"] {
            assert!(!is_animal(bad), "{bad}");
        }
    }

    fn name(persona: &SigningKey, id: &str, text: &str, ts: u64) -> Name {
        let c = colony("v1-1_1_1", persona, "x", 1, 1);
        let mut n = Name { persona: c.persona, nick: "nick".into(), id: id.into(), name: text.into(), ts, ante: c.ante, sig: String::new(), cert: c.cert };
        n.sig = hex::encode(sk(100).sign(name_msg(&n).as_bytes()).to_bytes());
        n
    }
    fn names(n: Name) -> Delta {
        Delta { names: [(n.id.clone(), n)].into(), ..Default::default() }
    }

    #[test]
    fn first_name_wins_and_cheats_fail() {
        let admin = pk(&sk(1));
        let id = "v1-1_2_3#0+v1-4_5_6#1";
        let first = name(&sk(2), id, "Fluffy", 10);
        let vector = Name { persona: "ab".repeat(32), nick: "Zed".into(), ts: 7, ..first.clone() }; // same vector as freenet/net.test.mjs
        assert_eq!(name_msg(&vector), format!("dwn1|{}|Zed|{id}|Fluffy|7", "ab".repeat(32)));
        let later = name(&sk(3), id, "Spike", 20);
        let mut s1 = GalaxyState::default();
        apply(&admin, APP, &mut s1, names(later.clone())).unwrap();
        apply(&admin, APP, &mut s1, names(first.clone())).unwrap();
        let mut s2 = GalaxyState::default();
        apply(&admin, APP, &mut s2, names(first.clone())).unwrap();
        apply(&admin, APP, &mut s2, names(later.clone())).unwrap();
        assert_eq!(s1, s2);
        assert_eq!(s1.names[id].name, "Fluffy");
        apply(&admin, APP, &mut s1, names(name(&sk(2), "v1-1_2_3~1", "Moonleaf", 30))).unwrap();
        apply(&admin, APP, &mut s1, names(name(&sk(2), "v1-1_2_3~1+v1-4_5_6~0", "Duskbell", 40))).unwrap(); // a hybrid plant
        assert!(check_name(APP, &name(&sk(2), "v1-4_5_6~0+v1-1_2_3~1", "Unsorted", 1)).is_err());
        validate(&admin, APP, &s1).unwrap();
        assert!(delta(&s1, &summarize(&s1)).names.is_empty());
        assert_eq!(delta(&s1, &Summary::default()).names.len(), 3);

        assert!(check_name(APP, &name(&sk(2), "v1-1_2_3#0+v1-1_2_3#0", "Same", 1)).is_err(), "not a species");
        assert!(check_name(APP, &name(&sk(2), id, "a|b", 1)).is_err(), "bad text");
        let mut forged = first.clone();
        forged.name = "Mine".into();
        assert!(check_name(APP, &forged).is_err(), "changed after signing");
        let mut moved = GalaxyState::default();
        apply(&admin, APP, &mut moved, Delta { names: [("v1-9_9_9#0".into(), first)].into(), ..Default::default() }).unwrap();
        assert!(moved.names.is_empty(), "keyed by its id");
    }

    #[test]
    fn bred_creatures_live_in_homes() {
        let mut h = home(&sk(2), "v1-5_5_5", &[("longhouse", 0)], 1);
        h.animals.push("(v1-1_2_3#0+v1-4_5_6#1)+v1-7_8_9.2#3".into());
        h.sig = hex::encode(sk(100).sign(home_msg(&h).as_bytes()).to_bytes());
        check_home(APP, &h).unwrap();
        h.animals.push("v1-4_5_6#1+v1-1_2_3#0".into());
        h.sig = hex::encode(sk(100).sign(home_msg(&h).as_bytes()).to_bytes());
        assert!(check_home(APP, &h).is_err(), "only canonical ids");
    }

    #[test]
    fn seeds() {
        for ok in ["v1-0_0_0", "v1-9999_9999_9", "v1-8393_2007_4", "v1-1_2_3.1", "v1-1_2_3.999999"] {
            assert!(is_star(ok), "{ok}");
        }
        for bad in ["v1-10000_0_0", "v1-01_0_0", "v1-1_2_10", "v1-1_2", "v2-1_2_3", "v1-abc", "v1--1_2_3", "v1-1_2_3_4", "", "v1-1_2_3.0", "v1-1_2_3.01", "v1-1_2_3.", "v1-1_2_3.1.2", "v1-1_2_3.1000000"] {
            assert!(!is_star(bad), "{bad}");
        }
    }
}
