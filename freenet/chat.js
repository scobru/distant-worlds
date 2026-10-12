// Chat message rules mirrored from chat/src/lib.rs, and the small anti-spam proof of work.
import { sha256 } from '@noble/hashes/sha2.js';

export const POW_BITS = 16;
export const MAX_TEXT = 280;
const enc = new TextEncoder();

export const chatMsg = (m) => `dwm1|${m.persona}|${m.nick}|${m.ts}|${m.world}|${m.text}`;
export const chatPow = (m) => sha256(enc.encode(`${chatMsg(m)}|${m.nonce}`));
const zeroBits = (h) => { let n = 0; for (const b of h) { if (b) return n + Math.clz32(b) - 24; n += 8; } return n; };

/** Find a nonce for the message (about 65k hashes), yielding to the page now and then. */
export async function mineMessage(m) {
  for (m.nonce = 0; zeroBits(chatPow(m)) < POW_BITS; m.nonce++) if (m.nonce % 5000 === 4999) await new Promise((r) => setTimeout(r));
  return m;
}
export const textOk = (t) => [...t].length > 0 && [...t].length <= MAX_TEXT && !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(t);
