// Freenet side: node connection, viso sign-in, per-app storage delegate and the galaxy contract
// (contract/src/lib.rs). Loaded only when a node serves the page (or with ?node=host:port in dev),
// so the static site needs neither a build nor a node. Sign-in and the delegate follow FreeNames.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { blake3 } from '@noble/hashes/blake3.js';
import {
  FreenetWsApi, ContractKey, ContractContainer, ContractType, WasmContractV1, PutRequest, GetRequest,
  UpdateRequest, UpdateData, UpdateDataType, DeltaUpdate, DelegateRequest,
} from '@freenetorg/freenet-stdlib';
import { ApplicationMessageT, ContractCodeT } from '@freenetorg/freenet-stdlib/common';
import {
  ApplicationMessagesT, ClientRequestT, ClientRequestType, DelegateCodeT, DelegateContainerT, DelegateKeyT,
  DelegateRequestType, DelegateType, InboundDelegateMsgT, InboundDelegateMsgType, RegisterDelegateT,
  RelatedContractsT, WasmDelegateV1T,
} from '@freenetorg/freenet-stdlib/client-request';
import galaxyWasm from './galaxy.wasm?url';
import chatWasm from './chat.wasm?url';
import { chatMsg, mineMessage } from './chat.js';
import identityWasm from './identity.wasm?url';
import { msg as colonyMsg } from './colony.js';
import { connectMessage } from './connect.js';
export { personaName } from './connect.js';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const { bytesToHex: hex, hexToBytes: unhex } = ed.etc;
const enc = new TextEncoder(), dec = new TextDecoder();
const bytes = (s) => Array.from(enc.encode(s));

// The galaxy address depends on this admin key and on the app path (its parameters). Same key as the
// FreeNames / FreeTunes admin; the signed messages are domain-separated (dwb1).
export const ADMIN = '4498bd4c2ab992afa152bc9b968e246cf70dc4fa5a670b23c33e73b8516ce9f3';
const APP_PATH = location.pathname; // in dev "/": a separate dev galaxy
const EMPTY = { colonies: {}, blocked: { ts: 0, list: [], sig: '' } };

// ---------------------------------------------------------------- node connection
const listeners = [], delegateWaiters = [];
export const onUpdate = (f) => listeners.push(f);

