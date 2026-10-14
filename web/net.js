// Web version of freenet/net.js (same exports, swapped in by vite.config.js with --mode web): the galaxy
// and chat live on our server (web/server.js, SQLite) instead of Freenet contracts. Records are signed
// exactly as on Freenet; there is no Viso here, explorers create or import a key kept in localStorage.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { chatMsg } from '../freenet/chat.js';
import { msg as colonyMsg, homeMsg, raidMsg, raidKey } from '../freenet/colony.js';
import { connectMessage } from '../freenet/connect.js';
export { personaName } from '../freenet/connect.js';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const { bytesToHex: hex, hexToBytes: unhex } = ed.etc;
const enc = new TextEncoder();
const BASE = new URL('./', location.href); // the server's APP_PATH

const listeners = [];
export const onUpdate = (f) => listeners.push(f);
new EventSource(new URL('api/events', BASE)).onmessage = () => listeners.forEach((f) => f());

async function call(what, delta) {
  const r = await fetch(new URL(`api/${what}`, BASE), delta && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(delta) });
  const out = await r.json();
  if (!r.ok) throw new Error(out.err ?? `server error ${r.status}`);
  return out;
}
export const loadGalaxy = () => call('galaxy');
export const loadChat = () => call('chat');
export const loadPersona = async () => null; // no Viso profiles here

const mem = new Map();
export async function storeGet(k) { try { return localStorage.getItem(`dw-${k}`); } catch { return mem.get(k) ?? null; } }
export async function storePut(k, v) { mem.set(k, v); try { localStorage.setItem(`dw-${k}`, v); } catch { /* memory only */ } }

// The app key signs records for the persona, which delegated to it once (the same proof Viso makes).
async function appSk() {
  if (!(await storeGet('sk'))) await storePut('sk', hex(ed.utils.randomPrivateKey()));
  return unhex(await storeGet('sk'));
}
const sign = async (m) => hex(ed.sign(enc.encode(m), await appSk()));

export async function session() {
  const raw = await storeGet('session');
  if (!raw) return null;
  const { persona, cert } = JSON.parse(raw);
  if (cert.challenge.split('.')[1] !== hex(ed.getPublicKey(await appSk()))) return null;
  return { persona, cert, sign };
}
async function signedIn() {
  const s = await session();
  if (!s) throw new Error('Sign in first.');
  return s;
}

export async function postMessage(text, world, nick, ante) {
  const s = await signedIn(), m = { persona: s.persona, nick, text, world, ts: Date.now(), ante, sig: '', cert: s.cert };
  m.sig = await s.sign(chatMsg(m));
  await call('chat', { messages: [m] });
  return m;
}
export async function publishColony(seed, { name, nick, x, nonces, ante }) {
  const s = await signedIn(), c = { persona: s.persona, name, nick, x: Math.round(x * 100), ts: Date.now(), nonces, ante, sig: '', cert: s.cert };
  c.sig = await s.sign(colonyMsg(seed, c));
  await call('galaxy', { colonies: { [seed]: c } });
  return c;
}
export async function publishHome({ nick, seed, built, animals, peace, ante }) {
  const s = await signedIn(), h = { persona: s.persona, nick, seed, built, animals, ts: Date.now(), ...(peace && { peace: true }), ante, sig: '', cert: s.cert };
  h.sig = await s.sign(homeMsg(h));
  await call('galaxy', { homes: { [s.persona]: h } });
  return h;
}
export async function publishRaid({ nick, target, day, nonces, ante }) {
  const s = await signedIn(), r = { attacker: s.persona, nick, target, day, nonces, ante, sig: '', cert: s.cert };
  r.sig = await s.sign(raidMsg(r));
  await call('galaxy', { raids: { [raidKey(r)]: r } });
  return r;
}
export async function block(secretHex, list, ts = Math.floor(Date.now() / 1000)) {
  const signList = (l) => ({ ts, list: l, sig: hex(ed.sign(enc.encode(`dwb1|${ts}|${l.join(',')}`), unhex(secretHex))) });
  await call('galaxy', { blocked: signList(list) });
  await call('chat', { blocked: signList(list.filter((x) => /^[0-9a-f]{64}$/.test(x))) });
}

export const startSignIn = null, finishSignIn = null; // Viso needs a Freenet node
export async function createLocalIdentity(secretHex) {
  const sk = secretHex ? unhex(secretHex) : ed.utils.randomPrivateKey(), persona = hex(ed.getPublicKey(sk));
  const cert = { base: BASE.href, challenge: `wd1.${hex(ed.getPublicKey(await appSk()))}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`, ts: Date.now(), sig: '' };
  cert.sig = hex(ed.sign(connectMessage(unhex(persona), cert.base, cert.challenge, cert.ts), sk));
  await storePut('persona-key', hex(sk));
  await storePut('session', JSON.stringify({ persona, cert }));
  return persona;
}
export async function localKey(persona) {
  const k = await storeGet('persona-key');
  return k && hex(ed.getPublicKey(unhex(k))) === persona ? k : null;
}
export const signOut = async () => { await storePut('session', ''); await storePut('persona-key', ''); };
