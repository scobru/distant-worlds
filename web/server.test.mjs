// The web server's own defences: security headers, rate limits and the cap on event streams.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-')), dist = path.join(dir, 'dist'), port = 20000 + Math.floor(Math.random() * 20000);
fs.mkdirSync(dist); fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>x</title>');
const srv = spawn('node', [new URL('./server.js', import.meta.url).pathname], { env: { ...process.env, PORT: String(port), DB: path.join(dir, 'db.sqlite'), DIST: dist, NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
try {
  await new Promise((ok, no) => { srv.stdout.once('data', ok); srv.once('exit', no); setTimeout(() => no(new Error('server did not start')), 5000); });
  const url = (p) => `http://127.0.0.1:${port}${p}`;

  const page = await fetch(url('/'));
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'.*frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(url('/../../etc/passwd'))).status, 404, 'no way out of the app folder');
  const api = await fetch(url('/api/galaxy'));
  assert.equal(api.status, 200); assert.ok(api.headers.get('content-security-policy'), 'the API carries them too');

  // posting: a burst gets through (and is refused as bad JSON), then the limit answers 429
  const post = (b = 'nope') => fetch(url('/api/chat'), { method: 'POST', body: b });
  const codes = []; for (let i = 0; i < 14; i++) codes.push((await post()).status);
  assert.deepEqual([codes.slice(0, 10).every((c) => c === 400), codes.slice(11).every((c) => c === 429)], [true, true], codes.join());
  const slow = await post(); assert.equal(slow.status, 429); assert.ok(Number(slow.headers.get('retry-after')) > 0);
  assert.equal((await post('x'.repeat(70_000))).status, 429, 'still limited, whatever the size');

  // event streams: 20 per client, the next is refused
  const open = () => new Promise((ok) => { const r = http.get(url('/api/events'), (res) => ok({ res, r })); r.on('error', () => {}); });
  const streams = []; for (let i = 0; i < 20; i++) streams.push(await open());
  assert.ok(streams.every((s) => s.res.statusCode === 200));
  const extra = await open(); assert.equal(extra.res.statusCode, 429); extra.r.destroy();
  streams.forEach((s) => s.r.destroy());
  console.log('web server ok');
} finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
