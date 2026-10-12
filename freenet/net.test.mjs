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
// Viso proof: whoiam's golden vector (common/src/connect.rs) and base58 (computed independently, see FreeNames).
const ed = await import('@noble/ed25519'), { sha512 } = await import('@noble/hashes/sha2.js');
ed.etc.sha512Sync = (...x) => sha512(ed.etc.concatBytes(...x));
const { connectMessage, personaName } = await import('./connect.js');
const gsk = new Uint8Array(32).fill(42);
assert.equal(hex(ed.sign(connectMessage(ed.getPublicKey(gsk), 'https://example.com/app', 'abc123', 12345), gsk)),
  '122b675bdbc8772f52631524ac2b500dec76721bff7c0b299025df04e18e8e8ddf2b8d0a232a5785e68d5738be4f5111ae7b58106f5458b966b9b365fff5ac09');
assert.equal(personaName('2a76f1666f3aac4f859a1f35300050b69275202d3b880d9f165083c92818b0b5'), '3rmKPdMLRKZPKpEc2UThti8k4EdxzsAH3j7eWx8GhqYY');

// Chat: message text rules.
const { textOk } = await import('./chat.js');
assert.ok(textOk('hi\nthere') && !textOk('') && !textOk('x'.repeat(281)) && !textOk('bell\u0007'));
console.log('colony ok, estimate', Math.round(work(s2)), 'for 88000 hashes');

// Viso: vectors made with viso-core / viso-ante (freenet/viso.vector.json, see the README).
{
  const fs = await import('node:fs');
  const v = JSON.parse(fs.readFileSync(new URL('./viso.vector.json', import.meta.url)));
  const { identityParams, identityInstance, readPersona, anteBits, slotOk, cborDecode } = await import('./viso.js');
  const pk = Buffer.from(v.pk, 'hex');
  assert.equal(hex(identityParams(pk)), v.params);
  // the contract id freenet-stdlib derives from viso's wasm and these params
  const { personaName } = await import('./connect.js');
  assert.equal(personaName(hex(identityInstance(pk))), v.instance);
  const p = readPersona(v.pk, Buffer.from(v.state, 'hex'));
  assert.equal(p.name, 'Vega'); assert.equal(p.bio, 'explorer');
  assert.equal(p.avatar.length, 11);
  assert.equal(p.bits, v.bits);
  assert.equal(anteBits(pk, Buffer.from(v.ante, 'hex')), v.bits);
  // a tampered slot is dropped
  const st = cborDecode(Buffer.from(v.state, 'hex'));
  assert.ok(slotOk(pk, 'profile', st.slots.profile) && !slotOk(pk, 'avatar', st.slots.profile));
  assert.equal(anteBits(Buffer.alloc(32, 1), Buffer.from(v.ante, 'hex')), 0, 'another persona\'s proof counts for nothing');
  console.log('viso ok, level', p.bits, 'bits');
}
