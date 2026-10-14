// Web version server: serves the built app (dist/, `npm run build:web`) and keeps the galaxy and the
// chat in SQLite (web/db.js). API: GET /api/galaxy, GET /api/chat (state JSON, as the contracts),
// POST the same paths with a delta, GET /api/events (server-sent events on every change).
// Env: PORT (8080), DB (distant-worlds.sqlite), DIST (dist), APP_PATH (/), ADMIN (blocklist key), TRUST_PROXY (1: the
// rightmost X-Forwarded-For entry is the client, for a reverse proxy you control; otherwise the socket's address).
// Web only, not part of the contract: security headers, per-client rate limits, a cap on open event streams.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { open } from './db.js';

const ADMIN = process.env.ADMIN ?? '4498bd4c2ab992afa152bc9b968e246cf70dc4fa5a670b23c33e73b8516ce9f3'; // as freenet/net.js
const APP = process.env.APP_PATH ?? '/', DIST = path.resolve(process.env.DIST ?? 'dist');
const DB = path.resolve(process.env.DB ?? 'distant-worlds.sqlite');
let db;
try { fs.mkdirSync(path.dirname(DB), { recursive: true }); db = open(DB, { admin: ADMIN, app: APP }); }
catch (e) { console.error(`Cannot open the database ${DB} (${e.message}): its folder must exist and be writable by this process (uid ${process.getuid?.()}).`); process.exit(1); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const clients = new Set();
const notify = (what) => clients.forEach((res) => { // a client that does not read is dropped, not buffered without end
  if (res.writableLength > 64_000) { clients.delete(res); res.destroy(); } else res.write(`data: ${what}\n\n`);
});

// The page is one origin's own files: no other script, style or connection, no framing, no sniffing.
const SECURE = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'cross-origin-opener-policy': 'same-origin',
};
// Rate limits per client, a token bucket each: every record posted costs signature checks and a scan of its table.
const LIMITS = { post: [10, 30 / 60], get: [30, 120 / 60] }; // [burst, refill per second]
const buckets = new Map(), streams = new Map(), MAX_STREAMS = 2000, MAX_STREAMS_PER_CLIENT = 20;
const clientOf = (req) => (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim() : '') || req.socket.remoteAddress || '?';
function allow(who, kind, now = Date.now()) {
  const [burst, rate] = LIMITS[kind], b = buckets.get(who + kind) ?? { n: burst, t: now };
  b.n = Math.min(burst, b.n + ((now - b.t) / 1000) * rate); b.t = now;
  buckets.set(who + kind, b);
  return b.n-- >= 1;
}
setInterval(() => { const old = Date.now() - 10 * 60_000; for (const [k, b] of buckets) if (b.t < old) buckets.delete(k); }, 60_000).unref();
const gz = {}; // the state JSON, compressed once per change

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { s += c; if (s.length > 64 * 1024) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(s)); } catch { reject(new Error('bad JSON')); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), who = clientOf(req);
  const send = (code, data, type = 'application/json', extra = {}) => { res.writeHead(code, { 'content-type': type, ...SECURE, ...extra }); res.end(data); };
  const api = url.pathname.slice(APP.length - 1);
  if (api === '/api/events') {
    if (clients.size >= MAX_STREAMS || (streams.get(who) ?? 0) >= MAX_STREAMS_PER_CLIENT) return send(429, '{"err":"too many streams"}', 'application/json', { 'retry-after': '30' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...SECURE });
    res.write(': hi\n\n');
    clients.add(res); streams.set(who, (streams.get(who) ?? 0) + 1);
    req.on('close', () => { clients.delete(res); streams.set(who, (streams.get(who) ?? 1) - 1); if (!streams.get(who)) streams.delete(who); });
    return;
  }
  const which = { '/api/galaxy': 'galaxy', '/api/chat': 'chat' }[api];
  if (which && !allow(who, req.method === 'POST' ? 'post' : 'get')) return send(429, '{"err":"slow down"}', 'application/json', { 'retry-after': '10' });
  if (which && req.method === 'GET') {
    const json = db[which](); // cached by the database until the next change
    if (!/\bgzip\b/.test(req.headers['accept-encoding'] ?? '') || json.length < 1024) return send(200, json);
    if (gz[which]?.[0] !== json) gz[which] = [json, zlib.gzipSync(json)];
    return send(200, gz[which][1], 'application/json', { 'content-encoding': 'gzip', vary: 'accept-encoding' });
  }
  if (which && req.method === 'POST') {
    try {
      const d = await body(req);
      if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new Error('bad delta');
      which === 'galaxy' ? db.applyGalaxy(d) : db.applyChat(d);
      notify(which);
      return send(200, '{}');
    } catch (e) { return send(400, JSON.stringify({ err: e.message })); }
  }
  if (req.method !== 'GET' || !url.pathname.startsWith(APP)) return send(404, 'not found', 'text/plain');
  let file = '';
  try { file = path.resolve(DIST, '.' + decodeURIComponent(url.pathname.slice(APP.length - 1)).replace(/\/$/, '/index.html')); } catch { /* bad escape */ }
  if (!file.startsWith(DIST + path.sep)) return send(404, 'not found', 'text/plain');
  fs.readFile(file, (err, data) => (err ? send(404, 'not found', 'text/plain') : send(200, data, TYPES[path.extname(file)] ?? 'application/octet-stream')));
});
server.requestTimeout = 30_000; // a request that takes longer to arrive is dropped (slow clients tie up nothing)
server.headersTimeout = 15_000;
// keep the event streams alive through proxies
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 25_000).unref();
server.listen(Number(process.env.PORT ?? 8080), () => console.log(`Distant Worlds on http://localhost:${server.address().port}${APP}`));
