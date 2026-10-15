// The web server's rules (web/db.js) against records signed the way the client signs them.
import assert from 'node:assert/strict';
import * as ed from '@noble/ed25519';
import { open, isStar, anteLevel, isAnimal } from './db.js';
import { grindAnte } from '../freenet/viso.js';
import { connectMessage } from '../freenet/connect.js';
import { chatMsg, hereMsg } from '../freenet/chat.js';
import { homeMsg, raidMsg, raidKey, nameMsg, msg as colonyMsg, newMiner, mineSome, minerScore, MAX_SCORE, colonyLimit } from '../freenet/colony.js';

const { bytesToHex: hex } = ed.etc, enc = new TextEncoder();
const admin = new Uint8Array(32).fill(9), app = new Uint8Array(32).fill(7);
const db = open(':memory:', { admin: hex(ed.getPublicKey(admin)), app: '/' });
const sign = (m, k = app) => hex(ed.sign(enc.encode(m), k));
function explorer(seed) {
  const sk = new Uint8Array(32).fill(seed), persona = hex(ed.getPublicKey(sk));
  const cert = { base: 'http://localhost:8080/', challenge: `wd1.${hex(ed.getPublicKey(app))}.n${seed}`, ts: 1, sig: '' };
  cert.sig = hex(ed.sign(connectMessage(ed.getPublicKey(sk), cert.base, cert.challenge, cert.ts), sk));
  return { sk, persona, cert };
}
const a = explorer(1), b = explorer(2);
a.ante = hex(await grindAnte(a.sk, 20));
assert.ok(anteLevel(a.persona, a.ante) >= 20 && anteLevel(b.persona, a.ante) === 0);
assert.ok(isStar('v1-12_9999_3') && isStar('v1-1_2_3.7') && !isStar('v1-01_2_3') && !isStar('v1-1_2_3.0') && !isStar('v1-10000_1_1'));

// chat: signed messages go in, forgeries and personas without a level do not
const m = { persona: a.persona, nick: 'Ann', text: 'hello', world: 'v1-1_2_3@4.5', ts: 5, ante: a.ante, sig: '', cert: a.cert };
m.sig = sign(chatMsg(m));
db.applyChat({ messages: [m] });
assert.equal(Object.keys(JSON.parse(db.chat()).messages).length, 1);
assert.throws(() => db.applyChat({ messages: [{ ...m, text: 'forged', sig: sign(chatMsg({ ...m, text: 'forged' }), b.sk) }] }), /bad signature/);
const resign = (x) => ({ ...x, sig: sign(chatMsg(x)) });
// the chat is a live buffer: each persona keeps only its newest 3 messages
for (let ts = 100; ts < 105; ts++) db.applyChat({ messages: [resign({ ...m, text: `hi ${ts}`, ts })] });
assert.deepEqual(Object.values(JSON.parse(db.chat()).messages).map((x) => x.ts).sort(), [102, 103, 104]);
assert.throws(() => db.applyChat({ messages: [resign({ ...m, persona: b.persona, cert: b.cert })] }), /level too low/);
assert.throws(() => db.applyChat({ messages: [resign({ ...m, ts: 6, cert: { ...a.cert, base: 'http://x/other/' } })] }), /another app/);

// presence: one per persona, the newer one wins in any order; it needs a position and a signature
const here = (world, ts) => { const h = { persona: a.persona, nick: 'Ann', world, ts, ante: a.ante, sig: '', cert: a.cert }; h.sig = sign(hereMsg(h)); return h; };
db.applyChat({ here: [here('v1-1_2_3@6', 11)] });
db.applyChat({ here: [here('v1-1_2_3@4.5', 10)] });
assert.deepEqual(Object.values(JSON.parse(db.chat()).here).map((h) => h.world), ['v1-1_2_3@6']);
assert.throws(() => db.applyChat({ here: [here('v1-1_2_3', 12)] }), /bad presence/);
assert.throws(() => db.applyChat({ here: [{ ...here('v1-1_2_3@1', 12), world: 'v1-1_2_3@2' }] }), /bad signature/);

