// Web version: the galaxy and chat contracts (contract/src/lib.rs, chat/src/lib.rs) as rules over a
// SQLite file, so a plain Node server can host the multiplayer game. Same signed records and checks
// (whoiam delegation, Viso level, proof of work), same merge rules; state JSON keeps the contracts' shape.
// The checks themselves live in freenet/check.js, shared with the client.
import { DatabaseSync } from 'node:sqlite';
import { score, raidScore, raidKey, blockMsg, unfitSeeds, homeKey } from '../freenet/colony.js';
import { checkColony, checkHome, checkRaid, checkName, checkMessage, checkHere, isStar, isAnimal, anteLevel, isPersona, uint, fail, verify } from '../freenet/check.js';
export { isStar, isAnimal, anteLevel, checkColony, checkHome, checkRaid, checkName, checkMessage, checkHere };
// Web only (the contracts take whatever the network lets through): a delta carries a few records, not thousands,
// since each costs three signature checks and a pass over its table.
const MAX_DELTA = 50;
const tooBig = (d, keys) => { for (const k of keys) if (d[k] && Object.keys(d[k]).length > MAX_DELTA) fail('delta too big'); };
const MAX_CITIES = 8; // as the contract
const MAX = { colony: 20_000, home: 20_000, raid: 20_000, name: 50_000, here: 100 }, MAX_MESSAGES = 50, MAX_PER_PERSONA = 3;
const EMPTY_BLOCK = { ts: 0, list: [], sig: '' };

function checkBlocklist(admin, kind, b, personasOnly) {
  if (!b || !uint(b.ts) || !Array.isArray(b.list) || b.list.length > 10_000 || !b.list.every((s) => isPersona(s) || (!personasOnly && isStar(s)))) fail('bad blocklist');
  if (!verify(b.sig, blockMsg(kind, b.ts, b.list), admin)) fail('bad signature');
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
  const setBlocked = (k, b, personasOnly) => { if (b && b.ts > blocklist(k).ts) put('blocked', k, checkBlocklist(admin, k, b, personasOnly)); };
  // keep the `max` best rows of a kind, as the contracts' prune()
  const cap = (kind, order) => {
    const rows = all(kind);
    if (rows.length > MAX[kind]) rows.sort(order).slice(MAX[kind]).forEach(([k]) => delQ.run(kind, k));
  };

  return {
    galaxy: () => (cache.galaxy ??= JSON.stringify({
      colonies: Object.fromEntries(all('colony')), blocked: blocklist('galaxy'), homes: Object.fromEntries(all('home')), raids: Object.fromEntries(all('raid')), names: Object.fromEntries(all('name')),
    })),
    chat: () => (cache.chat ??= JSON.stringify({ messages: Object.fromEntries(all('msg')), blocked: blocklist('chat'), here: Object.fromEntries(all('here')) })),

    /** contract apply(): a whole delta or nothing. */
    applyGalaxy(d) {
      tooBig(d, ['colonies', 'homes', 'raids', 'names']);
      tx('galaxy', () => {
        setBlocked('galaxy', d.blocked, false);
        const bl = new Set(blocklist('galaxy').list);
        for (const [seed, c] of Object.entries(d.colonies ?? {})) {
          if (bl.has(seed) || bl.has(c?.persona)) continue;
          const old = get('colony', seed), v = checkColony(app, seed, c);
          if (!old || lexi(colonyRank(seed, v), colonyRank(seed, old)) < 0) put('colony', seed, v);
        }
        for (const [p, h] of Object.entries(d.homes ?? {})) {
          if (p !== homeKey(h ?? {}) || bl.has(h?.persona) || bl.has(h.seed)) continue;
          const old = get('home', p), v = checkHome(app, h);
          if (!old || lexi([v.ts, v.sig], [old.ts, old.sig]) > 0) put('home', p, v);
        }
        for (const [k, r] of Object.entries(d.raids ?? {})) {
          if (!r || k !== raidKey(r) || bl.has(r.attacker) || bl.has(r.target)) continue;
          const old = get('raid', k), v = checkRaid(app, r);
          if (!old || lexi([raidScore(v), v.sig], [raidScore(old), old.sig]) < 0) put('raid', k, v);
        }
        // names: the earliest (ts, then sig) wins
        for (const [k, n] of Object.entries(d.names ?? {})) {
          if (!n || k !== n.id || bl.has(n.persona)) continue;
          const old = get('name', k), v = checkName(app, n);
          if (!old || lexi([v.ts, v.sig], [old.ts, old.sig]) < 0) put('name', k, v);
        }
        for (const [k, n] of all('name')) if (bl.has(n.persona)) delQ.run('name', k);
        for (const [k, c] of all('colony')) if (bl.has(k) || bl.has(c.persona)) delQ.run('colony', k);
        for (const [k, h] of all('home')) if (bl.has(h.persona) || bl.has(h.seed)) delQ.run('home', k);
        // a persona keeps its MAX_CITIES newest cities (the contract's prune_homes)
        const cities = {};
        for (const [k, h] of all('home')) if (h.city) (cities[h.persona] ??= []).push([k, h]);
        for (const list of Object.values(cities)) list.sort(([, x], [, y]) => lexi([y.ts, y.sig], [x.ts, x.sig])).slice(MAX_CITIES).forEach(([k]) => delQ.run('home', k));
        for (const [k, r] of all('raid')) if (bl.has(r.attacker) || bl.has(r.target)) delQ.run('raid', k);
        // a persona holds only the colonies its work pays for (see colonyLimit)
        const held = {};
        for (const [k, c] of all('colony')) (held[c.persona] ??= []).push([k, score(k, c.persona, c.nonces)]);
        for (const list of Object.values(held)) for (const k of unfitSeeds(list)) delQ.run('colony', k);
        cap('colony', ([a, x], [b, y]) => lexi(colonyRank(a, x), colonyRank(b, y)));
        cap('home', ([, x], [, y]) => lexi([y.ts, y.sig], [x.ts, x.sig]));
        cap('name', ([, x], [, y]) => lexi([x.ts, x.sig], [y.ts, y.sig]));
        cap('raid', ([, x], [, y]) => lexi([-x.day, raidScore(x), x.sig], [-y.day, raidScore(y), y.sig]));
      });
    },

    applyChat(d) {
      tooBig(d, ['messages', 'here']);
      tx('chat', () => {
        setBlocked('chat', d.blocked, true);
        const bl = new Set(blocklist('chat').list);
        for (const m of d.messages ?? []) {
          if (!m || bl.has(m.persona) || (typeof m.sig === 'string' && get('msg', m.sig))) continue;
          const v = checkMessage(app, m);
          put('msg', v.sig, v);
        }
        // presence: one per persona, the newer (ts, sig) wins
        for (const h of d.here ?? []) {
          if (!h || bl.has(h.persona)) continue;
          const old = get('here', h.persona), v = checkHere(app, h);
          if (!old || lexi([v.ts, v.sig], [old.ts, old.sig]) > 0) put('here', v.persona, v);
        }
        for (const [k] of all('here')) if (bl.has(k)) delQ.run('here', k);
        cap('here', ([, x], [, y]) => lexi([y.ts, y.sig], [x.ts, x.sig]));
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
