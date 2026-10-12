//! Distant Worlds global chat. Shared instance; parameters = admin ed25519 pubkey (32 bytes) || app path.
//!
//! A message is signed for a whoiam/viso persona by its delegated app key (as colonies are) and
//! carries a small proof of work against spam. It may share a world (a star seed, optionally with a
//! position). The state keeps the newest MAX_PER_PERSONA messages of each persona and the newest
//! MAX_MESSAGES overall (order: ts, then signature). Both are "keep the top k" rules, so every merge
//! order converges. There is no trusted clock: `ts` is the author's, and clients hide messages from the
//! future; the per-persona cap bounds what one persona can do with fake times. Admin-signed blocklist
//! (`dwb1|<ts>|<personas joined by ,>`) removes personas.
use freenet_stdlib::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use whoiam_delegation::{check, key, verify, Cert};

pub const POW_BITS: u32 = 16;
pub const MAX_MESSAGES: usize = 500;
pub const MAX_PER_PERSONA: usize = 20;
const MAX_TEXT: usize = 280;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Message {
    pub persona: String,
    pub nick: String,
    pub text: String,
    #[serde(default)]
    pub world: String, // "" or a shared world: star seed, optionally "@<position>"
    pub ts: u64,
    pub nonce: u64,
    pub sig: String, // hex, by the delegated app key over `msg()`
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
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Summary {
    pub sigs: BTreeSet<String>,
    pub blocked_ts: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Delta {
    #[serde(default)]
    pub messages: Vec<Message>,
    #[serde(default)]
    pub blocked: Option<Blocklist>,
}

type R<T> = Result<T, String>;

pub fn msg(m: &Message) -> String {
    format!("dwm1|{}|{}|{}|{}|{}", m.persona, m.nick, m.ts, m.world, m.text)
}

pub fn pow(m: &Message) -> [u8; 32] {
    Sha256::digest(format!("{}|{}", msg(m), m.nonce).as_bytes()).into()
}

fn zero_bits(h: &[u8]) -> u32 {
    let mut n = 0;
    for b in h {
        n += b.leading_zeros();
        if *b != 0 {
            break;
        }
    }
    n
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
    if zero_bits(&pow(m)) < POW_BITS {
        return Err("insufficient proof of work".into());
    }
    let app_key = check(&m.persona, app, &m.cert)?;
    verify(&app_key, msg(m).as_bytes(), &m.sig)
}

fn check_blocklist(admin: &str, b: &Blocklist) -> R<()> {
    if b.ts == 0 && b.list.is_empty() && b.sig.is_empty() {
        return Ok(());
    }
    if b.list.len() > 10_000 || !b.list.iter().all(|s| is_persona(s)) {
        return Err("bad blocklist".into());
    }
    verify(&key(admin)?, format!("dwb1|{}|{}", b.ts, b.list.join(",")).as_bytes(), &b.sig)
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
}

pub fn validate(admin: &str, app: &str, s: &ChatState) -> R<()> {
    check_blocklist(admin, &s.blocked)?;
    let mut copy = s.clone();
    prune(&mut copy);
    if copy.messages.len() != s.messages.len() || s.messages.values().any(|m| s.blocked.list.contains(&m.persona)) {
        return Err("state out of bounds".into());
    }
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
    let blocked = s.blocked.list.clone();
    s.messages.retain(|_, m| !blocked.contains(&m.persona));
    prune(s);
    Ok(())
}

pub fn summarize(s: &ChatState) -> Summary {
    Summary { sigs: s.messages.keys().cloned().collect(), blocked_ts: s.blocked.ts }
}

pub fn delta(s: &ChatState, sum: &Summary) -> Delta {
    Delta {
        messages: s.messages.iter().filter(|(k, _)| !sum.sigs.contains(*k)).map(|(_, m)| m.clone()).collect(),
        blocked: (s.blocked.ts > sum.blocked_ts).then(|| s.blocked.clone()),
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
                    Delta { messages: o.messages.into_values().collect(), blocked: Some(o.blocked) }
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
        let mut m = Message { persona: pk(persona), nick: "nick".into(), text: text.into(), world: world.into(), ts, nonce: 0, sig: String::new(), cert };
        while zero_bits(&pow(&m)) < POW_BITS {
            m.nonce += 1;
        }
        m.sig = hex::encode(app_key.sign(msg(&m).as_bytes()).to_bytes());
        m
    }
    fn send(s: &mut ChatState, m: Message) -> R<()> {
        apply(&pk(&sk(1)), APP, s, Delta { messages: vec![m], blocked: None })
    }

    #[test]
    fn pow_matches_ui() {
        // same vector as freenet/net.test.mjs
        let m = Message { persona: "ab".repeat(32), nick: "eve".into(), text: "hi".into(), world: "v1-1_2_3@4.5".into(), ts: 7, nonce: 42, sig: String::new(), cert: Cert { base: String::new(), challenge: String::new(), ts: 0, sig: String::new() } };
        assert_eq!(hex::encode(pow(&m)), "88c8eb07c01c6d3f95dc267e1134dd5b2ffd45820bc6ea64ec0f9bb2cfffb428");
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
        send(&mut s, good.clone()).unwrap();

        let list = vec![pk(&sk(2))];
        let sig = hex::encode(sk(1).sign(format!("dwb1|1|{}", list.join(",")).as_bytes()).to_bytes());
        apply(&pk(&sk(1)), APP, &mut s, Delta { messages: vec![], blocked: Some(Blocklist { ts: 1, list, sig }) }).unwrap();
        assert!(s.messages.is_empty());
        send(&mut s, good).unwrap();
        assert!(s.messages.is_empty());
    }
}
