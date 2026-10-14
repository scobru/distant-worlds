import assert from 'node:assert/strict';
import { makeWorld } from './world.js';
import { makeSong, STYLE_NAMES } from './compose.js';

const styles = new Set();
for (let i = 0; i < 60; i++) {
  const w = makeWorld('v1-' + i + '_7_1'), M = i % 5 ? w.music : { ...w.music, tense: true }, song = makeSong(M), again = makeSong(M);
  styles.add(song.style);
  assert.ok(song.bpm >= 55 && song.bpm <= 160, song.bpm);
  const pcs = new Set(M.scale.map((x) => (M.root + x) % 12));
  for (let n = 0; n < 40; n++) {
    const b = song.bar(n, 6);
    assert.deepEqual(b, again.bar(n, 6), 'deterministic');
    for (const x of b.notes) {
      assert.ok(pcs.has(x.midi % 12), `in the world's scale (${M.scaleName})`);
      assert.ok(x.beat >= 0 && x.beat < 4 && x.dur > 0);
      assert.ok(x.midi >= 24 && x.midi <= 100, `${x.voice} ${x.midi}`);
    }
    const lead = b.notes.filter((x) => x.voice === 'lead');
    for (let k = 1; k < lead.length; k++) assert.ok(Math.abs(lead[k].midi - lead[k - 1].midi) <= 12, 'no wild leaps');
  }
  // sections close on their home chord (vi for tense music)
  assert.equal(song.bar(15).chords.at(-1), song.style === 'tense' ? 5 : 0);
}
assert.deepEqual([...styles].sort(), [...STYLE_NAMES].sort(), 'every style shows up');
console.log('compose ok:', [...styles].join(', '));
{
  // The learner, on a tiny MIDI made here: C major, I-IV-V-I in half notes, a melody on top.
  const { learnOne, keyOf } = await import('./tools/learn-music.mjs');
  const ev = [], div = 96, vlq = (n) => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
  const notes = [];
  [[0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]].forEach((ch, k) => {
    for (const pc of ch) notes.push([k * 2 * div, 2 * div, 0, 48 + pc]);
    for (let s = 0; s < 4; s++) notes.push([k * 2 * div + s * div / 2, div / 2, 1, 72 + ch[s % 3] + (s === 3 ? 12 : 0)]);
  });
  for (const [s, d, c, p] of notes) ev.push([s, 0x90 | c, p, 90], [s + d, 0x80 | c, p, 0]);
  ev.sort((a, b) => a[0] - b[0]);
  let t = 0; const body = [];
  for (const [at, st, p, v] of ev) { body.push(...vlq(at - t), st, p, v); t = at; }
  body.push(0, 0xff, 0x2f, 0);
  const u32 = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const midi = new Uint8Array([...'MThd'].map((c) => c.charCodeAt(0)).concat(u32(6), [0, 0, 0, 1, 0, div], [...'MTrk'].map((c) => c.charCodeAt(0)), u32(body.length), body));
  const s = learnOne(midi);
  assert.deepEqual([s.key.tonic, s.key.mode], [0, 'major']);
  assert.ok(s.transitions[0][3] && s.transitions[3][4] && s.transitions[4][0], JSON.stringify(s.transitions));
  assert.ok(Object.keys(s.cells).length && s.bpm === 120);
  const tag = (x) => [...x].map((c) => c.charCodeAt(0)), le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24]; // RMID: the same file in a RIFF wrapper
  assert.deepEqual(learnOne(new Uint8Array([...tag('RIFF'), ...le(midi.length + 12), ...tag('RMIDdata'), ...le(midi.length), ...midi])), s, 'RMID');
  console.log('learn ok');
}