// homes: the newest signed one wins
const home = (ts) => { const h = { persona: a.persona, nick: 'Ann', seed: 'v1-1_2_3', built: [['house', 10]], animals: ['v1-4_5_6#1'], ts, ante: a.ante, sig: '', cert: a.cert }; h.sig = sign(homeMsg(h)); return h; };
db.applyGalaxy({ homes: { [a.persona]: home(20) } });
db.applyGalaxy({ homes: { [a.persona]: home(10) } });
assert.equal(JSON.parse(db.galaxy()).homes[a.persona].ts, 20);
assert.throws(() => db.applyGalaxy({ homes: { [a.persona]: { ...home(30), built: [['palace', 1]] } } }), /bad home fields/);
// a home may declare its whole size, within what that many parts and creatures could give
const sized = (ts, size) => { const h = { ...home(ts), size, sig: '' }; h.sig = sign(homeMsg(h)); return h; };
db.applyGalaxy({ homes: { [a.persona]: sized(25, [70, 1060, 563, 5000]) } });
assert.deepEqual(JSON.parse(db.galaxy()).homes[a.persona].size, [70, 1060, 563, 5000]);
assert.throws(() => db.applyGalaxy({ homes: { [a.persona]: sized(26, [70, 1060, 563, 16_000]) } }), /home too big/);
assert.throws(() => db.applyGalaxy({ homes: { [a.persona]: sized(26, [0, 1060, 0, 0]) } }), /home too big/); // fewer than listed
assert.throws(() => db.applyGalaxy({ homes: { [a.persona]: sized(26, [70, 1060, 1751, 5000]) } }), /home too big/); // more than upgraded domes house
assert.throws(() => db.applyGalaxy({ homes: { [a.persona]: { ...sized(26, [70, 1060, 563, 5000]), size: [70, 1060, 563, 5001] } } }), /bad signature/);

// colonies need the time spent (score under MAX_SCORE), and a whole delta fails together
const seed = 'v1-1_2_3', miner = newMiner();
while (minerScore(miner) === null || minerScore(miner) > MAX_SCORE) mineSome(miner, seed, a.persona, 200_000);
const c = { persona: a.persona, name: 'Nova', nick: 'Ann', x: 12, ts: 1, nonces: [...miner.nonces], ante: a.ante, sig: '', cert: a.cert };
c.sig = sign(colonyMsg(seed, c));
assert.throws(() => db.applyGalaxy({ colonies: { [seed]: c }, homes: { [a.persona]: { ...home(40), sig: '00' } } }));
assert.equal(JSON.parse(db.galaxy()).colonies[seed], undefined);
db.applyGalaxy({ colonies: { [seed]: c } });
assert.equal(JSON.parse(db.galaxy()).colonies[seed].name, 'Nova');
const weak = { ...c, nonces: Array(8).fill(0), ts: 2 };
weak.sig = sign(colonyMsg(seed, weak));
assert.throws(() => db.applyGalaxy({ colonies: { [seed]: weak } }), /not enough time/);

// a persona's next colony needs 1.5x the work: one at the minimum is dropped, one with enough work stays
const seed2 = 'v1-4_5_6', m2 = newMiner();
while (minerScore(m2) === null || minerScore(m2) > MAX_SCORE) mineSome(m2, seed2, a.persona, 200_000);
const c2 = (mi, ts) => { const x = { ...c, name: 'Second', nonces: [...mi.nonces], ts }; x.sig = sign(colonyMsg(seed2, x)); return x; };
db.applyGalaxy({ colonies: { [seed2]: c2(m2, 3) } });
const needsMore = minerScore(m2) > colonyLimit(1);
assert.equal(JSON.parse(db.galaxy()).colonies[seed2] === undefined, needsMore, 'a second colony needs 1.5x the work');
while (minerScore(m2) > colonyLimit(1)) mineSome(m2, seed2, a.persona, 200_000);
db.applyGalaxy({ colonies: { [seed2]: c2(m2, 4) } });
assert.equal(JSON.parse(db.galaxy()).colonies[seed2].name, 'Second');
assert.ok(JSON.parse(db.galaxy()).colonies[seed], 'the first colony stays');