let apiP;
function api() {
  return (apiP ??= new Promise((resolve, reject) => {
    const node = new URLSearchParams(location.search).get('node');
    // In the node's shell the socket must go to the page's own origin.
    const url = new URL(node ? `ws://${node}/v1/contract/command` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/v1/contract/command`);
    const a = new FreenetWsApi(url, {
      onContractPut() {}, onContractGet() {}, onContractUpdate() {},
      onContractUpdateNotification: () => listeners.forEach((f) => f()),
      onDelegateResponse: (r) => delegateWaiters.shift()?.resolve(r),
      onContractNotFound: () => console.warn('contract not found'),
      onErr: (e) => console.error(e.cause),
      onOpen: () => resolve(a),
      onClose: () => {
        apiP = undefined;
        delegateWaiters.splice(0).forEach((w) => w.reject(new Error('socket closed')));
        reject(new Error('socket closed'));
      },
    }, '');
  }));
}

const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// get() responses are matched by arrival order: one at a time.
let chain = Promise.resolve();
const serial = (f) => { const p = chain.then(f); chain = p.catch(() => {}); return p; };

// ---------------------------------------------------------------- shared contracts
// Both contracts take the same parameters (admin key || app path) and start empty.
const params = () => new Uint8Array([...unhex(ADMIN), ...enc.encode(APP_PATH)]);
function shared(wasmUrl, empty) {
  let codeP;
  const code = () => (codeP ??= fetch(wasmUrl).then(async (r) => { const c = new Uint8Array(await r.arrayBuffer()); return { c, hash: blake3(c) }; }));
  /** Instance id = blake3(blake3(wasm) || params), as in freenet-stdlib. */
  const key = async () => { const { hash } = await code(); return new ContractKey(blake3(new Uint8Array([...hash, ...params()])), hash); };
  // A get on a missing contract and a put on an existing one can both hang until the SDK's 30 s
  // timeout, so: try a get for a few seconds, and only if it does not answer, create the contract.
  const put = async () => {
    const { c, hash } = await code(), k = await key();
    const contract = new WasmContractV1(new ContractCodeT(Array.from(c), Array.from(hash)), Array.from(params()), k);
    await (await api()).put(new PutRequest(new ContractContainer(ContractType.WasmContractV1, contract), bytes(JSON.stringify(empty)), new RelatedContractsT()));
  };
  const get = (ms = 30_000) => serial(async () => {
    const r = await within((await api()).get(new GetRequest(await key(), false, true)), ms);
    return JSON.parse(dec.decode(new Uint8Array(r.state)));
  });
  return {
    /** Current state; subscribing keeps it fresh. The first visitor on a node creates the contract. */
    async load() {
      try { return await get(5000); }
      catch { await within(put(), 5000).catch(() => {}); return get(); }
    },
    async send(delta) {
      const d = new UpdateData(UpdateDataType.DeltaUpdate, new DeltaUpdate(bytes(JSON.stringify(delta))));
      await (await api()).update(new UpdateRequest(await key(), d));
    },
  };
}
const galaxy = shared(galaxyWasm, EMPTY), chat = shared(chatWasm, { messages: {}, blocked: { ts: 0, list: [], sig: '' } });
export const loadGalaxy = () => galaxy.load();
export const loadChat = () => chat.load();
const send = (d) => galaxy.send(d);

/** Post a chat message (optionally sharing a world), signed for the signed-in persona. */
export async function postMessage(text, world, nick) {
  const s = await session();
  if (!s) throw new Error('Sign in first.');
  const m = await mineMessage({ persona: s.persona, nick, text, world, ts: Date.now(), nonce: 0, sig: '', cert: s.cert });
  m.sig = await s.sign(chatMsg(m));
  await chat.send({ messages: [m] });
  return m;
}

/** Publish (or update) our colony on `seed`: the miner's nonces, signed for the signed-in persona. */
export async function publishColony(seed, { name, nick, x, nonces }) {
  const s = await session();
  if (!s) throw new Error('Sign in first.');
  const c = { persona: s.persona, name, nick, x: Math.round(x * 100), ts: Date.now(), nonces, sig: '', cert: s.cert };
  c.sig = await s.sign(colonyMsg(seed, c));
  await send({ colonies: { [seed]: c } });
  return c;
}

/** Admin only: hide these stars or personas (replaces the whole blocklist); personas also leave the chat. */
export async function block(secretHex, list, ts = Math.floor(Date.now() / 1000)) {
  const sign = (l) => ({ ts, list: l, sig: hex(ed.sign(enc.encode(`dwb1|${ts}|${l.join(',')}`), unhex(secretHex))) });
  await send({ blocked: sign(list) });
  await chat.send({ blocked: sign(list.filter((x) => /^[0-9a-f]{64}$/.test(x))) });
}

// ---------------------------------------------------------------- identity delegate (from FreeNames)
// Keeps the app key and a small key/value store in the node, so they survive sessions even inside the
// sandboxed iframe where the page has no storage. If it is missing, fall back to localStorage, then memory.
let delegateKey, delegateChain = Promise.resolve();

// Every delegate request, registration included, gets one reply with no request id: one at a time.
function sendDelegate(req, timeoutMs = 8000) {
  const run = async () => {
    let waiter;
    const reply = new Promise((resolve, reject) => {
      waiter = { resolve, reject };
      delegateWaiters.push(waiter);
      setTimeout(() => { const i = delegateWaiters.indexOf(waiter); if (i >= 0) { delegateWaiters.splice(i, 1); reject(new Error('delegate timeout')); } }, timeoutMs);
    });
    (await api()).sendRequest(new ClientRequestT(ClientRequestType.DelegateRequest, req)); // the SDK has no delegate method yet
    return reply;
  };
  const p = delegateChain.then(run);
  delegateChain = p.catch(() => {});
  return p;
}

async function registerDelegate() {
  const c = new Uint8Array(await (await fetch(identityWasm)).arrayBuffer()), h = blake3(c);
  const k = new DelegateKeyT(Array.from(blake3(h)), Array.from(h));
  const container = new DelegateContainerT(DelegateType.WasmDelegateV1, new WasmDelegateV1T([], new DelegateCodeT(Array.from(c), Array.from(h)), k));
  // the node ignores cipher and nonce (secrets use a node-side key) but still checks their sizes
  await sendDelegate(new DelegateRequest(DelegateRequestType.RegisterDelegate, new RegisterDelegateT(container, new Array(32).fill(0), new Array(24).fill(0))));
  delegateKey = k;
}

async function callDelegate(payload) {
  const m = new InboundDelegateMsgT(InboundDelegateMsgType.common_ApplicationMessage, new ApplicationMessageT(bytes(JSON.stringify(payload)), [], false));
  const r = await sendDelegate(new DelegateRequest(DelegateRequestType.ApplicationMessages, new ApplicationMessagesT(delegateKey, [], [m])));
  // duck-typed: bundlers can duplicate the SDK classes, which breaks instanceof
  const reply = r.values.map((v) => v.inbound).find((x) => Array.isArray(x?.payload));
  if (!reply) throw new Error('empty delegate reply');
  const out = JSON.parse(dec.decode(new Uint8Array(reply.payload)));
  if (out.err) throw new Error(out.err);
  return out;
}

let delegateReady;
const hasDelegate = () => (delegateReady ??= registerDelegate().then(() => true, (e) => { console.warn('identity delegate unavailable, using local storage:', e); return false; }));

const mem = new Map();
const lsGet = (k) => { try { return localStorage.getItem(`dw-${k}`); } catch { return mem.get(k) ?? null; } };
const lsPut = (k, v) => { mem.set(k, v); try { localStorage.setItem(`dw-${k}`, v); } catch { /* sandbox: memory only */ } };
/** Small per-app store: the delegate when available, else localStorage, else memory. Keys: [A-Za-z0-9:-]. */
export async function storeGet(k) {
  if (await hasDelegate()) { try { const v = (await callDelegate({ op: 'get', key: k })).value; if (v != null) return v; } catch { /* use local */ } }
  return lsGet(k);
}
export async function storePut(k, v) {
  lsPut(k, v);
  if (await hasDelegate()) { try { await callDelegate({ op: 'put', key: k, value: v }); } catch (e) { console.warn('delegate store failed:', e); } }
}

// The app key: kept by the delegate (or locally), created on first use. Viso delegates it to act for a persona.
async function appKey() {
  if (await hasDelegate()) {
    try { return (await callDelegate({ op: 'pubkey' })).pk; }
    catch (e) { if (!/no identity/.test(String(e))) throw e; }
    return (await callDelegate({ op: 'init', sk: hex(ed.utils.randomPrivateKey()) })).pk;
  }
  if (!lsGet('sk')) lsPut('sk', hex(ed.utils.randomPrivateKey()));
  return hex(ed.getPublicKey(unhex(lsGet('sk'))));
}
const signApp = async (m) => ((await hasDelegate()) ? (await callDelegate({ op: 'sign', msg: m })).sig : hex(ed.sign(enc.encode(m), unhex(lsGet('sk')))));

// ---------------------------------------------------------------- session: a viso persona and its delegation
// Viso signs `wd1.<app key>.<nonce>` for this app's address: "this app key acts for me here".
const VISO_KEY = 'GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac';
export const visoUrl = () => `${location.protocol}//${location.host}/v1/contract/web/${VISO_KEY}/`;
const linkBase = () => `${location.protocol}//${location.host}${APP_PATH}`;

/** The signed-in persona, if its delegation still holds for this node's app key. */
export async function session() {
  const raw = await storeGet('session');
  if (!raw) return null;
  const { persona, cert } = JSON.parse(raw);
  if (cert.challenge.split('.')[1] !== (await appKey())) return null; // the app key changed: sign in again
  return { persona, cert, sign: signApp };
}

/** Send the user to Viso to pick a persona. Inside the node's shell, navigation goes through the shell. */
export async function startSignIn() {
  const challenge = `wd1.${await appKey()}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
  await storePut('signin-pending', challenge);
  const href = `${visoUrl()}?connect=v1&challenge=${challenge}&return=${encodeURIComponent(linkBase())}`;
  if (window.parent !== window) window.parent.postMessage({ __freenet_shell__: true, type: 'navigate', href }, '*');
  else location.href = href;
}

/** Viso's callback (?viso=ok&pk=…&sig=…&challenge=…&ts=…): check it, then keep the delegation. */
export async function finishSignIn(q) {
  if (q.get('viso') === 'denied') throw new Error('You chose not to share a persona.');
  const pending = await storeGet('signin-pending');
  await storePut('signin-pending', ''); // one use: burn it whatever happens next
  const persona = q.get('pk') ?? '', cert = { base: linkBase(), challenge: q.get('challenge') ?? '', ts: Number(q.get('ts')), sig: q.get('sig') ?? '' };
  if (!pending || cert.challenge !== pending) throw new Error('This sign-in is unknown or was already used. Start again.');
  if (!Number.isFinite(cert.ts) || Math.abs(Date.now() - cert.ts) > 10 * 60 * 1000) throw new Error('The proof is too old or the clock is off. Start again.');
  let ok = false;
  try { ok = ed.verify(unhex(cert.sig), connectMessage(unhex(persona), cert.base, cert.challenge, cert.ts), unhex(persona)); } catch { /* bad hex */ }
  if (!ok) throw new Error('Viso signature does not verify.');
  await storePut('session', JSON.stringify({ persona, cert }));
  return persona;
}

/** Without Viso: a new persona key made here signs the same proof Viso would. */
export async function createLocalIdentity() {
  const sk = ed.utils.randomPrivateKey(), persona = hex(ed.getPublicKey(sk));
  const cert = { base: linkBase(), challenge: `wd1.${await appKey()}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`, ts: Date.now(), sig: '' };
  cert.sig = hex(ed.sign(connectMessage(unhex(persona), cert.base, cert.challenge, cert.ts), sk));
  await storePut('session', JSON.stringify({ persona, cert }));
  return persona;
}
export const signOut = () => storePut('session', '');
