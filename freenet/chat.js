// Chat message rules mirrored from chat/src/lib.rs.
export const MAX_TEXT = 280;
/** Viso persona level needed to write (chat/src/lib.rs MIN_ANTE_BITS). */
export const CHAT_BITS = 16;
/** The chat is live: messages older than this are not shown (the contract keeps only a small buffer). */
export const CHAT_LIVE = 15 * 60_000;

/** Presence (chat/src/lib.rs Here): explorers are shown where they are while it is this fresh; republished well within it. */
export const HERE_LIVE = 2 * 60_000;
export const hereMsg = (h) => `dwp1|${h.persona}|${h.nick}|${h.ts}|${h.world}`;
export const chatMsg = (m) => `dwm1|${m.persona}|${m.nick}|${m.ts}|${m.world}|${m.text}`;
export const textOk = (t) => [...t].length > 0 && [...t].length <= MAX_TEXT && !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(t);
