// The rules a signed record must pass, as the contracts (contract/src/lib.rs, chat/src/lib.rs) apply them: field
// shapes, the whoiam delegation, the Viso level, the proof of work and the signature. Pure and free of node
// and browser imports: the web server (web/db.js) runs it on every record it takes, and the client (ui.js)
// runs it again on every record it is about to show, so a server that lies is caught by the explorers.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { score, raidScore, msg as colonyMsg, homeMsg, raidMsg, nameMsg, LANES, MAX_SCORE, COLONY_BITS } from './colony.js';
import { generation, parentsOf } from '../world.js';
import { chatMsg, hereMsg, MAX_TEXT, CHAT_BITS } from './chat.js';
import { connectMessage } from './connect.js';
import { cborDecode, anteBits } from './viso.js';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const enc = new TextEncoder();
const BUILDINGS = ['house', 'windmill', 'longhouse', 'factory', 'temple', 'castle', 'tower', 'dome'];
// ---------------------------------------------------------------- field checks (as in the contracts)
export const fail = (m) => { throw new Error(m); };
export const isPersona = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const isHex = (s) => typeof s === 'string' && s.length % 2 === 0 && /^[0-9a-f]*$/.test(s);
export const uint = (n) => Number.isSafeInteger(n) && n >= 0;
const text = (s, max) => typeof s === 'string' && [...s].length > 0 && [...s].length <= max && s.trim() === s && !/[\p{Cc}|]/u.test(s);
const num = (s, max) => /^(0|[1-9][0-9]{0,5})$/.test(s) && Number(s) < max;
export function isStar(seed) {
  const m = typeof seed === 'string' && /^v1-([^.]*)(?:\.(.*))?$/.exec(seed);
  if (!m) return false;
  const p = m[1].split('_');
  return p.length === 3 && num(p[0], 10_000) && num(p[1], 10_000) && num(p[2], 10) && (m[2] === undefined || (m[2] !== '0' && num(m[2], 1_000_000)));
}
const isKind = (a, sep) => typeof a === 'string' && new RegExp(`^(.+)${sep}[0-9]{1,2}$`).test(a) && isStar(a.slice(0, a.lastIndexOf(sep)));
// wild '<seed>#<k>' or bred (world.js bredId), as the contract's is_animal; plants '<seed>~<k>'
export const isAnimal = (a) => generation(a, (x) => isKind(x, '#')) >= 0;
// wild '<seed>~<k>', or two wild ones crossed at a mill (world.js crossPlant), as the contract's is_plant
const isPlant = (p) => isKind(p, '~') || (typeof p === 'string' && (parentsOf(p)?.every((x) => isKind(x, '~')) ?? false));
export const verify = (sig, m, pk) => { try { return ed.verify(sig, typeof m === 'string' ? enc.encode(m) : m, pk); } catch { return false; } };
const cat = (...p) => ed.etc.concatBytes(...p);
const u32le = (n) => new Uint8Array(new Uint32Array([n]).buffer), u64le = (n) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);

/** viso_ante::verify_slot: the persona's level from its signed `ante` proof, 0 if it is not valid. */
export function anteLevel(persona, anteHex) {
  try {
    const pk = ed.etc.hexToBytes(persona), b = ed.etc.hexToBytes(anteHex), p = cborDecode(b), purpose = enc.encode(p.purpose);
    const m = cat(enc.encode('ante:proof-signature:v1'), pk, u32le(purpose.length), purpose, u64le(p.nonce), u64le(p.ts));
    return verify(Uint8Array.from(p.signature), m, pk) ? anteBits(pk, b) : 0;
  } catch { return 0; }
}

/** whoiam_delegation::check: the app key the persona delegated to for this app path. */
function appKey(app, persona, c) {
  if (!c || typeof c.base !== 'string' || typeof c.challenge !== 'string' || !uint(c.ts) || !isHex(c.sig)) fail('bad certificate');
  if (/^https?:\/\/[^/]*(\/.*)$/.exec(c.base)?.[1] !== app) fail('certificate is for another app');
  const [pre, key, nonce, ...rest] = c.challenge.split('.');
  if (pre !== 'wd1' || !isPersona(key) || !nonce || rest.length) fail('not a delegation');
  if (!verify(c.sig, connectMessage(ed.etc.hexToBytes(persona), c.base, c.challenge, c.ts), persona)) fail('bad signature');
  return key;
}
const cert = (c) => ({ base: c.base, challenge: c.challenge, ts: c.ts, sig: c.sig });
function signed(app, persona, ante, bits, m, sig, c) {
  if (!isHex(ante) || anteLevel(persona, ante) < bits) fail('persona level too low');
  if (!isHex(sig) || !verify(sig, m, appKey(app, persona, c))) fail('bad signature');
}
const nonces = (n) => Array.isArray(n) && n.length === LANES && n.every(uint);

