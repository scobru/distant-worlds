// Web version: the galaxy and chat contracts (contract/src/lib.rs, chat/src/lib.rs) as rules over a
// SQLite file, so a plain Node server can host the multiplayer game. Same signed records and checks
// (whoiam delegation, Viso level, proof of work), same merge rules; state JSON keeps the contracts' shape.
import { DatabaseSync } from 'node:sqlite';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { blake3 } from '@noble/hashes/blake3.js';
import { score, raidScore, raidKey, msg as colonyMsg, homeMsg, raidMsg, LANES, MAX_SCORE, COLONY_BITS } from '../freenet/colony.js';
import { chatMsg, MAX_TEXT, CHAT_BITS } from '../freenet/chat.js';
import { connectMessage } from '../freenet/connect.js';
import { cborDecode, anteBits } from '../freenet/viso.js';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const enc = new TextEncoder();
const BUILDINGS = ['house', 'windmill', 'longhouse', 'factory', 'temple', 'castle', 'tower', 'dome'];
const MAX = { colony: 20_000, home: 20_000, raid: 20_000 }, MAX_MESSAGES = 500, MAX_PER_PERSONA = 20;
const EMPTY_BLOCK = { ts: 0, list: [], sig: '' };

// ---------------------------------------------------------------- field checks (as in the contracts)
const fail = (m) => { throw new Error(m); };
const isPersona = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const isHex = (s) => typeof s === 'string' && s.length % 2 === 0 && /^[0-9a-f]*$/.test(s);
const uint = (n) => Number.isSafeInteger(n) && n >= 0;
const text = (s, max) => typeof s === 'string' && [...s].length > 0 && [...s].length <= max && s.trim() === s && !/[\p{Cc}|]/u.test(s);
const num = (s, max) => /^(0|[1-9][0-9]{0,5})$/.test(s) && Number(s) < max;
export function isStar(seed) {
  const m = typeof seed === 'string' && /^v1-([^.]*)(?:\.(.*))?$/.exec(seed);
  if (!m) return false;
  const p = m[1].split('_');
  return p.length === 3 && num(p[0], 10_000) && num(p[1], 10_000) && num(p[2], 10) && (m[2] === undefined || (m[2] !== '0' && num(m[2], 1_000_000)));
}
const isAnimal = (a) => typeof a === 'string' && /^(.+)#[0-9]{1,2}$/.test(a) && isStar(a.slice(0, a.lastIndexOf('#')));
const verify = (sig, m, pk) => { try { return ed.verify(sig, typeof m === 'string' ? enc.encode(m) : m, pk); } catch { return false; } };
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
export function checkHome(app, h) {
  if (!isPersona(h?.persona) || !isStar(h.seed) || !text(h.nick, 24) || !uint(h.ts) || (h.peace !== undefined && typeof h.peace !== 'boolean')) fail('bad home');
  if (!Array.isArray(h.built) || !Array.isArray(h.animals) || h.built.length > 64 || h.animals.length > 64) fail('home too big');
  if (!h.built.every((b) => Array.isArray(b) && b.length === 2 && BUILDINGS.includes(b[0]) && Number.isSafeInteger(b[1]) && Math.abs(b[1]) <= 1e9) || !h.animals.every(isAnimal)) fail('bad home fields');
  signed(app, h.persona, h.ante, COLONY_BITS, homeMsg(h), h.sig, h.cert);
  return { persona: h.persona, nick: h.nick, seed: h.seed, built: h.built, animals: h.animals, ts: h.ts, ...(h.peace && { peace: true }), ante: h.ante, sig: h.sig, cert: cert(h.cert) };
}
export function checkRaid(app, r) {
  if (!isPersona(r?.attacker) || !isPersona(r.target) || r.attacker === r.target || !text(r.nick, 24) || !uint(r.day) || !nonces(r.nonces)) fail('bad raid');
  if (raidScore(r) > MAX_SCORE) fail('siege too short');
  signed(app, r.attacker, r.ante, COLONY_BITS, raidMsg(r), r.sig, r.cert);
  return { attacker: r.attacker, nick: r.nick, target: r.target, day: r.day, nonces: r.nonces, ante: r.ante, sig: r.sig, cert: cert(r.cert) };
}
const worldOk = (w) => w === '' || (typeof w === 'string' && w.length <= 40 && /^v1-[0-9]{1,4}_[0-9]{1,4}_[0-9](@[-+0-9.]{1,12})?$/.test(w) && Number.isFinite(Number(w.split('@')[1] ?? 0)));
export function checkMessage(app, m) {
  const n = [...(m?.nick ?? '')].length, t = typeof m?.text === 'string' ? [...m.text].length : 0;
  if (!isPersona(m.persona) || t === 0 || t > MAX_TEXT || n === 0 || n > 24 || typeof m.nick !== 'string' || /[\p{Cc}|]/u.test(m.nick) || !uint(m.ts) || m.ts === 0 || !worldOk(m.world ?? '')) fail('bad message');
  if (/[\p{Cc}]/u.test(m.text.replaceAll('\n', ''))) fail('bad text');
  const world = m.world ?? '';
  signed(app, m.persona, m.ante, CHAT_BITS, chatMsg({ ...m, world }), m.sig, m.cert);
  return { persona: m.persona, nick: m.nick, text: m.text, world, ts: m.ts, ante: m.ante, sig: m.sig, cert: cert(m.cert) };
}
function checkBlocklist(admin, b, personasOnly) {
  if (!b || !uint(b.ts) || !Array.isArray(b.list) || b.list.length > 10_000 || !b.list.every((s) => isPersona(s) || (!personasOnly && isStar(s)))) fail('bad blocklist');
  if (!verify(b.sig, `dwb1|${b.ts}|${b.list.join(',')}`, admin)) fail('bad signature');
  return { ts: b.ts, list: b.list, sig: b.sig };
}

