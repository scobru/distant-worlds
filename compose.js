// Generative composer: chord progressions, phrased melodies, accompaniment and bass, bar by bar.
// Three styles, after the kind of game background music the project took as reference
// (no notes are copied, only the shape of the writing):
//  - ballad: slow, I-vi-IV-V family, 7ths and 9ths, broken-chord accompaniment, long melodic notes;
//  - dreamy: IV-I sways with maj7 / add9 colour, a chord every half bar, flowing 16th arpeggios;
//  - groove: dominant-7th vamps (I, IV, bVII), syncopated bass ostinato, short riffs, drums;
//  - tense: minor-feeling loops around vi, pulsing 8ths, driving bass (worlds about to collapse).
// Harmony is built by stacking thirds inside the world's own scale, so exotic scales keep their colour.
// What it learned from example MIDI files (music-model.js, made by tools/learn-music.mjs) shapes each
// style: chord-to-chord moves (a Markov chain over scale degrees), melodic intervals, rhythm cells,
// tempo. The hand-written values below are the prior, so the music still works with an empty model.
// Pure: the same world and bar number give the same notes (audio.js plays them).
import { rng } from './world.js';
import { MODEL } from './music-model.js';

const STYLES = {
  ballad: {
    bpm: [64, 80], chordBeats: 4, cell: 4, seventh: 0.6, ninth: 0.35, comp: 'broken', bass: 'long',
    progs: [[0, 5, 3, 4], [0, 3, 5, 4], [0, 2, 3, 4], [5, 3, 0, 4], [0, 4, 5, 3]],
    bridges: [[3, 4, 2, 5], [1, 4, 0, 5], [5, 2, 3, 4]],
    cells: [[[0, 2], [2, 1], [3, 1]], [[0, 3], [3, 1]], [[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 4]], [[0, 1], [1, 1], [2, 2]], [[0, 2], [2, 2]]],
  },
  dreamy: {
    bpm: [76, 92], chordBeats: 2, cell: 2, seventh: 0.9, ninth: 0.6, comp: 'arp', bass: 'chord',
    progs: [[3, 0, 3, 0], [3, 0, 1, 5], [5, 4, 3, 0], [3, 4, 5, 0], [0, 3, 0, 3]],
    bridges: [[1, 4, 5, 5], [3, 3, 4, 4], [5, 3, 1, 4]],
    cells: [[[0, 0.5], [0.5, 0.5], [1, 1]], [[0, 1.5], [1.5, 0.5]], [[0, 0.5], [0.5, 1.5]], [[0, 2]], [[0, 1], [1, 1]]],
  },
  groove: {
    bpm: [98, 116], chordBeats: 4, cell: 2, seventh: 1, ninth: 0.2, comp: 'stabs', bass: 'ostinato',
    progs: [[0, 0, 3, 0], [0, 6, 3, 0], [0, 3, 0, 6], [0, 0, 6, 3]],
    bridges: [[3, 3, 0, 0], [4, 3, 0, 6], [6, 6, 3, 3]],
    cells: [[[0, 0.5], [0.75, 0.25], [1.5, 0.5]], [[0, 0.25], [0.25, 0.25], [0.5, 1]], [[0.5, 0.5], [1, 0.5], [1.5, 0.5]], [[0, 1], [1.5, 0.5]], [[0, 1.5]]],
  },
  tense: {
    bpm: [100, 125], chordBeats: 4, cell: 2, seventh: 0.3, ninth: 0.1, comp: 'pulse', bass: 'ostinato',
    progs: [[5, 3, 4, 5], [5, 5, 3, 4], [5, 1, 2, 5], [5, 4, 3, 4]],
    bridges: [[3, 4, 2, 5], [1, 2, 3, 4]],
    cells: [[[0, 0.5], [0.5, 0.5], [1, 1]], [[0, 1.5], [1.5, 0.5]], [[0, 0.25], [0.25, 0.25], [0.5, 0.5], [1, 1]], [[0, 2]]],
  },
};
export const STYLE_NAMES = Object.keys(STYLES);

