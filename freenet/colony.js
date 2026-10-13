// Colony rules mirrored from contract/src/lib.rs, and the background "time miner".
import { sha256 } from '@noble/hashes/sha2.js';

export const LANES = 8;
export const MAX_SCORE = 1n << 50n;
/** Viso persona level needed to hold a colony (contract/src/lib.rs MIN_ANTE_BITS). */
export const COLONY_BITS = 20;
// The miner is throttled to this rate so that work measures time on the planet, not CPU speed.
// shortcut: an honest cap only; a modified client can mine faster. A trusted clock would be needed to stop that.
export const HASHES_PER_SECOND = 5000;
const enc = new TextEncoder();

export const laneHash = (seed, persona, lane, nonce) => sha256(enc.encode(`dwc1|${seed}|${persona}|${lane}|${nonce}`));
const top64 = (h) => h.slice(0, 8).reduce((a, b) => (a << 8n) | BigInt(b), 0n);
export const score = (seed, persona, nonces) => nonces.reduce((s, n, i) => s + top64(laneHash(seed, persona, i, n)), 0n);
/** Estimated hashes behind a score (LANES² / fraction), and the equivalent time at the honest rate. */
export const work = (sc) => (sc > 0n ? Number((BigInt(LANES * LANES) << 64n) / sc) : Infinity);
export const seconds = (sc) => work(sc) / HASHES_PER_SECOND;
export const msg = (seed, c) => `dwc1|${seed}|${c.persona}|${c.name}|${c.nick}|${c.x}|${c.ts}|${c.nonces.join(',')}`;
/** Home message, as contract/src/lib.rs home_msg(): buildings are [kind, x in hundredths]. */
export const homeMsg = (h) => `dwh1|${h.persona}|${h.nick}|${h.seed}|${h.ts}|${h.built.map(([k, x]) => `${k}:${x}`).join(',')}|${h.animals.join(',')}${h.peace ? '|peace' : ''}`;
/** Sieges (contract raid_hash / raid_msg): time spent on another explorer's home, bound to that home and the day. */
export const raidHash = (target, attacker, day, lane, nonce) => sha256(enc.encode(`dwr1|${target}|${attacker}|${day}|${lane}|${nonce}`));
export const raidScore = (r) => r.nonces.reduce((s, n, i) => s + top64(raidHash(r.target, r.attacker, r.day, i, n)), 0n);
export const raidMsg = (r) => `dwr1|${r.attacker}|${r.nick}|${r.target}|${r.day}|${r.nonces.join(',')}`;
export const raidKey = (r) => `${r.attacker}|${r.target}|${r.day}`;
/** Days since 1970 (UTC): a raid's day. */
export const today = (now = Date.now()) => Math.floor(now / 864e5);
const textOk = (s, max) => s.length > 0 && [...s].length <= max && s.trim() === s && !/[\u0000-\u001f\u007f|]/.test(s);
export const validText = (name, nick) => textOk(name, 32) && textOk(nick, 24);

/** Work kept per (planet, persona): the best nonce of each lane and how far each lane has searched. */
export const newMiner = () => ({ nonces: Array(LANES).fill(0), best: Array(LANES).fill(null), next: Array(LANES).fill(0) });

/** Spend `hashes` hashes, round-robin over the lanes. Mutates and returns the miner. */
export const mineSome = (m, seed, persona, hashes) => mineWith(m, (i, n) => laneHash(seed, persona, i, n), hashes);
export function mineWith(m, hash, hashes) {
  for (let k = 0; k < hashes; k++) {
    const i = k % LANES, n = m.next[i]++;
    const v = top64(hash(i, n));
    if (m.best[i] === null || v < BigInt(m.best[i])) { m.best[i] = v.toString(); m.nonces[i] = n; }
  }
  return m;
}
export const minerScore = (m) => (m.best.includes(null) ? null : m.best.reduce((s, b) => s + BigInt(b), 0n));
