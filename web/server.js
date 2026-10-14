// Web version server: serves the built app (dist/, `npm run build:web`) and keeps the galaxy and the
// chat in SQLite (web/db.js). API: GET /api/galaxy, GET /api/chat (state JSON, as the contracts),
// POST the same paths with a delta, GET /api/events (server-sent events on every change).
// Env: PORT (8080), DB (distant-worlds.sqlite), DIST (dist), APP_PATH (/), ADMIN (blocklist key).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { open } from './db.js';

const ADMIN = process.env.ADMIN ?? '4498bd4c2ab992afa152bc9b968e246cf70dc4fa5a670b23c33e73b8516ce9f3'; // as freenet/net.js
const APP = process.env.APP_PATH ?? '/', DIST = path.resolve(process.env.DIST ?? 'dist');
const DB = path.resolve(process.env.DB ?? 'distant-worlds.sqlite');
let db;
try { fs.mkdirSync(path.dirname(DB), { recursive: true }); db = open(DB, { admin: ADMIN, app: APP }); }
catch (e) { console.error(`Cannot open the database ${DB} (${e.message}): its folder must exist and be writable by this process (uid ${process.getuid?.()}).`); process.exit(1); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const clients = new Set();
const notify = (what) => clients.forEach((res) => res.write(`data: ${what}\n\n`));

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { s += c; if (s.length > 256 * 1024) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(s)); } catch { reject(new Error('bad JSON')); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), send = (code, data, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(data); };
  const api = url.pathname.slice(APP.length - 1);
  if (api === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write(': hi\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const which = { '/api/galaxy': 'galaxy', '/api/chat': 'chat' }[api];
  if (which && req.method === 'GET') return send(200, db[which]());
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
// keep the event streams alive through proxies
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 25_000).unref();
server.listen(Number(process.env.PORT ?? 8080), () => console.log(`Distant Worlds on http://localhost:${server.address().port}${APP}`));
