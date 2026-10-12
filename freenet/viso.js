// Reading a Viso persona (https://github.com/scobru/viso, docs/resources.md): its contract address,
// profile, avatar and `ante` level. Free of browser and Freenet imports so node tests can check it
// against vectors made with viso-core (viso.vector.json).
import * as ed from '@noble/ed25519';
import { blake3 } from '@noble/hashes/blake3.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const { hexToBytes: unhex } = ed.etc;
const cat = (...p) => ed.etc.concatBytes(...p);
const u32le = (n) => new Uint8Array(new Uint32Array([n]).buffer);
const u64le = (n) => new Uint8Array(new BigUint64Array([BigInt(n)]).buffer);

/** Minimal CBOR decoder: what ciborium writes for Viso's types (maps, text, bytes, arrays, uints, null). */
export function cborDecode(b) {
  let i = 0;
  const len = (ai) => {
    if (ai < 24) return ai;
    const n = { 24: 1, 25: 2, 26: 4, 27: 8 }[ai];
    if (!n) throw new Error('unsupported CBOR length');
    let v = 0n;
    for (let k = 0; k < n; k++) v = (v << 8n) | BigInt(b[i++]);
    return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
  };
  const item = () => {
    const ib = b[i++], mt = ib >> 5, ai = ib & 31;
    if (mt === 7) { if (ai === 22 || ai === 23) return null; if (ai === 20) return false; if (ai === 21) return true; throw new Error('unsupported CBOR simple'); }
    const n = len(ai);
    if (mt === 0) return n;
    if (mt === 2) { const v = b.slice(i, i + n); i += n; return v; }
    if (mt === 3) { const v = dec.decode(b.slice(i, i + n)); i += n; return v; }
    if (mt === 4) return Array.from({ length: n }, item);
    if (mt === 5) { const o = {}; for (let k = 0; k < n; k++) { const key = item(); o[key] = item(); } return o; }
    throw new Error(`unsupported CBOR major type ${mt}`);
  };
  return item();
}
// serde writes fixed-size byte arrays (keys, signatures) as arrays of small ints
const asBytes = (v) => (v instanceof Uint8Array ? v : Uint8Array.from(v));

/** blake3 of Viso's identity_contract.wasm (sha256 29aaf06a…, pinned in viso's scripts/wasm-hashes.txt). */
export const IDENTITY_CODE_HASH = '20ec0599f4b7c9f2e2d0034e26b8195eb2d02b8ccb791643f5751e75e2477a89';

/** Contract parameters: CBOR { version: 1, pubkey: <32 bytes> }. */
export const identityParams = (pk) => cat(Uint8Array.from([0xa2, 0x67]), enc.encode('version'), Uint8Array.from([0x01, 0x66]), enc.encode('pubkey'), Uint8Array.from([0x58, 0x20]), pk);

/** Contract instance id: blake3(code hash || params), as in freenet-stdlib. */
export const identityInstance = (pk) => blake3(cat(unhex(IDENTITY_CODE_HASH), identityParams(pk)));

/** A slot's signature: "whoiam-slot-v1" ‖ pk ‖ u32le len ‖ name ‖ u64le time ‖ blake3(content). */
export function slotOk(pk, name, slot) {
  const m = cat(enc.encode('whoiam-slot-v1'), pk, u32le(enc.encode(name).length), enc.encode(name), u64le(slot.time_ms), blake3(asBytes(slot.bytes)));
  try { return ed.verify(asBytes(slot.sig), m, pk); } catch { return false; }
}

/** `ante` level of a slot's content (ante v0.2.0 AnteProof), 0 if it is not this persona's. The
 *  signature inside is checked by the contracts that rely on it; here it only drives the UI. */
export function anteBits(pk, bytes) {
  try {
    const p = cborDecode(bytes), vk = asBytes(p.identity_vk);
    if (p.purpose !== 'viso:persona-level:v1' || ed.etc.bytesToHex(vk) !== ed.etc.bytesToHex(pk)) return 0;
    const purpose = enc.encode(p.purpose);
    const h = blake3(cat(enc.encode('ante:pow-challenge:v1'), u32le(purpose.length), purpose, vk, u64le(p.nonce)));
    let n = 0;
    for (const x of h) { if (x) return n + Math.clz32(x) - 24; n += 8; }
    return n;
  } catch { return 0; }
}

