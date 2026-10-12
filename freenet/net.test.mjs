import assert from 'node:assert/strict';
import { laneHash, score, newMiner, mineSome, minerScore, work, seconds, validText, MAX_SCORE, HASHES_PER_SECOND } from './colony.js';

// Same vector as contract/src/lib.rs (lane_hash_matches_ui).
const hex = (b) => Buffer.from(b).toString('hex');
assert.equal(hex(laneHash('v1-1_2_3', 'ab'.repeat(32), 5, 42)), 'c156661a5b0f0186153c7c20a30288ae1cff31fb5817d58a79ab886e09f0d997');

// Mining accumulates: the score only goes down, matches the contract's formula, and its work estimate
// tracks the hashes really spent.
const seed = 'v1-1_2_3', p = 'cd'.repeat(32), m = newMiner();
mineSome(m, seed, p, 8000);
const s1 = minerScore(m);
assert.equal(s1, score(seed, p, m.nonces));
mineSome(m, seed, p, 80000);
const s2 = minerScore(m);
assert.ok(s2 <= s1);
assert.ok(work(s2) > 88000 / 4 && work(s2) < 88000 * 4, `estimate ${work(s2)} vs 88000 real`);
assert.ok(s2 > MAX_SCORE, 'a few seconds of work is not a colony yet');
assert.ok(Math.abs(seconds(s2) - work(s2) / HASHES_PER_SECOND) < 1e-9);
// persisted miners survive JSON (BigInts are kept as strings)
const back = JSON.parse(JSON.stringify(m));
assert.equal(minerScore(mineSome(back, seed, p, 0)), s2);
assert.ok(!validText('a|b', 'x') && !validText(' a', 'x') && !validText('a', '') && validText('Nova Prime', 'scobru'));
console.log('colony ok, estimate', Math.round(work(s2)), 'for 88000 hashes');
