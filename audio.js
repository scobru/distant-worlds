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
  // Output chain (from eph): cut sub-rumble, a limiter for the peaks when voices stack, then a soft
  // clipper that is transparent below ~-4 dB and never passes 1.0, since a compressor is not a brickwall.
  const sub = ac.createBiquadFilter(), lim = ac.createDynamicsCompressor(), safe = ac.createWaveShaper(), curve = new Float32Array(4096);
  sub.type = 'highpass'; sub.frequency.value = 28;
  lim.threshold.value = -4; lim.knee.value = 10; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.25;
  curve.forEach((_, i) => { const x = (i / 4095) * 2 - 1, m = Math.abs(x); curve[i] = Math.sign(x) * (m <= 0.6 ? m : 0.6 + 0.4 * Math.tanh((m - 0.6) / 0.4)); });
  safe.curve = curve; safe.oversample = '2x';
  master.connect(sub); sub.connect(lim); lim.connect(safe); safe.connect(ac.destination);

  // Reverb: impulse response is just decaying stereo noise; length = size of the space.
  const verb = ac.createConvolver(), len = Math.floor(ac.sampleRate * M.space);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  verb.buffer = ir;
  const wet = ac.createGain(); wet.gain.value = 0.45; verb.connect(wet); wet.connect(master);
  const bus = ac.createBiquadFilter(); bus.frequency.value = M.cutoff; bus.connect(master); bus.connect(verb);
  // Ping-pong echo (from cabasa): left -> right -> feedback -> left, one loop so the ring gain is fb;
  // the repeats lose lows and highs each time round, dub style (from eph).
  const echo = ac.createDelay(2), echoR = ac.createDelay(2), fb = ac.createGain(), hp = ac.createBiquadFilter(), lp = ac.createBiquadFilter();
  echo.delayTime.value = echoR.delayTime.value = 60 / song.bpm * 0.75; fb.gain.value = 0.35;
  hp.type = 'highpass'; hp.frequency.value = 280; lp.frequency.value = 3200;
  echo.connect(echoR); echoR.connect(hp); hp.connect(lp); lp.connect(fb); fb.connect(echo);
  for (const [d, p] of [[echo, -0.7], [echoR, 0.7]]) { const pan = ac.createStereoPanner(); pan.pan.value = p; d.connect(pan); pan.connect(bus); }
  // each voice sits in its own place across the stereo field; bass stays in the middle
  const PAN = { lead: -0.2, comp: 0.35, bass: 0, pad: -0.45 }, place = {};
  for (const v in PAN) { place[v] = ac.createStereoPanner(); place[v].pan.value = PAN[v]; place[v].connect(bus); }
  let out = bus; // where amp() sends a note: the panner of the voice being played

  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  noise.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const osc = (type, f, t, end, dest) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(t); if (end) o.stop(end); return o; };
  const amp = (t, peak, attack, decay, dest = out) => {
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
    pluck(f, t) { // a real plucked string: Karplus-Strong (from eph), a noise burst fed back through a one-period delay
      const sr = ac.sampleRate, n = Math.max(2, Math.round(sr / f)), buf = ac.createBuffer(1, Math.ceil(sr * 1.2), sr), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = i < n ? Math.random() * 2 - 1 : 0.498 * (d[i - n] + d[i - n + 1]); // < 0.5 or it never dies out
      const s = ac.createBufferSource(), e = amp(t, 0.16, 0.002, 1.1);
      s.buffer = buf; s.connect(e); s.start(t); e.connect(echo);
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
  const groove = song.style === 'groove' || song.style === 'tense'; // both drive with drums
  const tick = () => {
    const interest = getInterest();
    bus.frequency.setTargetAtTime(M.cutoff * (0.7 + interest * 0.08), ac.currentTime, 2);
    while (next < ac.currentTime + 1) {
      for (const x of song.bar(n, interest).notes) {
        out = place[x.voice] ?? bus;
        const t = next + x.beat * beat, f = hz(x.midi) * (M.microtonal && x.voice === 'lead' ? 2 ** ((r() - 0.5) * 0.05) : 1), dur = x.dur * beat;
        if (x.voice === 'lead') INSTR[M.lead](f, t, dur);
        if (x.voice === 'comp') groove ? INSTR.pluck(f, t) : INSTR.piano(f, t, dur, x.vel * (0.6 + interest * 0.04));
        if (x.voice === 'bass' && (M.bass || groove)) osc('triangle', f, t, t + dur + 0.1, amp(t, 0.16 * x.vel, 0.01, dur));
        if (x.voice === 'pad') INSTR.pad(f, t, dur);
      }
      if (M.perc || groove) for (let s = 0; s < 8; s++) { // 8ths: kick on 1 and 3 (and the "and" of 3 in a groove), hats, a soft snare on 2 and 4
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

// Sound effects, synthesized on the spot. They play even with the music off, softly.
let sac;
export function sfx(kind) {
  try { sac ??= new AudioContext(); sac.resume(); } catch { return; }
  const t = sac.currentTime + 0.02, out = sac.createGain();
  out.gain.value = 0.3; out.connect(sac.destination);
  const env = (at, peak, dur) => { const g = sac.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); g.connect(out); return g; };
  const tone = (type, f, at, dur, peak, f2) => {
    const o = sac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur * 0.8);
    o.connect(env(at, peak, dur)); o.start(at); o.stop(at + dur + 0.05);
  };
  const noise = (at, dur, peak, freq, type = 'bandpass') => {
    const b = sac.createBuffer(1, Math.ceil(sac.sampleRate * dur), sac.sampleRate), s = sac.createBufferSource(), f = sac.createBiquadFilter();
    b.getChannelData(0).forEach((_, i, d) => (d[i] = Math.random() * 2 - 1));
    s.buffer = b; f.type = type; f.frequency.value = freq; s.connect(f); f.connect(env(at, peak, dur)); s.start(at);
  };
  if (kind === 'plant') { noise(t, 0.18, 0.5, 3200); tone('sine', 880, t + 0.08, 0.25, 0.25); tone('sine', 1320, t + 0.16, 0.35, 0.2); } // rustle, then a soft chime
  if (kind === 'creature') { tone('sine', 600, t, 0.12, 0.3, 1400); tone('sine', 700, t + 0.15, 0.12, 0.3, 1600); tone('triangle', 520, t + 0.3, 0.2, 0.25); } // two chirps and a pop
  if (kind === 'ore') { tone('square', 1800, t, 0.08, 0.12); tone('triangle', 2700, t + 0.01, 0.25, 0.2); noise(t, 0.08, 0.4, 500, 'lowpass'); } // clink on a thud
  if (kind === 'build') { // three hammer knocks, then a bright chord
    for (const k of [0, 0.18, 0.36]) { noise(t + k, 0.1, 0.6, 400, 'lowpass'); tone('sine', 150, t + k, 0.12, 0.4, 60); }
    [523, 659, 784, 1046].forEach((f, k) => tone('triangle', f, t + 0.55 + k * 0.07, 0.6, 0.18));
  }
  if (kind === 'move') noise(t, 0.4, 0.35, 900); // a whoosh
  if (kind === 'pickup') [1046, 1568, 2093].forEach((f, k) => tone('sine', f, t + k * 0.06, 0.3, 0.18)); // sparkle
}