// raids are keyed by attacker, target and day
const r = { attacker: a.persona, nick: 'Ann', target: b.persona, day: 20000, nonces: [...miner.nonces], ante: a.ante, sig: '', cert: a.cert };
assert.throws(() => db.applyGalaxy({ raids: { [raidKey(r)]: { ...r, sig: sign(raidMsg(r)) } } }), /siege too short/); // a colony's nonces are not a siege

// bred creatures live in homes (canonical ids only, as the contract), and the first name wins
assert.ok(isAnimal('(v1-1_2_3#0+v1-4_5_6#1)+v1-7_8_9.2#3') && !isAnimal('v1-4_5_6#1+v1-1_2_3#0') && !isAnimal('v1-01_2_3#0+v1-4_5_6#1'));
const bred = { ...home(50), animals: ['v1-1_2_3#0+v1-4_5_6#1'] };
bred.sig = sign(homeMsg(bred));
db.applyGalaxy({ homes: { [a.persona]: bred } });
assert.deepEqual(JSON.parse(db.galaxy()).homes[a.persona].animals, bred.animals);
const nm = (id, name, ts) => { const n = { persona: a.persona, nick: 'Ann', id, name, ts, ante: a.ante, sig: '', cert: a.cert }; n.sig = sign(nameMsg(n)); return n; };
db.applyGalaxy({ names: { 'v1-1_2_3~0': nm('v1-1_2_3~0', 'Moonleaf', 20) } });
db.applyGalaxy({ names: { 'v1-1_2_3~0': nm('v1-1_2_3~0', 'Later', 30) } });
db.applyGalaxy({ names: { 'v1-1_2_3~0': nm('v1-1_2_3~0', 'Earlier', 10) } });
assert.equal(JSON.parse(db.galaxy()).names['v1-1_2_3~0'].name, 'Earlier');
assert.throws(() => db.applyGalaxy({ names: { x: nm('x', 'Bad', 1) } }), /bad name/);
db.applyGalaxy({ names: { 'v1-1_2_3~1+v1-4_5_6~0': nm('v1-1_2_3~1+v1-4_5_6~0', 'Duskbell', 40) } }); // a hybrid plant
assert.throws(() => db.applyGalaxy({ names: { 'v1-4_5_6~0+v1-1_2_3~1': nm('v1-4_5_6~0+v1-1_2_3~1', 'Unsorted', 1) } }), /bad name/);

// the admin blocklist removes a persona everywhere
const bl = { ts: 3, list: [a.persona], sig: '' };
bl.sig = sign(`dwb2|galaxy|3|${a.persona}`, admin);
assert.throws(() => db.applyGalaxy({ blocked: { ...bl, sig: sign(`dwb2|galaxy|3|${a.persona}`) } }), /bad signature/);
assert.throws(() => db.applyChat({ blocked: bl }), /bad signature/); // a galaxy list cannot be replayed on the chat
db.applyGalaxy({ blocked: bl });
db.applyChat({ blocked: { ...bl, sig: sign(`dwb2|chat|3|${a.persona}`, admin) } });
const g = JSON.parse(db.galaxy());
assert.deepEqual([Object.keys(g.colonies).length, Object.keys(g.homes).length, Object.keys(g.names).length, Object.keys(JSON.parse(db.chat()).messages).length, Object.keys(JSON.parse(db.chat()).here).length], [0, 0, 0, 0, 0]);
console.log('web db ok');

// a delta is a few records, not thousands (web only)
assert.throws(() => db.applyGalaxy({ names: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, {}])) }), /delta too big/);
assert.throws(() => db.applyChat({ messages: Array.from({ length: 51 }, () => ({})) }), /delta too big/);
console.log('delta limits ok');
