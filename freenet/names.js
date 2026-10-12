// Star-name claims, mirrored from contract/src/lib.rs (same message, same rules).
import { sha256 } from '@noble/hashes/sha2.js';

export const POW_BITS = 18;
const enc = new TextEncoder();

export const strength = (seed, c) => sha256(enc.encode(`dw1|${seed}|${c.name}|${c.by}|${c.nonce}`));
const zeroBits = (h) => { let n = 0; for (const b of h) { if (b) return n + Math.clz32(b) - 24; n += 8; } return n; };
const less = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const textOk = (s, max) => s.length > 0 && [...s].length <= max && s.trim() === s && !/[\u0000-\u001f\u007f|]/.test(s);
export const validText = (name, by) => textOk(name, 32) && textOk(by, 24);

/** Mine a claim strong enough to be valid and to beat `current` (if any). Yields to the page every
 *  few thousand hashes; `onProgress(hashes)` lets the UI show that work is happening. */
export async function mine(seed, name, by, current, onProgress = () => {}) {
  if (!validText(name, by)) throw new Error('Names: 1-32 characters, nicknames 1-24, no "|" or leading/trailing spaces.');
  const beat = current && strength(seed, current);
  for (let nonce = 0; ; nonce++) {
    const c = { name, by, nonce }, h = strength(seed, c);
    if (zeroBits(h) >= POW_BITS && (!beat || less(h, beat))) return c;
    if (nonce % 5000 === 4999) { onProgress(nonce + 1); await new Promise((r) => setTimeout(r)); }
  }
}