/** Each check returns the record with only its known fields, or throws. */
export function checkColony(app, seed, c) {
  if (!isStar(seed) || !isPersona(c?.persona)) fail('bad star or persona');
  if (!text(c.name, 32) || !text(c.nick, 24) || !nonces(c.nonces) || !Number.isSafeInteger(c.x) || Math.abs(c.x) > 1e9 || !uint(c.ts)) fail('bad colony fields');
  if (score(seed, c.persona, c.nonces) > MAX_SCORE) fail('not enough time spent on this planet');
  signed(app, c.persona, c.ante, COLONY_BITS, colonyMsg(seed, c), c.sig, c.cert);
  return { persona: c.persona, name: c.name, nick: c.nick, x: c.x, ts: c.ts, nonces: c.nonces, ante: c.ante, sig: c.sig, cert: cert(c.cert) };
}
// A declared size (contract size_ok): at least what is listed, no more people and points than that many parts and creatures could give.
const sizeOk = (h) => h.size === undefined || (Array.isArray(h.size) && h.size.length === 4 && h.size.every(uint) && (([b, c, p, pts]) =>
  b >= h.built.length && c >= h.animals.length && b <= 10_000 && c <= 100_000 && p <= 25 * b && pts <= 5 * p + 125 * b + 360 + 3 * c)(h.size));
export function checkHome(app, h) {
  if (!isPersona(h?.persona) || !isStar(h.seed) || !text(h.nick, 24) || !uint(h.ts) || (h.peace !== undefined && typeof h.peace !== 'boolean')) fail('bad home');
  if (!Array.isArray(h.built) || !Array.isArray(h.animals) || h.built.length > 64 || h.animals.length > 64 || !sizeOk(h)) fail('home too big');
  if (!h.built.every((b) => Array.isArray(b) && b.length === 2 && BUILDINGS.includes(b[0]) && Number.isSafeInteger(b[1]) && Math.abs(b[1]) <= 1e9) || !h.animals.every(isAnimal)) fail('bad home fields');
  signed(app, h.persona, h.ante, COLONY_BITS, homeMsg(h), h.sig, h.cert);
  return { persona: h.persona, nick: h.nick, seed: h.seed, built: h.built, animals: h.animals, ts: h.ts, ...(h.peace && { peace: true }), ...(h.size && { size: h.size }), ante: h.ante, sig: h.sig, cert: cert(h.cert) };
}
export function checkRaid(app, r) {
  if (!isPersona(r?.attacker) || !isPersona(r.target) || r.attacker === r.target || !text(r.nick, 24) || !uint(r.day) || !nonces(r.nonces)) fail('bad raid');
  if (raidScore(r) > MAX_SCORE) fail('siege too short');
  signed(app, r.attacker, r.ante, COLONY_BITS, raidMsg(r), r.sig, r.cert);
  return { attacker: r.attacker, nick: r.nick, target: r.target, day: r.day, nonces: r.nonces, ante: r.ante, sig: r.sig, cert: cert(r.cert) };
}
export function checkName(app, n) {
  if (!isPersona(n?.persona) || !text(n.nick, 24) || !text(n.name, 24) || !uint(n.ts) || !(isAnimal(n.id) || isPlant(n.id))) fail('bad name');
  signed(app, n.persona, n.ante, COLONY_BITS, nameMsg(n), n.sig, n.cert);
  return { persona: n.persona, nick: n.nick, id: n.id, name: n.name, ts: n.ts, ante: n.ante, sig: n.sig, cert: cert(n.cert) };
}
const worldOk = (w) => w === '' || (typeof w === 'string' && w.length <= 40 && /^v1-[0-9]{1,4}_[0-9]{1,4}_[0-9](@[-+0-9.]{1,12})?$/.test(w) && Number.isFinite(Number(w.split('@')[1] ?? 0)));
export function checkHere(app, h) {
  const n = [...(h?.nick ?? '')].length;
  if (!isPersona(h?.persona) || n === 0 || n > 24 || typeof h.nick !== 'string' || /[\p{Cc}|]/u.test(h.nick) || !uint(h.ts) || h.ts === 0 || typeof h.world !== 'string' || !h.world.includes('@') || !worldOk(h.world)) fail('bad presence');
  signed(app, h.persona, h.ante, CHAT_BITS, hereMsg(h), h.sig, h.cert);
  return { persona: h.persona, nick: h.nick, world: h.world, ts: h.ts, ante: h.ante, sig: h.sig, cert: cert(h.cert) };
}
export function checkMessage(app, m) {
  const n = [...(m?.nick ?? '')].length, t = typeof m?.text === 'string' ? [...m.text].length : 0;
  if (!isPersona(m.persona) || t === 0 || t > MAX_TEXT || n === 0 || n > 24 || typeof m.nick !== 'string' || /[\p{Cc}|]/u.test(m.nick) || !uint(m.ts) || m.ts === 0 || !worldOk(m.world ?? '')) fail('bad message');
  if (/[\p{Cc}]/u.test(m.text.replaceAll('\n', ''))) fail('bad text');
  const world = m.world ?? '';
  signed(app, m.persona, m.ante, CHAT_BITS, chatMsg({ ...m, world }), m.sig, m.cert);
  return { persona: m.persona, nick: m.nick, text: m.text, world, ts: m.ts, ante: m.ante, sig: m.sig, cert: cert(m.cert) };
}
