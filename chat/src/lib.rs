//! Distant Worlds global chat. Shared instance; parameters = admin ed25519 pubkey (32 bytes) || app path.
//!
//! A message is signed for a whoiam/viso persona by its delegated app key (as colonies are) and
//! carries the persona's Viso level (its `ante` slot, a self-signed proof of work; at least
//! MIN_ANTE_BITS) instead of a per-message proof: a persona that costs something to make is the
//! anti-spam. It may share a world (a star seed, optionally with a
//! position). The chat is live, not an archive: the state is only a small relay buffer, keeping the
//! newest MAX_PER_PERSONA messages of each persona and the newest MAX_MESSAGES overall (order: ts,
//! then signature); clients show only the last few minutes (CHAT_LIVE in freenet/chat.js). Both are "keep the top k" rules, so every merge
//! order converges. There is no trusted clock: `ts` is the author's, and clients hide messages from the
//! future; the per-persona cap bounds what one persona can do with fake times. Admin-signed blocklist
//! (`dwb2|chat|<ts>|<personas joined by ,>`) removes personas.
//!
//! Presence: each persona also keeps one `Here` record, where it is now (a star seed with a position),
//! signed like a message and replaced by its newer one (ts, then signature); the newest MAX_HERE are
//! kept. Clients show explorers whose presence is a couple of minutes old (HERE_LIVE in freenet/chat.js).
use freenet_stdlib::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use whoiam_delegation::{check, key, verify, Cert};

pub const MIN_ANTE_BITS: u32 = 16;
pub const MAX_MESSAGES: usize = 50;
pub const MAX_PER_PERSONA: usize = 3;
pub const MAX_HERE: usize = 100;
const MAX_TEXT: usize = 280;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Message {
    pub persona: String,
    pub nick: String,
    pub text: String,
    #[serde(default)]
    pub world: String, // "" or a shared world: star seed, optionally "@<position>"
    pub ts: u64,
    pub ante: String, // hex: the persona's Viso `ante` slot content
    pub sig: String,  // hex, by the delegated app key over `msg()`
    pub cert: Cert,
}

