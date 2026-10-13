import { rng } from './world.js';
import { makeSong } from './compose.js';

// Generative soundtrack. Each world picks a lead instrument, a drone, optional pad / bass /
// soft percussion and a reverb size (see makeWorld's `music`), so worlds differ in timbre,
// not only in notes; compose.js writes the harmony, melody, accompaniment and bass bar by bar.
// `getInterest()` (0..12) is how busy the screen is.
export function startAudio(M, getInterest) {
  const ac = new AudioContext(), t0 = ac.currentTime, song = makeSong(M);
  const master = ac.createGain();
  master.gain.setValueAtTime(0, t0); master.gain.linearRampToValueAtTime(0.6, t0 + 3);
  master.connect(ac.destination);

  // Reverb: impulse response is just decaying stereo noise; length = size of the space.
  const verb = ac.createConvolver(), len = Math.floor(ac.sampleRate * M.space);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  verb.buffer = ir;
  const wet = ac.createGain(); wet.gain.value = 0.45; verb.connect(wet); wet.connect(master);
  const bus = ac.createBiquadFilter(); bus.frequency.value = M.cutoff; bus.connect(master); bus.connect(verb);
  const echo = ac.createDelay(), fb = ac.createGain();
  echo.delayTime.value = 60 / song.bpm * 0.75; fb.gain.value = 0.35; echo.connect(fb); fb.connect(echo); echo.connect(bus);

  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  noise.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const osc = (type, f, t, end, dest) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(t); if (end) o.stop(end); return o; };
  const amp = (t, peak, attack, decay, dest = bus) => {
    const g = ac.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest); return g;
  };

  const INSTR = {
    bell(f, t) { // FM bell
      const e = amp(t, 0.12, 0.005, 2.5), m = ac.createGain(), car = osc('sine', f, t, t + 3, e);
      m.gain.setValueAtTime(f * 3, t); m.gain.exponentialRampToValueAtTime(1, t + 1.5);
      osc('sine', f * 3.5, t, t + 3, m).connect(m); m.connect(car.frequency); e.connect(echo);
    },
    glass(f, t) { // glassy FM, near-harmonic ratio + octave shimmer
      const e = amp(t, 0.08, 0.01, 1.8), m = ac.createGain(), car = osc('triangle', f * 2, t, t + 2.5, e);
      m.gain.setValueAtTime(f * 1.5, t); m.gain.exponentialRampToValueAtTime(1, t + 1);
      osc('sine', f * 2.01, t, t + 2.5, m).connect(m); m.connect(car.frequency); e.connect(echo);
    },
    pluck(f, t) { // plucked: sawtooth through a closing low-pass
      const e = amp(t, 0.12, 0.003, 0.7), lp = ac.createBiquadFilter();
      lp.frequency.setValueAtTime(f * 10, t); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.25); lp.connect(e);
      osc('sawtooth', f, t, t + 1, lp); e.connect(echo);
    },
    marimba(f, t) {
      const e = amp(t, 0.16, 0.002, 0.6), e2 = amp(t, 0.05, 0.002, 0.12);
      osc('sine', f, t, t + 0.8, e); osc('sine', f * 4, t, t + 0.3, e2);
    },
    flute(f, t, dur) { // breathy: triangle + vibrato + band-passed noise
      const e = amp(t, 0.1, 0.08, dur), o = osc('triangle', f, t, t + dur + 0.2, e);
      const vib = ac.createGain(); vib.gain.setValueAtTime(0, t); vib.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
      osc('sine', 5, t, t + dur + 0.2, vib); vib.connect(o.frequency);
      const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), ne = amp(t, 0.025, 0.05, dur * 0.6);
      n.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2; n.connect(bp); bp.connect(ne); n.start(t); n.stop(t + dur + 0.2);
      e.connect(echo);
    },
    piano(f, t, dur, vel = 0.5) { // a few decaying harmonics; low notes ring longer
      const ring = Math.min(3, 0.6 + 120 / f);
      [1, 2, 3, 4].forEach((h, k) => osc('sine', f * h, t, t + ring + 0.1, amp(t, (0.06 * vel) / (1 + k * 1.6), 0.004, ring / (1 + k * 0.7))));
    },
    pad(f, t, dur) {
      const e = amp(t, 0.05, 0.8, dur + 1.5), lp = ac.createBiquadFilter(); lp.frequency.value = 900; lp.connect(e);
      for (const d of [-8, 8]) osc('sawtooth', f, t, t + dur + 2.5, lp).detune.value = d;
    },
  };

  // Drone underneath everything.
  const drone = [];
  // drones are quieter than they used to be: the chords move above them now
  if (M.drone === 'organ') for (const [s, d] of [[0, -4], [7, 4], [12, 0]]) {
    const g = ac.createGain(); g.gain.value = 0.04; g.connect(bus); drone.push(osc('sine', hz(M.root + s), t0, 0, g)); drone.at(-1).detune.value = d;
  }
  if (M.drone === 'wind') {
    const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createGain();
    n.buffer = noise; n.loop = true; bp.type = 'bandpass'; bp.Q.value = 1.5; bp.frequency.value = 600; g.gain.value = 0.12;
    lfo.gain.value = 350; drone.push(osc('sine', 0.05, t0, 0, lfo)); lfo.connect(bp.frequency);
    n.connect(bp); bp.connect(g); g.connect(bus); n.start(t0); drone.push(n);
  }
  if (M.drone === 'choir') { // sawtooth through two vowel formants
    const g = ac.createGain(); g.gain.value = 0.025; g.connect(bus);
    for (const fq of [700, 1150]) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = 6; bp.connect(g);
      for (const s of [0, 7, 12]) drone.push(osc('sawtooth', hz(M.root + 12 + s), t0, 0, bp));
    }
  }

  // Bars from the composer, scheduled a little ahead.
  const r = rng(M.noteSeed), beat = 60 / song.bpm;
  let next = t0 + 1, n = 0;
  const groove = song.style === 'groove';
  const tick = () => {
    const interest = getInterest();
    bus.frequency.setTargetAtTime(M.cutoff * (0.7 + interest * 0.08), ac.currentTime, 2);
    while (next < ac.currentTime + 1) {
      for (const x of song.bar(n, interest).notes) {
        const t = next + x.beat * beat, f = hz(x.midi) * (M.microtonal && x.voice === 'lead' ? 2 ** ((r() - 0.5) * 0.05) : 1), dur = x.dur * beat;
        if (x.voice === 'lead') INSTR[M.lead](f, t, dur);
        if (x.voice === 'comp') groove ? INSTR.pluck(f, t) : INSTR.piano(f, t, dur, x.vel * (0.6 + interest * 0.04));
        if (x.voice === 'bass' && (M.bass || groove)) osc('triangle', f, t, t + dur + 0.1, amp(t, 0.16 * x.vel, 0.01, dur));
        if (x.voice === 'pad') INSTR.pad(f, t, dur);
      }
      if (M.perc) for (let s = 0; s < 8; s++) { // 8ths: kick on 1 and 3 (and the "and" of 3 in a groove), hats, a soft snare on 2 and 4
        const t = next + (s * beat) / 2;
        if (s === 0 || s === 4 || (groove && s === 5)) { const e = amp(t, 0.35, 0.003, 0.35, master), o = osc('sine', 120, t, t + 0.4, e); o.frequency.exponentialRampToValueAtTime(45, t + 0.15); }
        if (r() < (groove ? 0.9 : 0.5)) { const sn = ac.createBufferSource(), hp = ac.createBiquadFilter(), e = amp(t, s % 2 ? 0.03 : 0.045, 0.001, 0.05, master); sn.buffer = noise; hp.type = 'highpass'; hp.frequency.value = 7000; sn.connect(hp); hp.connect(e); sn.start(t, r()); sn.stop(t + 0.1); }
        if (groove && (s === 2 || s === 6)) { const sn = ac.createBufferSource(), bp = ac.createBiquadFilter(), e = amp(t, 0.12, 0.002, 0.14, master); sn.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = 1800; sn.connect(bp); bp.connect(e); sn.start(t, r()); sn.stop(t + 0.2); }
      }
      next += 4 * beat; n++;
    }
  };
  const timer = setInterval(tick, 100);
  return () => { clearInterval(timer); ac.close(); };
}
