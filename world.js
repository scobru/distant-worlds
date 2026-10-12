// Pure, deterministic world generation: same seed => same world, everywhere.

export function hashSeed(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => Math.random().toString(36).slice(2, 10);

const SYL = ['ka', 've', 'lor', 'ny', 'tha', 'ri', 'os', 'mu', 'zen', 'ae', 'quel', 'dra', 'si', 'on', 'xi', 'ul', 'bre', 'ith'];
const SCALES = {
  pentatonic: [0, 2, 4, 7, 9],
  minorPenta: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  hirajoshi: [0, 2, 3, 7, 8],
};

// 1D smooth value noise over x in [0,1], `octaves` layers.
function ridge(r, points, octaves, rough) {
  const out = new Float32Array(points);
  let amp = 1, freq = 2 + Math.floor(r() * 4), total = 0;
  for (let o = 0; o < octaves; o++) {
    const knots = Array.from({ length: freq + 1 }, r);
    for (let i = 0; i < points; i++) {
      const x = (i / (points - 1)) * freq, k = Math.floor(x), f = x - k;
      const s = f * f * (3 - 2 * f);
      out[i] += amp * (knots[k] * (1 - s) + knots[Math.min(k + 1, freq)] * s);
    }
    total += amp; amp *= rough; freq *= 2;
  }
  for (let i = 0; i < points; i++) out[i] /= total;
  return out;
}

export function makeWorld(seedStr) {
  const r = rng(hashSeed(seedStr));
  const pick = (a) => a[Math.floor(r() * a.length)];

  const n = 2 + Math.floor(r() * 2);
  let name = Array.from({ length: n }, () => pick(SYL)).join('');
  name = name[0].toUpperCase() + name.slice(1) + (r() < 0.3 ? ' ' + pick(['Prime', 'IV', 'b', 'Minor', 'Reach']) : '');

  const hue = Math.floor(r() * 360);
  const shift = 40 + r() * 140;
  const night = r() < 0.35;
  const sky = {
    top: `hsl(${hue} ${30 + r() * 40}% ${night ? 4 : 12 + r() * 15}%)`,
    bottom: `hsl(${(hue + shift) % 360} ${50 + r() * 40}% ${night ? 15 : 45 + r() * 25}%)`,
  };
  const groundHue = (hue + 180 + (r() - 0.5) * 80) % 360;

  const nLayers = 3 + Math.floor(r() * 3);
  const layers = Array.from({ length: nLayers }, (_, i) => {
    const depth = i / (nLayers - 1); // 0 far, 1 near
    return {
      heights: ridge(r, 160, 4, 0.35 + r() * 0.3),
      base: 0.5 + depth * 0.32,
      span: 0.12 + r() * 0.25 * (1 - depth * 0.5),
      color: `hsl(${groundHue} ${20 + r() * 30}% ${night ? 4 + depth * 6 : 30 - depth * 22}%)`,
    };
  });

  const scaleName = pick(Object.keys(SCALES));
  return {
    seed: seedStr,
    name,
    night,
    sky,
    stars: night ? 300 : Math.floor(r() * 60),
    sun: { x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.3, size: 0.03 + r() * 0.09, color: `hsl(${(hue + shift + 20) % 360} 90% ${night ? 85 : 75}%)` },
    moons: Array.from({ length: Math.floor(r() * 4) }, () => ({ x: r(), y: 0.05 + r() * 0.3, size: 0.006 + r() * 0.03 })),
    rings: r() < 0.25,
    water: r() < 0.5 ? `hsl(${(hue + shift) % 360} 50% ${night ? 8 : 30}%)` : null,
    layers,
    music: {
      root: 36 + Math.floor(r() * 12), // MIDI, C2..B2
      scaleName,
      scale: SCALES[scaleName],
      bpm: 50 + Math.floor(r() * 50),
      wave: pick(['sine', 'triangle', 'sawtooth']),
      density: 0.25 + r() * 0.5,
      cutoff: 400 + r() * 1800,
      noteSeed: hashSeed(seedStr + ':music'),
    },
  };
}
