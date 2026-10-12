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
//! names the planet and plants a beacon at `x`. Admin-signed blocklist hides stars or personas.
use freenet_stdlib::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use whoiam_delegation::{check, key, verify, Cert};

pub const LANES: usize = 8;
/// Minimum work for a colony. Work ≈ LANES² / (score / 2^64); 2^21 hashes give a mean score of 2^49,
/// so this bound (twice that) lets about 2^21 hashes (a few minutes on a planet) through almost always.
pub const MAX_SCORE: u128 = 1 << 50;
pub const MAX_COLONIES: usize = 20_000;
const GALAXY: u32 = 10_000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Colony {
    pub persona: String, // hex ed25519 pubkey
    pub name: String,    // the planet's name, chosen by the colonist
    pub nick: String,    // the colonist's display name (signed by them, not unique)
    pub x: i64,          // beacon position in hundredths of a screen
    pub ts: u64,         // self-declared (ms); only orders a colonist's own updates
    pub nonces: Vec<u64>,
    pub sig: String, // hex, by the delegated app key over `msg()`
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
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Summary {
    pub colonies: BTreeMap<String, (String, u64)>, // seed -> (score as decimal string, ts)
    pub blocked_ts: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Delta {
    #[serde(default)]
    pub colonies: BTreeMap<String, Colony>,
    #[serde(default)]
    pub blocked: Option<Blocklist>,
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

pub fn msg(seed: &str, c: &Colony) -> String {
    let n: Vec<String> = c.nonces.iter().map(u64::to_string).collect();
    format!("dwc1|{seed}|{}|{}|{}|{}|{}|{}", c.persona, c.name, c.nick, c.x, c.ts, n.join(","))
}

/// Total order: lower score first; for equal score, the newer update; then the signature.
fn rank(seed: &str, c: &Colony) -> (u128, std::cmp::Reverse<u64>, String) {
    (score(seed, c), std::cmp::Reverse(c.ts), c.sig.clone())
}

/// `v1-<x>_<y>_<n>` with x, y < GALAXY and n a single digit (sectors hold at most 9 stars).
pub fn is_star(seed: &str) -> bool {
    let Some(rest) = seed.strip_prefix("v1-") else { return false };
    let p: Vec<&str> = rest.split('_').collect();
    let num = |s: &str, max: u32| {
        !s.is_empty() && s.len() <= 4 && s.bytes().all(|b| b.is_ascii_digit()) && (s == "0" || !s.starts_with('0')) && s.parse::<u32>().is_ok_and(|v| v < max)
    };
    p.len() == 3 && num(p[0], GALAXY) && num(p[1], GALAXY) && num(p[2], 10)
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

pub fn validate(admin: &str, app: &str, s: &GalaxyState) -> R<()> {
    check_blocklist(admin, &s.blocked)?;
    if s.colonies.len() > MAX_COLONIES || s.colonies.iter().any(|(k, c)| blocked(&s.blocked, k, c)) {
        return Err("state out of bounds".into());
    }
    s.colonies.iter().try_for_each(|(k, c)| check_colony(app, k, c))
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
    let b = s.blocked.clone();
    s.colonies.retain(|k, c| !blocked(&b, k, c));
    prune(&mut s.colonies);
    Ok(())
}

pub fn summarize(s: &GalaxyState) -> Summary {
    Summary { colonies: s.colonies.iter().map(|(k, c)| (k.clone(), (score(k, c).to_string(), c.ts))).collect(), blocked_ts: s.blocked.ts }
}

pub fn delta(s: &GalaxyState, sum: &Summary) -> Delta {
    let better = |k: &String, c: &Colony| match sum.colonies.get(k) {
        None => true,
        Some((sc, ts)) => (score(k, c), std::cmp::Reverse(c.ts)) < (sc.parse().unwrap_or(u128::MAX), std::cmp::Reverse(*ts)),
    };
    Delta {
        colonies: s.colonies.iter().filter(|(k, c)| better(k, c)).map(|(k, c)| (k.clone(), c.clone())).collect(),
        blocked: (s.blocked.ts > sum.blocked_ts).then(|| s.blocked.clone()),
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
                    Delta { colonies: o.colonies, blocked: Some(o.blocked) }
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
        let mut c = Colony { persona: p, name: name.into(), nick: "nick".into(), x: 150, ts, nonces, sig: String::new(), cert };
        c.sig = hex::encode(app_key.sign(msg(seed, &c).as_bytes()).to_bytes());
        c
    }
    fn one(seed: &str, c: Colony) -> Delta {
        Delta { colonies: [(seed.into(), c)].into(), blocked: None }
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

        apply(&admin, APP, &mut s, one(seed, good.clone())).unwrap();
        let block = |k: &SigningKey, list: Vec<String>| {
            let sig = hex::encode(k.sign(format!("dwb1|1|{}", list.join(",")).as_bytes()).to_bytes());
            Blocklist { ts: 1, list, sig }
        };
        assert!(apply(&admin, APP, &mut s, Delta { colonies: Default::default(), blocked: Some(block(&sk(9), vec![seed.into()])) }).is_err());
        apply(&admin, APP, &mut s, Delta { colonies: Default::default(), blocked: Some(block(&sk(1), vec![pk(&sk(2))])) }).unwrap();
        assert!(s.colonies.is_empty());
        apply(&admin, APP, &mut s, one(seed, good)).unwrap(); // a blocked persona cannot come back
        assert!(s.colonies.is_empty());
        validate(&admin, APP, &s).unwrap();
    }

    #[test]
    fn seeds() {
        for ok in ["v1-0_0_0", "v1-9999_9999_9", "v1-8393_2007_4"] {
            assert!(is_star(ok), "{ok}");
        }
        for bad in ["v1-10000_0_0", "v1-01_0_0", "v1-1_2_10", "v1-1_2", "v2-1_2_3", "v1-abc", "v1--1_2_3", "v1-1_2_3_4", ""] {
            assert!(!is_star(bad), "{bad}");
        }
    }
}