// weighted pick from [[value, weight], ...]
const choose = (r, items) => { let x = r() * items.reduce((a, [, w]) => a + w, 0); return (items.find(([, w]) => (x -= w) < 0) ?? items.at(-1))[0]; };
/** Learned and hand-written knowledge of one style, merged. */
function knowledge(name) {
  const S = STYLES[name], L = MODEL[name];
  const T = Array.from({ length: 7 }, (_, a) => Array.from({ length: 7 }, (_, b) => (L?.transitions[a][b] ?? 0) + (a === b ? 0 : 0.15)));
  for (const p of [...S.progs, ...S.bridges]) p.forEach((d, k) => { const e = p[(k + 1) % p.length]; if (d !== e) T[d][e] += 2; });
  const cells = [...S.cells.flatMap((c) => (S.cell === 2 ? [[c, 2]] : [])), ...(L?.cells ?? [])];
  const intervals = L ? Object.entries(L.intervals).map(([iv, n]) => [+iv, n]) : [[-2, 3], [-1, 2], [0, 1], [1, 2], [2, 3], [-4, 1], [4, 1], [-3, 1], [3, 1]];
  // background music: learned tempos, but none frantic
  const lo = L ? Math.max(L.bpm[0], S.bpm[0] - 10) : S.bpm[0], hi = L ? Math.max(lo, Math.min(L.bpm[1], S.bpm[1] + 15)) : S.bpm[1];
  return { ...S, T, cells: cells.length ? cells : [[[[0, 2]], 1]], intervals, bpm: [lo, hi], chordBeats: L?.chordBeats ?? S.chordBeats };
}
/** A 4-chord progression walked on the learned chain from `start`; the last chord leads back to `start`. */
function walk(K, r, start) {
  const prog = [start];
  for (let k = 1; k < 4; k++) {
    const from = prog[k - 1], row = K.T[from].map((w, to) => [to, k === 3 ? w * (K.T[to][start] + 0.5) : w]);
    prog.push(choose(r, row));
  }
  return prog;
}
const PHRASE = 4; // bars per phrase; a section is two phrases (question, answer)
const FORM = ['A', 'A', 'B', 'A'];
const ORDER = [[0, 1], [0, 2], [1, 2], [0, 1]]; // which two of a section's three rhythm cells fill each bar of a phrase

