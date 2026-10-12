// Freenet side: the shared star-name registry (contract/src/lib.rs). Loaded only when the page
// is served by a Freenet node (or with ?node=host:port in dev), so the static site needs no build.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { blake3 } from '@noble/hashes/blake3.js';
import {
  FreenetWsApi, ContractKey, ContractContainer, ContractType, WasmContractV1, PutRequest, GetRequest,
  UpdateRequest, UpdateData, UpdateDataType, DeltaUpdate,
} from '@freenetorg/freenet-stdlib';
import { ContractCodeT } from '@freenetorg/freenet-stdlib/common';
import { RelatedContractsT } from '@freenetorg/freenet-stdlib/client-request';
import namesWasm from './names.wasm?url';
import { mine } from './names.js';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// The registry address depends on this admin key (its parameter). Same key as the FreeNames /
// FreeTunes admin; the signed messages are domain-separated (dwb1).
export const ADMIN = '4498bd4c2ab992afa152bc9b968e246cf70dc4fa5a670b23c33e73b8516ce9f3';
const EMPTY = { claims: {}, blocked: { ts: 0, list: [], sig: '' } };
const enc = new TextEncoder(), dec = new TextDecoder();
const bytes = (s) => Array.from(enc.encode(s));

let listeners = [];
export const onUpdate = (f) => listeners.push(f);

let apiP;
function api() {
  return (apiP ??= new Promise((resolve, reject) => {
    const node = new URLSearchParams(location.search).get('node');
    // In the node's shell the socket must go to the page's own origin.
    const url = new URL(node ? `ws://${node}/v1/contract/command` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/v1/contract/command`);
    const a = new FreenetWsApi(url, {
      onContractPut() {}, onContractGet() {}, onContractUpdate() {}, onDelegateResponse() {},
      onContractUpdateNotification: () => listeners.forEach((f) => f()),
      onContractNotFound: () => console.warn('contract not found'),
      onErr: (e) => console.error(e.cause),
      onOpen: () => resolve(a),
      onClose: () => { apiP = undefined; reject(new Error('socket closed')); },
    }, '');
  }));
}

// get() responses are matched by arrival order: one at a time.
let chain = Promise.resolve();
const serial = (f) => { const p = chain.then(f); chain = p.catch(() => {}); return p; };

let codeP;
const code = () => (codeP ??= fetch(namesWasm).then(async (r) => { const c = new Uint8Array(await r.arrayBuffer()); return { c, hash: blake3(c) }; }));
const params = () => ed.etc.hexToBytes(ADMIN);
/** Instance id = blake3(blake3(wasm) || params), as in freenet-stdlib. */
async function key() { const { hash } = await code(); return new ContractKey(blake3(new Uint8Array([...hash, ...params()])), hash); }

const get = (subscribe) => serial(async () => {
  const r = await (await api()).get(new GetRequest(await key(), false, subscribe));
  return JSON.parse(dec.decode(new Uint8Array(r.state)));
});

/** All star names. The first visitor on a node creates the registry (empty); subscribing keeps it fresh. */
export async function loadNames() {
  try { return await get(true); }
  catch {
    const { c, hash } = await code(), k = await key();
    const contract = new WasmContractV1(new ContractCodeT(Array.from(c), Array.from(hash)), Array.from(params()), k);
    await (await api()).put(new PutRequest(new ContractContainer(ContractType.WasmContractV1, contract), bytes(JSON.stringify(EMPTY)), new RelatedContractsT()));
    return get(true);
  }
}

async function send(delta) {
  const d = new UpdateData(UpdateDataType.DeltaUpdate, new DeltaUpdate(bytes(JSON.stringify(delta))));
  await (await api()).update(new UpdateRequest(await key(), d));
}

/** Name a star: mine a claim stronger than the current one, then publish it. */
export async function nameStar(seed, name, by, current, onProgress) {
  const claim = await mine(seed, name, by, current, onProgress);
  await send({ claims: { [seed]: claim } });
  return claim;
}

/** Admin only: hide these stars' names (replaces the whole blocklist). */
export async function blockStars(secretHex, seeds, ts = Math.floor(Date.now() / 1000)) {
  const sig = ed.etc.bytesToHex(ed.sign(enc.encode(`dwb1|${ts}|${seeds.join(',')}`), ed.etc.hexToBytes(secretHex)));
  await send({ blocked: { ts, list: seeds, sig } });
}