// Ranks, lower wins (as the contracts): colonies (score, newer, sig), raids (score, sig); homes: newer (ts, sig) wins.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const colonyRank = (seed, c) => [score(seed, c.persona, c.nonces), -c.ts, c.sig];
const lexi = (a, b) => a.reduce((r, x, i) => r || cmp(x, b[i]), 0);

// ---------------------------------------------------------------- the database
/** Open (or create) the database. `admin` signs blocklists; `app` is the path delegations are made for. */
export function open(file, { admin, app = '/' }) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS rows (kind TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (kind, k))');
  const getQ = db.prepare('SELECT v FROM rows WHERE kind = ? AND k = ?'), allQ = db.prepare('SELECT k, v FROM rows WHERE kind = ?');
  const putQ = db.prepare('INSERT OR REPLACE INTO rows (kind, k, v) VALUES (?, ?, ?)'), delQ = db.prepare('DELETE FROM rows WHERE kind = ? AND k = ?');
  const get = (kind, k) => { const r = getQ.get(kind, k); return r && JSON.parse(r.v); };
  const all = (kind) => allQ.all(kind).map((r) => [r.k, JSON.parse(r.v)]);
  const put = (kind, k, v) => putQ.run(kind, k, JSON.stringify(v));
  const cache = {};
  const tx = (name, f) => {
    db.exec('BEGIN');
    try { f(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    delete cache[name];
  };
  const blocklist = (k) => get('blocked', k) ?? EMPTY_BLOCK;
  const setBlocked = (k, b, personasOnly) => { if (b && b.ts > blocklist(k).ts) put('blocked', k, checkBlocklist(admin, b, personasOnly)); };
  // keep the `max` best rows of a kind, as the contracts' prune()
  const cap = (kind, order) => {
    const rows = all(kind);
    if (rows.length > MAX[kind]) rows.sort(order).slice(MAX[kind]).forEach(([k]) => delQ.run(kind, k));
  };

  return {
    galaxy: () => (cache.galaxy ??= JSON.stringify({
      colonies: Object.fromEntries(all('colony')), blocked: blocklist('galaxy'), homes: Object.fromEntries(all('home')), raids: Object.fromEntries(all('raid')),
    })),
    chat: () => (cache.chat ??= JSON.stringify({ messages: Object.fromEntries(all('msg')), blocked: blocklist('chat') })),

    /** contract apply(): a whole delta or nothing. */
    applyGalaxy(d) {
      tx('galaxy', () => {
        setBlocked('galaxy', d.blocked, false);
        const bl = new Set(blocklist('galaxy').list);
        for (const [seed, c] of Object.entries(d.colonies ?? {})) {
          if (bl.has(seed) || bl.has(c?.persona)) continue;
          const old = get('colony', seed), v = checkColony(app, seed, c);
          if (!old || lexi(colonyRank(seed, v), colonyRank(seed, old)) < 0) put('colony', seed, v);
        }
        for (const [p, h] of Object.entries(d.homes ?? {})) {
          if (p !== h?.persona || bl.has(p) || bl.has(h.seed)) continue;
          const old = get('home', p), v = checkHome(app, h);
          if (!old || lexi([v.ts, v.sig], [old.ts, old.sig]) > 0) put('home', p, v);
        }
        for (const [k, r] of Object.entries(d.raids ?? {})) {
          if (!r || k !== raidKey(r) || bl.has(r.attacker) || bl.has(r.target)) continue;
          const old = get('raid', k), v = checkRaid(app, r);
          if (!old || lexi([raidScore(v), v.sig], [raidScore(old), old.sig]) < 0) put('raid', k, v);
        }
        for (const [k, c] of all('colony')) if (bl.has(k) || bl.has(c.persona)) delQ.run('colony', k);
        for (const [k, h] of all('home')) if (bl.has(k) || bl.has(h.seed)) delQ.run('home', k);
        for (const [k, r] of all('raid')) if (bl.has(r.attacker) || bl.has(r.target)) delQ.run('raid', k);
        cap('colony', ([a, x], [b, y]) => lexi(colonyRank(a, x), colonyRank(b, y)));
        cap('home', ([, x], [, y]) => lexi([y.ts, y.sig], [x.ts, x.sig]));
        cap('raid', ([, x], [, y]) => lexi([-x.day, raidScore(x), x.sig], [-y.day, raidScore(y), y.sig]));
      });
    },

    applyChat(d) {
      tx('chat', () => {
        setBlocked('chat', d.blocked, true);
        const bl = new Set(blocklist('chat').list);
        for (const m of d.messages ?? []) {
          if (!m || bl.has(m.persona) || (typeof m.sig === 'string' && get('msg', m.sig))) continue;
          const v = checkMessage(app, m);
          put('msg', v.sig, v);
        }
        // blocked personas leave; newest MAX_PER_PERSONA per persona, newest MAX_MESSAGES overall
        const rows = all('msg').sort(([a, x], [b, y]) => cmp(y.ts, x.ts) || cmp(b, a)), per = {};
        let kept = 0;
        for (const [k, m] of rows) {
          per[m.persona] = (per[m.persona] ?? 0) + 1;
          if (bl.has(m.persona) || per[m.persona] > MAX_PER_PERSONA || ++kept > MAX_MESSAGES) delQ.run('msg', k);
        }
      });
    },
    close: () => db.close(),
  };
}