/** `M`: a world's music (root, scale, bpm, perc, noteSeed). */
export function makeSong(M) {
  const r = rng(M.noteSeed ^ 0x50a6), pick = (a) => a[Math.floor(r() * a.length)];
  const name = M.tense ? 'tense' : M.perc ? 'groove' : M.bpm < 72 ? 'ballad' : r() < 0.5 ? 'dreamy' : 'ballad';
  const S = knowledge(name), len = M.scale.length;
  const bpm = Math.round(S.bpm[0] + ((M.bpm - 50) / 50) * (S.bpm[1] - S.bpm[0]));
  const at = (i) => M.root + 12 * Math.floor(i / len) + M.scale[((i % len) + len) % len]; // scale index -> MIDI
  // a degree of the 7-note world mapped onto this scale (5-note scales skip some)
  const idx = (deg) => Math.round((deg * len) / 7);
  const chordOf = (deg, cr) => {
    const c = idx(deg), tones = [c, c + 2, c + 4];
    if (cr() < S.seventh) tones.push(c + 6);
    if (cr() < S.ninth) tones.push(c + 8);
    return tones; // scale indices from the chord root, low to high
  };

  // each pass through the form (A A B A) picks new progressions and motifs, so the song evolves slowly
  const passes = new Map();
  function pass(p) {
    if (!passes.has(p)) {
      const pr = rng(M.noteSeed + p * 7919);
      const pk = (a) => a[Math.floor(pr() * a.length)];
      const motif = () => Array.from({ length: 3 }, () => choose(pr, S.cells));
      // melodic moves sampled from the learned intervals (semitones), turned into steps of this scale
      const steps = Array.from({ length: 16 }, () => Math.round(choose(pr, S.intervals) / (12 / len)));
      const A = pr() < 0.3 ? pk(S.progs) : walk(S, pr, name === 'tense' ? 5 : 0);
      passes.set(p, { A, B: pr() < 0.3 ? pk(S.bridges) : walk(S, pr, choose(pr, S.T[A[3]].map((w, to) => [to, to ? w : 0]))), motifA: motif(), motifB: motif(), steps,
        // how this pass is dressed: the accompaniment's timbre, a second lead voice in the B section, a pad, the bass voice, a counter-line
        arr: { comp: Math.floor(pr() * 3), lead2: pr() < 0.6, pad: M.pad ? pr() < 0.8 : pr() < 0.25, bass: pr() < 0.5 ? 1 : 0, counter: pr() < 0.7 } });
      if (passes.size > 8) passes.delete(passes.keys().next().value);
    }
    return passes.get(p);
  }
  const barsPerPass = FORM.length * PHRASE * 2;

  let prevNote = len * 3; // melody memory (scale index), carried across bars
  /** Notes of bar `n`: [{ beat, dur, midi, voice: 'lead' | 'comp' | 'bass' | 'pad', vel }], plus the chord. */
  function bar(n, interest = 6) {
    const P = pass(Math.floor(n / barsPerPass)), inPass = n % barsPerPass;
    const section = FORM[Math.floor(inPass / (PHRASE * 2))], inSec = inPass % (PHRASE * 2), inPhrase = inSec % PHRASE;
    const prog = P[section], br = rng(M.noteSeed + n * 104729), out = [];
    const chordsPerBar = 4 / S.chordBeats;
    const chords = Array.from({ length: chordsPerBar }, (_, k) => {
      const deg = prog[(inSec * chordsPerBar + k) % prog.length];
      // the answer phrase closes on the tonic
      const last = inSec === PHRASE * 2 - 1 && k === chordsPerBar - 1 && section === 'A', home = name === 'tense' ? 5 : 0;
      return { deg: last ? home : deg, tones: chordOf(last ? home : deg, rng(M.noteSeed + deg * 31 + P.A[0])) };
    });
    const chordAt = (beat) => chords[Math.min(chordsPerBar - 1, Math.floor(beat / S.chordBeats))];

    // bass
    for (const [k, c] of chords.entries()) {
      const b0 = k * S.chordBeats, bi = idx(c.deg), deg = (iv) => at(bi + idx(iv)); // iv: 7-note interval (4 = fifth, 7 = octave)
      if (S.bass === 'long') { out.push({ beat: b0, dur: 2.5, midi: deg(0), voice: 'bass', vel: 0.9 }); out.push({ beat: b0 + 2, dur: 1.8, midi: deg(br() < 0.5 ? 4 : 0), voice: 'bass', vel: 0.6 }); }
      if (S.bass === 'chord') out.push({ beat: b0, dur: S.chordBeats - 0.1, midi: deg(0), voice: 'bass', vel: 0.8 });
      if (S.bass === 'ostinato') for (const [o, d, iv] of [[0, 0.5, 0], [0.75, 0.25, 0], [1.5, 0.5, 7], [2, 0.5, 4], [3, 0.25, 6], [3.5, 0.5, 7]])
        out.push({ beat: b0 + o, dur: d, midi: deg(iv), voice: 'bass', vel: o === 0 ? 1 : 0.7 });
    }

    // accompaniment: the chord voiced around the middle of the keyboard
    for (const [k, c] of chords.entries()) {
      const b0 = k * S.chordBeats, v = c.tones.map((i) => at(i + len)), span = S.chordBeats;
      if (S.comp === 'broken') { // root, fifth, tenth... in 8ths
        const order = [0, 2, 1, 2, 3 % v.length, 2, 1, 2];
        for (let s = 0; s < span * 2; s++) out.push({ beat: b0 + s / 2, dur: 0.9, midi: v[order[s % 8] % v.length] + (s % 4 === 2 ? 12 : 0), voice: 'comp', vel: s % 2 ? 0.45 : 0.6 });
      }
      if (S.comp === 'arp') { // rising and falling 16ths over two octaves
        const up = [...v, ...v.map((x) => x + 12)], seq = [...up, ...up.slice(1, -1).reverse()];
        for (let s = 0; s < span * 4; s++) out.push({ beat: b0 + s / 4, dur: 0.6, midi: seq[s % seq.length], voice: 'comp', vel: s % 4 ? 0.35 : 0.55 });
      }
      if (S.comp === 'pulse') for (let s = 0; s < span * 2; s++) out.push({ beat: b0 + s / 2, dur: 0.4, midi: v[s % 2 ? 1 : 0] - 12, voice: 'comp', vel: s % 4 ? 0.4 : 0.6 });
      if (S.comp === 'stabs') for (const o of [0.5, 1.5, 2.75, 3.5]) for (const x of v.slice(0, 4)) out.push({ beat: b0 + o, dur: 0.25, midi: x, voice: 'comp', vel: 0.5 });
      if (P.arr.pad) for (const x of v.slice(0, 3)) out.push({ beat: b0, dur: span, midi: x - 12, voice: 'pad', vel: 0.5 });
    }

    // melody: three rhythm cells per section, two of them in each bar (so the rhythm turns over every
    // four bars, not every bar); the answer phrase moves against the question's contour; the first two
    // bars of a pass leave the lead out. Strong beats land on chord tones, weak ones move by step, the
    // last bar of a phrase rests on a long note
    const motif = section === 'A' ? P.motifA : P.motifB, lo = len * 2 + 2, hi = len * 4;
    const cadence = inPhrase === PHRASE - 1, phraseNo = Math.floor(inSec / PHRASE), way = phraseNo ? -1 : 1;
    const calm = Math.max(0, 0.35 - interest * 0.03); // a busier screen leaves fewer rests
    let si = inPhrase * 4 + phraseNo * 7;
    if (inPass >= 2) ORDER[inPhrase].map((k) => motif[k]).forEach((cell, ci) => cell.forEach(([o, d], ni) => {
      const beat = ci * 2 + o;
      if (cadence && beat >= 2) return;
      if (br() < calm && !(ci === 0 && ni === 0)) return;
      const c = chordAt(beat), strong = beat % S.chordBeats === 0 || d >= 1;
      let target = prevNote + way * P.steps[si++ % 16];
      if (strong) { // nearest chord tone, in any octave
        const cands = [];
        for (let oct = -2; oct <= 4; oct++) for (const t of c.tones) cands.push(t + oct * len);
        target = cands.filter((x) => x >= lo && x <= hi).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0] ?? target;
      }
      target = Math.max(lo, Math.min(hi, target));
      target = Math.max(prevNote - len, Math.min(prevNote + len, target)); // at most an octave from the last note: a learned leap plus the snap to a chord tone could go further
      prevNote = target;
      out.push({ beat, dur: d * 0.95, midi: at(target), voice: 'lead', vel: strong ? 0.9 : 0.7 });
    }));
    if (section === 'B' && P.arr.counter) for (const [k, c] of chords.entries()) // a slow line above, on the chord's third
      out.push({ beat: k * S.chordBeats, dur: S.chordBeats * 0.95, midi: at(c.tones[1] + len * 2), voice: 'counter', vel: 0.55 });
    if (cadence) { // phrase end: chord root (tonic at the end of a section), held
      const c = chordAt(2), root = [c.tones[0], c.tones[0] + len, c.tones[0] + 2 * len, c.tones[0] + 3 * len].filter((x) => x >= lo && x <= hi)
        .sort((a, b) => Math.abs(a - prevNote) - Math.abs(b - prevNote))[0] ?? prevNote;
      prevNote = root;
      out.push({ beat: 2, dur: 2, midi: at(root), voice: 'lead', vel: 0.85 });
    }
    return { notes: out.sort((a, b) => a.beat - b.beat), chords: chords.map((c) => c.deg), section, arr: P.arr };
  }
  return { style: name, bpm, bar };
}
