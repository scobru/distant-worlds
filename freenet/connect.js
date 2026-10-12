// Viso / whoiam "sign in" proof and key display, free of browser and Freenet imports so a plain node test
// can check them against whoiam's golden vector (same code as FreeNames' whoiam.ts).
const enc = new TextEncoder();

/** What Viso signs: "whoiam-connect-v1" || pk || u32le len || base || u32le len || challenge || u64le ts. */
export function connectMessage(pk, base, challenge, ts) {
  const parts = [enc.encode('whoiam-connect-v1'), pk];
  for (const f of [base, challenge]) { const b = enc.encode(f); parts.push(new Uint8Array(new Uint32Array([b.length]).buffer), b); }
  parts.push(new Uint8Array(new BigUint64Array([BigInt(ts)]).buffer));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** Base58 (Bitcoin alphabet) of a hex key, the way Viso and Freenet show public keys. */
export function personaName(pkHex) {
  const d = [];
  const b = pkHex.match(/../g).map((x) => parseInt(x, 16));
  for (const byte of b) {
    let carry = byte;
    for (let i = 0; i < d.length; i++) { carry += d[i] << 8; d[i] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { d.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (const byte of b) { if (byte) break; out += '1'; }
  return out + d.reverse().map((x) => B58[x]).join('');
}