/// Where an explorer is now: `world` is `<seed>@<position>`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Here {
    pub persona: String,
    pub nick: String,
    pub world: String,
    pub ts: u64,
    pub ante: String,
    pub sig: String, // by the delegated app key over `here_msg()`
    pub cert: Cert,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Blocklist {
    pub ts: u64,
    pub list: Vec<String>,
    pub sig: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct ChatState {
    pub messages: BTreeMap<String, Message>, // sig -> message
    pub blocked: Blocklist,
    #[serde(default)]
    pub here: BTreeMap<String, Here>, // persona -> presence
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Summary {
    pub sigs: BTreeSet<String>,
    pub blocked_ts: u64,
    #[serde(default)]
    pub here: BTreeMap<String, u64>, // persona -> ts
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Delta {
    #[serde(default)]
    pub messages: Vec<Message>,
    #[serde(default)]
    pub blocked: Option<Blocklist>,
    #[serde(default)]
    pub here: Vec<Here>,
}

type R<T> = Result<T, String>;

pub fn msg(m: &Message) -> String {
    format!("dwm1|{}|{}|{}|{}|{}", m.persona, m.nick, m.ts, m.world, m.text)
}

pub fn here_msg(h: &Here) -> String {
    format!("dwp1|{}|{}|{}|{}", h.persona, h.nick, h.ts, h.world)
}


fn is_persona(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

/// "" or `v1-<x>_<y>_<n>` optionally followed by `@<decimal position>`.
fn world_ok(w: &str) -> bool {
    if w.is_empty() {
        return true;
    }
    let (seed, pos) = w.split_once('@').unwrap_or((w, ""));
    let p: Vec<&str> = seed.strip_prefix("v1-").unwrap_or("").split('_').collect();
    let num = |s: &str, l: usize| !s.is_empty() && s.len() <= l && s.bytes().all(|b| b.is_ascii_digit());
    w.len() <= 40
        && p.len() == 3
        && num(p[0], 4)
        && num(p[1], 4)
        && num(p[2], 1)
        && (pos.is_empty() || (pos.len() <= 12 && pos.parse::<f64>().is_ok_and(f64::is_finite) && !pos.contains(['e', 'E', 'i', 'n', 'N'])))
}

pub fn check_message(app: &str, m: &Message) -> R<()> {
    let t = m.text.chars().count();
    let n = m.nick.chars().count();
    if !is_persona(&m.persona) || t == 0 || t > MAX_TEXT || n == 0 || n > 24 || m.nick.contains('|') || m.nick.chars().any(char::is_control) || m.ts == 0 || !world_ok(&m.world) {
        return Err("bad message".into());
    }
    if m.text.chars().any(|c| c.is_control() && c != '\n') {
        return Err("bad text".into());
    }
    signed(app, &m.persona, &m.ante, &m.cert, &msg(m), &m.sig)
}

fn signed(app: &str, persona: &str, ante: &str, cert: &Cert, text: &str, sig: &str) -> R<()> {
    let ante = hex::decode(ante).map_err(|e| e.to_string())?;
    if viso_ante::verify_slot(&key(persona)?, &ante)? < MIN_ANTE_BITS {
        return Err("persona level too low".into());
    }
    let app_key = check(persona, app, cert)?;
    verify(&app_key, text.as_bytes(), sig)
}

pub fn check_here(app: &str, h: &Here) -> R<()> {
    let n = h.nick.chars().count();
    if !is_persona(&h.persona) || n == 0 || n > 24 || h.nick.contains('|') || h.nick.chars().any(char::is_control) || h.ts == 0 || !h.world.contains('@') || !world_ok(&h.world) {
        return Err("bad presence".into());
    }
    signed(app, &h.persona, &h.ante, &h.cert, &here_msg(h), &h.sig)
}

fn check_blocklist(admin: &str, b: &Blocklist) -> R<()> {
    if b.ts == 0 && b.list.is_empty() && b.sig.is_empty() {
        return Ok(());
    }
    if b.list.len() > 10_000 || !b.list.iter().all(|s| is_persona(s)) {
        return Err("bad blocklist".into());
    }
    verify(&key(admin)?, format!("dwb2|chat|{}|{}", b.ts, b.list.join(",")).as_bytes(), &b.sig)
}

/// Newest MAX_PER_PERSONA per persona, then newest MAX_MESSAGES overall.
/// shortcut: when the global cap is full and a persona later exceeds its own cap, a message already
/// evicted by the global cap is not brought back, so nodes can differ on the oldest messages; fine for
/// a chat that only shows recent history.
fn prune(s: &mut ChatState) {
    let mut by: BTreeMap<&str, Vec<(u64, &str)>> = BTreeMap::new();
    for (sig, m) in &s.messages {
        by.entry(&m.persona).or_default().push((m.ts, sig));
    }
    let mut drop: Vec<String> = Vec::new();
    for v in by.values_mut() {
        v.sort_by(|a, b| b.cmp(a));
        drop.extend(v.iter().skip(MAX_PER_PERSONA).map(|(_, s)| s.to_string()));
    }
    for sig in drop {
        s.messages.remove(&sig);
    }
    if s.messages.len() > MAX_MESSAGES {
        let mut all: Vec<(u64, String)> = s.messages.iter().map(|(sig, m)| (m.ts, sig.clone())).collect();
        all.sort_by(|a, b| b.cmp(a));
        for (_, sig) in all.into_iter().skip(MAX_MESSAGES) {
            s.messages.remove(&sig);
        }
    }
    if s.here.len() > MAX_HERE {
        let mut all: Vec<((u64, String), String)> = s.here.iter().map(|(p, h)| ((h.ts, h.sig.clone()), p.clone())).collect();
        all.sort_by(|a, b| b.cmp(a));
        for (_, p) in all.into_iter().skip(MAX_HERE) {
            s.here.remove(&p);
        }
    }
}

pub fn validate(admin: &str, app: &str, s: &ChatState) -> R<()> {
    check_blocklist(admin, &s.blocked)?;
    let mut copy = s.clone();
    prune(&mut copy);
    if copy.messages.len() != s.messages.len() || copy.here.len() != s.here.len() || s.messages.values().any(|m| s.blocked.list.contains(&m.persona)) || s.here.values().any(|h| s.blocked.list.contains(&h.persona)) {
        return Err("state out of bounds".into());
    }
    s.here.iter().try_for_each(|(p, h)| if *p == h.persona { check_here(app, h) } else { Err("bad key".into()) })?;
    s.messages.iter().try_for_each(|(sig, m)| if *sig == m.sig { check_message(app, m) } else { Err("bad key".into()) })
}

pub fn apply(admin: &str, app: &str, s: &mut ChatState, d: Delta) -> R<()> {
    if let Some(b) = d.blocked {
        if b.ts > s.blocked.ts {
            check_blocklist(admin, &b)?;
            s.blocked = b;
        }
    }
    for m in d.messages {
        if s.messages.contains_key(&m.sig) || s.blocked.list.contains(&m.persona) {
            continue;
        }
        check_message(app, &m)?;
        s.messages.insert(m.sig.clone(), m);
    }
    for h in d.here {
        if s.blocked.list.contains(&h.persona) || s.here.get(&h.persona).is_some_and(|old| (old.ts, &old.sig) >= (h.ts, &h.sig)) {
            continue;
        }
        check_here(app, &h)?;
        s.here.insert(h.persona.clone(), h);
    }
    let blocked = s.blocked.list.clone();
    s.messages.retain(|_, m| !blocked.contains(&m.persona));
    s.here.retain(|_, h| !blocked.contains(&h.persona));
    prune(s);
    Ok(())
}

pub fn summarize(s: &ChatState) -> Summary {
    Summary { sigs: s.messages.keys().cloned().collect(), blocked_ts: s.blocked.ts, here: s.here.iter().map(|(p, h)| (p.clone(), h.ts)).collect() }
}

pub fn delta(s: &ChatState, sum: &Summary) -> Delta {
    Delta {
        messages: s.messages.iter().filter(|(k, _)| !sum.sigs.contains(*k)).map(|(_, m)| m.clone()).collect(),
        blocked: (s.blocked.ts > sum.blocked_ts).then(|| s.blocked.clone()),
        here: s.here.iter().filter(|(p, h)| sum.here.get(*p).is_none_or(|ts| h.ts > *ts)).map(|(_, h)| h.clone()).collect(),
    }
}

// ---- Freenet glue ----

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
        let s: ChatState = de_or_default(state.as_ref())?;
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
        let mut s: ChatState = de_or_default(state.as_ref())?;
        for u in data {
            let d: Delta = match u {
                UpdateData::State(st) => {
                    let o: ChatState = de(st.as_ref())?;
                    Delta { messages: o.messages.into_values().collect(), blocked: Some(o.blocked), here: o.here.into_values().collect() }
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

    fn message(persona: &SigningKey, text: &str, world: &str, ts: u64) -> Message {
        let app_key = sk(100);
        let (base, challenge) = (format!("http://127.0.0.1:7509{APP}"), format!("wd1.{}.n1", pk(&app_key)));
        let csig = persona.sign(&connect_message(persona.verifying_key().as_bytes(), &base, &challenge, 1));
        let cert = Cert { base, challenge, ts: 1, sig: hex::encode(csig.to_bytes()) };
        let n = viso_ante::grind_step(&persona.verifying_key(), 0, u64::MAX, MIN_ANTE_BITS).unwrap();
        let ante = hex::encode(viso_ante::make_slot(persona, n, 1));
        let mut m = Message { persona: pk(persona), nick: "nick".into(), text: text.into(), world: world.into(), ts, ante, sig: String::new(), cert };
        m.sig = hex::encode(app_key.sign(msg(&m).as_bytes()).to_bytes());
        m
    }
    fn send(s: &mut ChatState, m: Message) -> R<()> {
        apply(&pk(&sk(1)), APP, s, Delta { messages: vec![m], blocked: None, here: vec![] })
    }

    #[test]
    fn messages_merge_and_caps_hold() {
        let admin = pk(&sk(1));
        let (a, b) = (message(&sk(2), "hello", "", 10), message(&sk(3), "look at this world", "v1-12_34_5@3.5", 11));
        let mut s1 = ChatState::default();
        validate(&admin, APP, &s1).unwrap();
        send(&mut s1, a.clone()).unwrap();
        send(&mut s1, b.clone()).unwrap();
        let mut s2 = ChatState::default();
        send(&mut s2, b.clone()).unwrap();
        send(&mut s2, a.clone()).unwrap();
        send(&mut s2, a.clone()).unwrap(); // duplicates are ignored
        assert_eq!(s1, s2);
        validate(&admin, APP, &s1).unwrap();
        assert!(delta(&s1, &summarize(&s1)).messages.is_empty());

        // one persona keeps only its newest MAX_PER_PERSONA messages, even with fake future times
        for i in 0..(MAX_PER_PERSONA as u64 + 5) {
            send(&mut s1, message(&sk(4), "spam", "", u64::MAX - i)).unwrap();
        }
        assert_eq!(s1.messages.values().filter(|m| m.persona == pk(&sk(4))).count(), MAX_PER_PERSONA);
        assert!(s1.messages.contains_key(&a.sig) && s1.messages.contains_key(&b.sig));
        validate(&admin, APP, &s1).unwrap();
    }

    fn here(persona: &SigningKey, world: &str, ts: u64) -> Here {
        let m = message(persona, "x", "", ts);
        let mut h = Here { persona: m.persona, nick: m.nick, world: world.into(), ts, ante: m.ante, sig: String::new(), cert: m.cert };
        h.sig = hex::encode(sk(100).sign(here_msg(&h).as_bytes()).to_bytes());
        h
    }

    #[test]
    fn presence_newest_wins_and_is_capped() {
        let admin = pk(&sk(1));
        let (old, new) = (here(&sk(2), "v1-1_2_3@4.5", 10), here(&sk(2), "v1-1_2_3@6", 11));
        let put = |s: &mut ChatState, h: Here| apply(&admin, APP, s, Delta { messages: vec![], blocked: None, here: vec![h] });
        let (mut s1, mut s2) = (ChatState::default(), ChatState::default());
        put(&mut s1, old.clone()).unwrap();
        put(&mut s1, new.clone()).unwrap();
        put(&mut s2, new.clone()).unwrap();
        put(&mut s2, old.clone()).unwrap(); // an older presence does not replace a newer one
        assert_eq!(s1, s2);
        assert_eq!(s1.here[&pk(&sk(2))].world, "v1-1_2_3@6");
        validate(&admin, APP, &s1).unwrap();
        assert!(delta(&s1, &summarize(&s1)).here.is_empty());
        assert_eq!(delta(&s1, &summarize(&ChatState::default())).here, vec![new.clone()]);

        assert!(put(&mut s1, here(&sk(3), "v1-1_2_3", 5)).is_err()); // no position
        let mut forged = here(&sk(3), "v1-1_2_3@1", 5);
        forged.world = "v1-1_2_3@2".into();
        assert!(put(&mut s1, forged).is_err());
        let mut lying = s1.clone();
        lying.here.insert(pk(&sk(9)), new.clone()); // filed under another persona
        assert!(validate(&admin, APP, &lying).is_err());

        for i in 0..(MAX_HERE as u8 + 3) {
            put(&mut s1, here(&sk(10 + i), "v1-1_2_3@0", 100 + i as u64)).unwrap();
        }
        assert_eq!(s1.here.len(), MAX_HERE);
        assert!(!s1.here.contains_key(&pk(&sk(2)))); // the oldest left
        validate(&admin, APP, &s1).unwrap();
    }

    #[test]
    fn rejects_bad_messages_and_blocks() {
        let mut s = ChatState::default();
        let good = message(&sk(2), "hi", "", 5);
        let mut forged = good.clone();
        forged.text = "changed".into();
        assert!(send(&mut s, forged).is_err());
        assert!(send(&mut s, message(&sk(2), "x", "not a seed", 5)).is_err());
        assert!(send(&mut s, message(&sk(2), &"x".repeat(281), "", 5)).is_err());
        assert!(check_message("/v1/contract/web/Other/", &good).is_err());
        let mut weak = good.clone();
        weak.ante = hex::encode(viso_ante::make_slot(&sk(2), 0, 1)); // nonce 0: almost surely < 16 bits
        assert!(check_message(APP, &weak).is_err());
        send(&mut s, good.clone()).unwrap();
        apply(&pk(&sk(1)), APP, &mut s, Delta { messages: vec![], blocked: None, here: vec![here(&sk(2), "v1-1_2_3@1", 5)] }).unwrap();

        let list = vec![pk(&sk(2))];
        let sig = hex::encode(sk(1).sign(format!("dwb2|chat|1|{}", list.join(",")).as_bytes()).to_bytes());
        apply(&pk(&sk(1)), APP, &mut s, Delta { messages: vec![], blocked: Some(Blocklist { ts: 1, list, sig }), here: vec![] }).unwrap();
        assert!(s.messages.is_empty() && s.here.is_empty());
        send(&mut s, good).unwrap();
        assert!(s.messages.is_empty());
    }
}
