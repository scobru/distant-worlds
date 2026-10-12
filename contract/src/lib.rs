//! Distant Worlds star names. One shared instance; parameters = admin ed25519 pubkey (32 bytes).
//!
//! Anyone can name a star (a world seed `v1-<x>_<y>_<n>`) by attaching a proof-of-work over
//! `dw1|<seed>|<name>|<by>`. Freenet has no global clock, so "first to arrive" cannot be decided:
//! the strongest proof (lowest sha256) holds the name, and anyone can take it by working harder.
//! Keeping the minimum per star under a total order makes every merge order converge.
//! The admin can hide stars with a signed blocklist (`dwb1|<ts>|<seeds joined by ,>`).
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use freenet_stdlib::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const POW_BITS: u32 = 18;
pub const MAX_CLAIMS: usize = 20_000;
const MAX_NAME: usize = 32;
const MAX_BY: usize = 24;
const GALAXY: u32 = 10_000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Claim {
    pub name: String,
    pub by: String, // free-form nickname: not authenticated
    pub nonce: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Blocklist {
    pub ts: u64,
    pub list: Vec<String>,
    pub sig: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct NamesState {
    pub claims: BTreeMap<String, Claim>, // seed -> strongest claim
    pub blocked: Blocklist,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Summary {
    pub claims: BTreeMap<String, String>, // seed -> hex strength
    pub blocked_ts: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Delta {
    #[serde(default)]
    pub claims: BTreeMap<String, Claim>,
    #[serde(default)]
    pub blocked: Option<Blocklist>,
}

type R<T> = Result<T, String>;

/// sha256 of the claim; lower is stronger.
pub fn strength(seed: &str, c: &Claim) -> [u8; 32] {
    Sha256::digest(format!("dw1|{seed}|{}|{}|{}", c.name, c.by, c.nonce).as_bytes()).into()
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

/// `v1-<x>_<y>_<n>` with x, y < GALAXY and n a single digit (sectors hold at most 9 stars).
pub fn is_star(seed: &str) -> bool {
    let Some(rest) = seed.strip_prefix("v1-") else { return false };
    let p: Vec<&str> = rest.split('_').collect();
    let num = |s: &str, max: u32| !s.is_empty() && s.len() <= 4 && s.bytes().all(|b| b.is_ascii_digit()) && (s == "0" || !s.starts_with('0')) && s.parse::<u32>().is_ok_and(|v| v < max);
    p.len() == 3 && num(p[0], GALAXY) && num(p[1], GALAXY) && num(p[2], 10)
}

fn text_ok(s: &str, max: usize) -> bool {
    let n = s.chars().count();
    n > 0 && n <= max && s.trim() == s && !s.chars().any(|c| c.is_control() || c == '|')
}

pub fn check_claim(seed: &str, c: &Claim) -> R<()> {
    if !is_star(seed) {
        return Err("not a star seed".into());
    }
    if !text_ok(&c.name, MAX_NAME) || !text_ok(&c.by, MAX_BY) {
        return Err("bad name or nickname".into());
    }
    if zero_bits(&strength(seed, c)) < POW_BITS {
        return Err("insufficient proof of work".into());
    }
    Ok(())
}

fn check_blocklist(admin: &[u8], b: &Blocklist) -> R<()> {
    if b.ts == 0 && b.list.is_empty() && b.sig.is_empty() {
        return Ok(()); // initial empty state
    }
    if b.list.len() > 10_000 || !b.list.iter().all(|s| is_star(s)) {
        return Err("bad blocklist".into());
    }
    let key = VerifyingKey::from_bytes(admin.try_into().map_err(|_| "admin key must be 32 bytes")?).map_err(|e| e.to_string())?;
    let sig = Signature::from_slice(&hex::decode(&b.sig).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    key.verify(format!("dwb1|{}|{}", b.ts, b.list.join(",")).as_bytes(), &sig).map_err(|_| "bad signature".into())
}

/// Keep the MAX_CLAIMS strongest claims; deterministic, so merge order does not matter.
fn prune(claims: &mut BTreeMap<String, Claim>) {
    if claims.len() <= MAX_CLAIMS {
        return;
    }
    let mut order: Vec<_> = claims.iter().map(|(s, c)| (strength(s, c), s.clone())).collect();
    order.sort();
    for (_, s) in order.into_iter().skip(MAX_CLAIMS) {
        claims.remove(&s);
    }
}

pub fn validate(admin: &[u8], s: &NamesState) -> R<()> {
    check_blocklist(admin, &s.blocked)?;
    if s.claims.len() > MAX_CLAIMS || s.claims.keys().any(|k| s.blocked.list.contains(k)) {
        return Err("state out of bounds".into());
    }
    s.claims.iter().try_for_each(|(k, c)| check_claim(k, c))
}

pub fn apply(admin: &[u8], s: &mut NamesState, d: Delta) -> R<()> {
    if let Some(b) = d.blocked {
        if b.ts > s.blocked.ts {
            check_blocklist(admin, &b)?;
            s.blocked = b;
        }
    }
    for (seed, c) in d.claims {
        if s.blocked.list.contains(&seed) || s.claims.get(&seed).is_some_and(|old| strength(&seed, old) <= strength(&seed, &c)) {
            continue; // blocked or not stronger: ignore, so every merge order converges
        }
        check_claim(&seed, &c)?;
        s.claims.insert(seed, c);
    }
    let blocked = s.blocked.list.clone();
    s.claims.retain(|k, _| !blocked.contains(k));
    prune(&mut s.claims);
    Ok(())
}

pub fn summarize(s: &NamesState) -> Summary {
    Summary { claims: s.claims.iter().map(|(k, c)| (k.clone(), hex::encode(strength(k, c)))).collect(), blocked_ts: s.blocked.ts }
}

pub fn delta(s: &NamesState, sum: &Summary) -> Delta {
    Delta {
        claims: s
            .claims
            .iter()
            .filter(|(k, c)| sum.claims.get(*k).is_none_or(|h| hex::encode(strength(k, c)) < *h))
            .map(|(k, c)| (k.clone(), c.clone()))
            .collect(),
        blocked: (s.blocked.ts > sum.blocked_ts).then(|| s.blocked.clone()),
    }
}

// ---- Freenet glue ----

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
        let s: NamesState = de_or_default(state.as_ref())?;
        Ok(match validate(parameters.as_ref(), &s) {
            Ok(()) => ValidateResult::Valid,
            Err(_) => ValidateResult::Invalid,
        })
    }

    fn update_state(
        parameters: Parameters<'static>,
        state: State<'static>,
        data: Vec<UpdateData<'static>>,
    ) -> Result<UpdateModification<'static>, ContractError> {
        let mut s: NamesState = de_or_default(state.as_ref())?;
        for u in data {
            let d: Delta = match u {
                UpdateData::State(st) => {
                    let o: NamesState = de(st.as_ref())?;
                    Delta { claims: o.claims, blocked: Some(o.blocked) }
                }
                UpdateData::Delta(d) => de(d.as_ref())?,
                UpdateData::StateAndDelta { delta, .. } => de(delta.as_ref())?,
                _ => return Err(ContractError::InvalidUpdate),
            };
            apply(parameters.as_ref(), &mut s, d).map_err(|_| ContractError::InvalidUpdate)?;
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

    /// Mine a claim at least `bits` strong.
    fn claim(seed: &str, name: &str, by: &str, bits: u32) -> Claim {
        let mut c = Claim { name: name.into(), by: by.into(), nonce: 0 };
        while zero_bits(&strength(seed, &c)) < bits {
            c.nonce += 1;
        }
        c
    }
    fn one(seed: &str, c: Claim) -> Delta {
        Delta { claims: [(seed.into(), c)].into(), blocked: None }
    }
    fn block(admin: &SigningKey, ts: u64, list: &[&str]) -> Blocklist {
        let list: Vec<String> = list.iter().map(|s| s.to_string()).collect();
        let sig = hex::encode(admin.sign(format!("dwb1|{ts}|{}", list.join(",")).as_bytes()).to_bytes());
        Blocklist { ts, list, sig }
    }

    #[test]
    fn strength_matches_ui() {
        // same vector as freenet/net.test.mjs
        let c = Claim { name: "Vega".into(), by: "eve".into(), nonce: 42 };
        assert_eq!(hex::encode(strength("v1-1_2_3", &c)), "8e798aba81f332e1ab872bcf809f173bd3289bb90b73ac1b601236283494fa37");
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

    #[test]
    fn strongest_claim_wins_in_any_order() {
        let admin = SigningKey::from_bytes(&[1; 32]);
        let a = admin.verifying_key().to_bytes();
        let seed = "v1-12_34_5";
        let weak = claim(seed, "Aurora", "ann", POW_BITS);
        let strong = claim(seed, "Bellatrix", "bob", POW_BITS + 3);
        let (ws, ss) = (strength(seed, &weak), strength(seed, &strong));
        let (lo, hi) = if ws < ss { (weak.clone(), strong.clone()) } else { (strong.clone(), weak.clone()) };

        let mut s1 = NamesState::default();
        validate(&a, &s1).unwrap(); // empty initial state
        apply(&a, &mut s1, one(seed, weak.clone())).unwrap();
        apply(&a, &mut s1, one(seed, strong.clone())).unwrap();
        let mut s2 = NamesState::default();
        apply(&a, &mut s2, one(seed, strong)).unwrap();
        apply(&a, &mut s2, one(seed, weak)).unwrap();
        assert_eq!(s1, s2);
        assert_eq!(s1.claims[seed], lo);
        // the weaker one is ignored, not an error
        apply(&a, &mut s1, one(seed, hi)).unwrap();
        assert_eq!(s1.claims[seed], lo);
        validate(&a, &s1).unwrap();

        // delta vs summary
        let d = delta(&s1, &Summary::default());
        assert!(d.claims.contains_key(seed));
        assert!(delta(&s1, &summarize(&s1)).claims.is_empty());
    }

    #[test]
    fn rejects_bad_claims_and_honours_blocklist() {
        let admin = SigningKey::from_bytes(&[1; 32]);
        let a = admin.verifying_key().to_bytes();
        let mut s = NamesState::default();
        let seed = "v1-1_1_1";
        let good = claim(seed, "Vega", "eve", POW_BITS);

        let mut forged = good.clone();
        forged.name = "Not mined".into(); // proof no longer matches (fails with probability 2^-18)
        assert!(apply(&a, &mut s, one(seed, forged)).is_err());
        assert!(apply(&a, &mut s, one("v1-abc", claim("v1-abc", "X", "x", POW_BITS))).is_err());
        assert!(apply(&a, &mut s, one(seed, claim(seed, "bad|name", "eve", POW_BITS))).is_err());
        assert!(apply(&a, &mut s, one(seed, claim(seed, " padded", "eve", POW_BITS))).is_err());

        apply(&a, &mut s, one(seed, good.clone())).unwrap();
        let fake = block(&SigningKey::from_bytes(&[9; 32]), 1, &[seed]);
        assert!(apply(&a, &mut s, Delta { claims: Default::default(), blocked: Some(fake) }).is_err());
        apply(&a, &mut s, Delta { claims: Default::default(), blocked: Some(block(&admin, 1, &[seed])) }).unwrap();
        assert!(s.claims.is_empty());
        apply(&a, &mut s, one(seed, good)).unwrap(); // a blocked star cannot be named again
        assert!(s.claims.is_empty());
        validate(&a, &s).unwrap();

        // a blocklist signed by the UI (freenet/net.js, @noble/ed25519) verifies here
        let ui = Blocklist { ts: 1, list: vec!["v1-1_1_1".into()], sig: "b2c9c54659618481fdcc5ff7ffd6f860c9f8f6127b2d59ea4602d2d6fe187bc398514a0de165809004da472162a1267719019c4cacf5d6584d63649f9c005406".into() };
        check_blocklist(&a, &ui).unwrap();
    }
}
