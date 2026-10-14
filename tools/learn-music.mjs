// Learns a music model from example MIDI files, for compose.js.
//   node tools/learn-music.mjs examples/*.mid > music-model.js
// It keeps statistics only, never the notes: which chord (scale degree) follows which, how melodies
// move (interval sizes), the rhythm of melodic cells (2 beats), tempo and how often chords change.
// Each file goes into a style: minor and fast (>= 110 bpm) -> tense (battles, danger), slow (< 80 bpm)
// -> ballad, a steady beat (drum hits at least every beat) -> groove, else dreamy.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// ---- MIDI parsing (format 0/1): notes [start, dur, channel, pitch] in ticks, tempo, ticks per beat
export function parseMidi(buf) {
  let b = new Uint8Array(buf);
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF') b = b.subarray(20); // RMID: a standard MIDI file inside a RIFF 'data' chunk
  const u32 = (i) => (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
  if (String.fromCharCode(...b.slice(0, 4)) !== 'MThd') throw new Error('not a MIDI file');
  const ntr = (b[10] << 8) | b[11], div = (b[12] << 8) | b[13];
  const notes = [], tempos = [];
  let i = 8 + u32(4);
  for (let tr = 0; tr < ntr && i < b.length; tr++) {
    const end = i + 8 + u32(i + 4);
    let j = i + 8, t = 0, run = 0;
    const on = new Map();
    const vlq = () => { let v = 0, c; do { c = b[j++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80); return v; };
    while (j < end) {
      t += vlq();
      let st = b[j];
      if (st === 0xff) { const type = b[j + 1]; j += 2; const l = vlq(); if (type === 0x51) tempos.push((b[j] << 16) | (b[j + 1] << 8) | b[j + 2]); j += l; continue; }
      if (st === 0xf0 || st === 0xf7) { j++; j += vlq(); continue; }
      if (st & 0x80) { run = st; j++; } else st = run;
      const ev = run >> 4, ch = run & 15;
      if (ev === 0xc || ev === 0xd) { j++; continue; }
      const a = b[j], v = b[j + 1]; j += 2;
      if (ev === 9 && v > 0) on.set(ch * 128 + a, t);
      else if (ev === 8 || ev === 9) { const s = on.get(ch * 128 + a); if (s !== undefined) { notes.push([s, t - s, ch, a]); on.delete(ch * 128 + a); } }
    }
    i = end;
  }
  return { div, bpm: tempos.length ? Math.round(6e7 / tempos[tempos.length > 1 && 6e7 / tempos[0] > 200 ? 1 : 0]) : 120, notes: notes.sort((x, y) => x[0] - y[0]) };
}

// ---- key: Krumhansl-Schmuckler profiles against the pitch classes weighted by duration
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const corr = (a, b) => { const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12; let n = 0, da = 0, db = 0; for (let k = 0; k < 12; k++) { n += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; } return n / Math.sqrt(da * db); };
export function keyOf(notes) {
  const w = Array(12).fill(0);
  for (const [, d, ch, p] of notes) if (ch !== 9) w[p % 12] += d;
  let best = { score: -2 };
  for (let tonic = 0; tonic < 12; tonic++) for (const [mode, prof] of [['major', MAJ], ['minor', MIN]]) {
    const score = corr(w, prof.map((_, k) => prof[(k - tonic + 12) % 12]));
    if (score > best.score) best = { tonic, mode, score };
  }
  return best;
}
const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

/** Statistics of one file. */
export function learnOne(buf) {
  const { div, notes } = parseMidi(buf), key = keyOf(notes), sc = SCALE[key.mode];
  let { bpm } = parseMidi(buf);
  if (bpm > 180) bpm = Math.round(bpm / 2); // written in double time
  const pitched = notes.filter((n) => n[2] !== 9), seg = div * 2, last = Math.max(...pitched.map((n) => n[0] + n[1]));
  // chords every half bar: the diatonic triad (with its 7th) that best covers the sounding pitch classes
  const degs = [];
  for (let a = 0; a < last; a += seg) {
    const w = Array(12).fill(0);
    for (const [s, d, , p] of pitched) { const ov = Math.min(s + d, a + seg) - Math.max(s, a); if (ov > 0) w[p % 12] += ov; }
    if (!w.some(Boolean)) { degs.push(null); continue; }
    let best = 0, bestScore = -1;
    for (let dg = 0; dg < 7; dg++) {
      const tones = [0, 2, 4, 6].map((k) => (key.tonic + sc[(dg + k) % 7]) % 12), sum = tones.reduce((x, t, k) => x + w[t] * (k === 3 ? 0.5 : k === 0 ? 1.3 : 1), 0);
      if (sum > bestScore) { bestScore = sum; best = dg; }
    }
    degs.push(key.mode === 'minor' ? (best + 5) % 7 : best); // minor keys counted from their relative major
  }
  const transitions = Array.from({ length: 7 }, () => Array(7).fill(0));
  let changes = 0, held = 0;
  for (let k = 1; k < degs.length; k++) {
    if (degs[k] === null || degs[k - 1] === null) continue;
    held++;
    if (degs[k] !== degs[k - 1]) { transitions[degs[k - 1]][degs[k]]++; changes++; }
  }
  // melody: the highest-sounding channel that really moves (not a held or repeated note), then its top note per onset
  const chans = new Map();
  for (const n of pitched) chans.set(n[2], [...(chans.get(n[2]) ?? []), n[3]]);
  const mean = (ps) => ps.reduce((x, y) => x + y) / ps.length, highest = (cs) => cs.sort((a, b) => mean(b[1]) - mean(a[1]))[0]?.[0];
  const most = Math.max(...[...chans.values()].map((ps) => ps.length)); // a melody plays a good share of the notes, not a few high accents
  const lead = highest([...chans].filter(([, ps]) => ps.length >= Math.max(30, most * 0.2) && Math.max(...ps) - Math.min(...ps) >= 7)) ?? highest([...chans]);
  const byOnset = new Map();
  for (const n of pitched) if (n[2] === lead && (!byOnset.has(n[0]) || byOnset.get(n[0])[3] < n[3])) byOnset.set(n[0], n);
  const mel = [...byOnset.values()].sort((x, y) => x[0] - y[0]);
  const intervals = {};
  for (let k = 1; k < mel.length; k++) { const iv = Math.max(-12, Math.min(12, mel[k][3] - mel[k - 1][3])); intervals[iv] = (intervals[iv] ?? 0) + 1; }
  // rhythm cells of 2 beats, onsets in 16ths, kept when the cell has notes
  const cells = {};
  const q = div / 4;
  for (let a = 0; a < last; a += seg) {
    const on = mel.filter((n) => n[0] >= a && n[0] < a + seg);
    if (!on.length) continue;
    const pts = on.map((n, k) => { const o = Math.round((n[0] - a) / q), nx = k + 1 < on.length ? Math.round((on[k + 1][0] - a) / q) : 8; return [o / 4, Math.max(1, Math.min(nx - o, Math.round(n[1] / q))) / 4]; })
      .filter(([o], k, arr) => o < 2 && (k === 0 || o !== arr[k - 1][0]));
    const id = JSON.stringify(pts);
    cells[id] = (cells[id] ?? 0) + 1;
  }
  const beats = last / div, drums = notes.filter((n) => n[2] === 9).length / beats;
  return {
    bpm, key, drums, style: key.mode === 'minor' && bpm >= 110 ? 'tense' : bpm < 80 ? 'ballad' : drums >= 1 ? 'groove' : 'dreamy',
    chordBeats: changes ? Math.max(1, Math.min(4, Math.round((held * 2) / changes))) : 4,
    density: mel.length / beats, transitions, intervals, cells,
  };
}

/** Merges files into one model per style. */
export function learn(files) {
  const model = {};
  for (const [name, buf] of files) {
    const s = learnOne(buf), m = (model[s.style] ??= { sources: [], bpm: [], chordBeats: [], transitions: Array.from({ length: 7 }, () => Array(7).fill(0)), intervals: {}, cells: {} });
    m.sources.push(name); m.bpm.push(s.bpm); m.chordBeats.push(s.chordBeats);
    // every file weighs the same (100 per table), however long or dense it is
    const norm = (vals) => 100 / Math.max(1, vals.reduce((a, b) => a + b, 0));
    const tn = norm(s.transitions.flat()), iv = norm(Object.values(s.intervals)), cn = norm(Object.values(s.cells));
    s.transitions.forEach((row, a) => row.forEach((c, b) => (m.transitions[a][b] += c * tn)));
    for (const [k, v] of Object.entries(s.intervals)) m.intervals[k] = (m.intervals[k] ?? 0) + v * iv;
    for (const [k, v] of Object.entries(s.cells)) m.cells[k] = (m.cells[k] ?? 0) + v * cn;
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  for (const m of Object.values(model)) {
    m.transitions = m.transitions.map((row) => row.map(r1));
    for (const k in m.intervals) m.intervals[k] = r1(m.intervals[k]);
    // the middle of the tempos (10th-90th percentile), so one odd file does not stretch the range
    const t = [...m.bpm].sort((a, b) => a - b);
    m.bpm = [t[Math.floor(t.length * 0.1)], t[Math.ceil(t.length * 0.9) - 1]];
    m.chordBeats = Math.round(m.chordBeats.reduce((a, b) => a + b) / m.chordBeats.length) >= 3 ? 4 : 2;
    // the 12 most used cells are enough; rare ones are often transcription noise
    m.cells = Object.entries(m.cells).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => [JSON.parse(k), r1(v)]);
  }
  return model;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node tools/learn-music.mjs file.mid ... > music-model.js'); process.exit(1); }
  const model = learn(files.map((f) => [basename(f).replace(/\.midi?$/i, ''), readFileSync(f)]));
  console.log(`// Generated by tools/learn-music.mjs from ${files.length} example files: statistics only, no notes.
// Per style: tempo range, beats per chord, chord-degree transitions (from -> to counts),
// melodic interval counts (semitones) and the most used 2-beat rhythm cells ([onset, duration] in beats).
export const MODEL = ${JSON.stringify(model)};`);
}