// ---- making a level for a key held here (no Viso): the same ante v0.2.0 proof Viso grinds
const PURPOSE = 'viso:persona-level:v1';
const cborHead = (mt, n) => {
  if (n < 24) return [(mt << 5) | n];
  if (n < 256) return [(mt << 5) | 24, n];
  if (n < 65536) return [(mt << 5) | 25, n >> 8, n & 255];
  if (n < 2 ** 32) return [(mt << 5) | 26, ...[24, 16, 8, 0].map((k) => (n >>> k) & 255)];
  const v = BigInt(n);
  return [(mt << 5) | 27, ...[56n, 48n, 40n, 32n, 24n, 16n, 8n, 0n].map((k) => Number((v >> k) & 255n))];
};
const cText = (t) => { const b = enc.encode(t); return [...cborHead(3, b.length), ...b]; };
const cInts = (bytes) => [...cborHead(4, bytes.length), ...[...bytes].flatMap((x) => cborHead(0, x))];

/** The `ante` slot content for secret key `sk` at `nonce`, byte for byte what viso-ante's make_slot writes. */
export function makeAnte(sk, nonce, ts) {
  const pk = ed.getPublicKey(sk), purpose = enc.encode(PURPOSE);
  const sig = ed.sign(cat(enc.encode('ante:proof-signature:v1'), pk, u32le(purpose.length), purpose, u64le(nonce), u64le(ts)), sk);
  return Uint8Array.from([...cborHead(5, 5), ...cText('identity_vk'), ...cInts(pk), ...cText('purpose'), ...cText(PURPOSE),
    ...cText('nonce'), ...cborHead(0, nonce), ...cText('ts'), ...cborHead(0, ts), ...cText('signature'), ...cInts(sig)]);
}

/** Search a nonce reaching `bits` for this key (about 2^bits blake3 hashes), yielding to the page;
 *  `onProgress(hashes)` lets the UI show it. Returns the slot content. */
export async function grindAnte(sk, bits, onProgress = () => {}) {
  const pk = ed.getPublicKey(sk), purpose = enc.encode(PURPOSE);
  const pre = cat(enc.encode('ante:pow-challenge:v1'), u32le(purpose.length), purpose, pk), buf = new Uint8Array(pre.length + 8);
  buf.set(pre);
  const view = new DataView(buf.buffer);
  for (let n = 0; ; n++) {
    view.setUint32(pre.length, n >>> 0, true); view.setUint32(pre.length + 4, Math.floor(n / 2 ** 32), true);
    const h = blake3(buf);
    let z = 0;
    for (const x of h) { if (x) { z += Math.clz32(x) - 24; break; } z += 8; }
    if (z >= bits) return makeAnte(sk, n, Date.now());
    if (n % 20000 === 19999) { onProgress(n + 1); await new Promise((r) => setTimeout(r)); }
  }
}

/** Decode a persona's state, keeping only correctly signed, non-empty slots. */
export function readPersona(pkHex, stateBytes) {
  const pk = unhex(pkHex), st = cborDecode(stateBytes), out = { name: '', bio: '', avatar: null, ante: null, bits: 0 };
  if (st.destroyed) return { ...out, destroyed: true };
  const slot = (name) => { const s = st.slots?.[name]; return s && asBytes(s.bytes).length && slotOk(pk, name, s) ? asBytes(s.bytes) : null; };
  const profile = slot('profile');
  if (profile) { try { const p = cborDecode(profile); out.name = String(p.name ?? '').slice(0, 64); out.bio = String(p.bio ?? '').slice(0, 280); } catch { /* ignore */ } }
  const avatar = slot('avatar');
  // PNG or WebP only, as the spec says
  if (avatar && avatar.length <= 128 * 1024 && ((avatar[0] === 0x89 && avatar[1] === 0x50) || dec.decode(avatar.slice(8, 12)) === 'WEBP')) out.avatar = avatar;
  const ante = slot('ante');
  if (ante) { out.ante = ante; out.bits = anteBits(pk, ante); }
  return out;
}
