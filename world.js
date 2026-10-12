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

// Seeds carry the generator version: a future v2 must keep generating v1 seeds the v1 way,
// so links people already shared keep showing the same world.
export const VERSION = 'v1';
export const randomSeed = () => `${VERSION}-${Math.random().toString(36).slice(2, 10)}`;

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

// Trait tables with relative weights: lower weight = rarer.
export const TRAITS = {
  era: { antico: 3, medievale: 3, industriale: 2, presente: 2, futuro: 2, 'lontano futuro': 1 },
  civ: { disabitato: 4, umani: 3, rovine: 2, alieni: 1 },
  flora: { brullo: 3, foresta: 3, conifere: 3, funghi: 1.5, cristalli: 1 },
  fauna: { nessuna: 3, uccelli: 4, branchi: 3, giganti: 1, meduse: 1, balene: 0.5 },
  style: { classico: 5, pastello: 2, seppia: 1.5, mono: 1, neon: 1 },
};
const ERE = Object.keys(TRAITS.era);
// Chance of the yes/no traits.
const P = { notte: 0.35, anelli: 0.2, mare: 0.5 };

// Rarity class from the world's improbability, in bits (-log2 p).
// Thresholds tuned so roughly 60% / 27% / 10% / 3% of worlds land in each class.
export const RARITA = [['comune', 0], ['raro', 14], ['epico', 15.7], ['leggendario', 17.3]];

const STRUTTURE = {
  antico: ['piramide', 'tempio', 'obelisco'],
  medievale: ['castello', 'casa', 'mulino'],
  industriale: ['fabbrica', 'casa', 'palazzo'],
  presente: ['palazzo', 'casa', 'antenna'],
  futuro: ['torre', 'cupola', 'antenna'],
  'lontano futuro': ['torre', 'cupola', 'arco'],
};
const ALIENE = ['guglia', 'sfera', 'baccelli', 'guglia'];

// Visual style is a filter on every colour the world picks.
function toner(style) {
  return (h, s, l) => {
    if (style === 'neon') { s = 100; l *= 0.7; }
    if (style === 'pastello') { s *= 0.5; l = 45 + l * 0.5; }
    if (style === 'mono') s = 0;
    if (style === 'seppia') { h = 30; s *= 0.45; }
    return `hsl(${Math.round(h % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;
  };
}

export function makeWorld(seedStr) {
  const r = rng(hashSeed(seedStr));
  const pick = (a) => a[Math.floor(r() * a.length)];
  let bits = 0;
  const wpick = (table) => {
    const total = Object.values(table).reduce((a, b) => a + b);
    let x = r() * total;
    for (const [k, w] of Object.entries(table)) if ((x -= w) < 0) { bits -= Math.log2(w / total); return k; }
    const k = Object.keys(table).at(-1); bits -= Math.log2(table[k] / total); return k;
  };
  const chance = (p) => { const yes = r() < p; bits -= Math.log2(yes ? p : 1 - p); return yes; };

  const n = 2 + Math.floor(r() * 2);
  let name = Array.from({ length: n }, () => pick(SYL)).join('');
  name = name[0].toUpperCase() + name.slice(1) + (r() < 0.3 ? ' ' + pick(['Prime', 'IV', 'b', 'Minor', 'Reach']) : '');

  const era = wpick(TRAITS.era), civ = wpick(TRAITS.civ), flora = wpick(TRAITS.flora), style = wpick(TRAITS.style);
  const eraIdx = ERE.indexOf(era);
  const c = toner(style);

  const hue = Math.floor(r() * 360);
  const shift = 40 + r() * 140;
  const night = chance(P.notte);
  const sky = {
    top: c(hue, 30 + r() * 40, night ? 4 : 12 + r() * 15),
    bottom: c(hue + shift, 50 + r() * 40, night ? 15 : 45 + r() * 25),
  };
  const groundHue = hue + 180 + (r() - 0.5) * 80;
  const accent = c(hue + shift + 180, 90, 65);

  const nLayers = 3 + Math.floor(r() * 3);
  const layers = Array.from({ length: nLayers }, (_, i) => {
    const depth = i / (nLayers - 1); // 0 far, 1 near
    return {
      heights: ridge(r, 160, 4, 0.35 + r() * 0.3),
      base: 0.5 + depth * 0.32,
      span: 0.12 + r() * 0.25 * (1 - depth * 0.5),
      color: c(groundHue, 20 + r() * 30, night ? 4 + depth * 6 : 30 - depth * 22),
      things: [],
    };
  });

  // Structures sit on the two nearest-but-last layers (far ones are too small to read).
  if (civ !== 'disabitato') {
    const kinds = civ === 'alieni' ? ALIENE : STRUTTURE[era];
    for (let k = 2 + Math.floor(r() * 6); k--;) {
      const L = layers[nLayers - 2 - Math.floor(r() * Math.min(2, nLayers - 1))];
      L.things.push({ kind: pick(kinds), x: r(), size: 0.05 + r() * 0.09, seed: Math.floor(r() * 2 ** 32), broken: civ === 'rovine' });
    }
  }
  if (flora !== 'brullo') {
    for (const L of layers.slice(-2)) for (let k = Math.floor(r() * 25); k--;)
      L.things.push({ kind: flora, x: r(), size: 0.015 + r() * 0.04, seed: Math.floor(r() * 2 ** 32) });
  }
  for (const L of layers) L.things.sort((a, b) => b.size - a.size);

  // Creatures: flyers live in the sky, walkers on a ridge. Speeds are in screen-widths per ms.
  const fauna = wpick(TRAITS.fauna), flyers = [];
  const sign = () => (r() < 0.5 ? -1 : 1);
  const walk = (L, kind, x, speed, size) => L.creatures.push({ kind, x, speed, size, seed: Math.floor(r() * 2 ** 32) });
  for (const L of layers) L.creatures = [];
  const near = layers[nLayers - 1], mid = layers[nLayers - 2];
  if (fauna === 'uccelli') for (let k = 1 + Math.floor(r() * 3); k--;)
    flyers.push({ kind: 'stormo', x: r(), y: 0.1 + r() * 0.3, speed: sign() * (1 + r() * 2) * 1e-5, size: 0.006 + r() * 0.006, seed: Math.floor(r() * 2 ** 32) });
  if (fauna === 'meduse') for (let k = 2 + Math.floor(r() * 5); k--;)
    flyers.push({ kind: 'medusa', x: r(), y: 0.1 + r() * 0.35, speed: sign() * r() * 3e-6, size: 0.015 + r() * 0.02, seed: Math.floor(r() * 2 ** 32) });
  if (fauna === 'balene') for (let k = 1 + Math.floor(r() * 2); k--;)
    flyers.push({ kind: 'balena', x: r(), y: 0.1 + r() * 0.2, speed: sign() * (2 + r() * 2) * 1e-6, size: 0.08 + r() * 0.07, seed: Math.floor(r() * 2 ** 32) });
  if (fauna === 'branchi') {
    const L = r() < 0.5 ? near : mid, x = r(), v = sign() * (2 + r() * 3) * 1e-6;
    for (let k = 3 + Math.floor(r() * 5); k--;) walk(L, 'quadrupede', x + r() * 0.12, v, 0.03 + r() * 0.02);
  }
  if (fauna === 'giganti') for (let k = 1 + Math.floor(r() * 3); k--;)
    walk(layers[Math.min(1, nLayers - 2)], 'gigante', r(), sign() * (1 + r()) * 1e-6, 0.08 + r() * 0.07);
  if (civ === 'umani' || civ === 'alieni') for (let k = 2 + Math.floor(r() * 5); k--;)
    walk(mid, civ === 'umani' ? 'abitante' : 'alieno', r(), sign() * (3 + r() * 5) * 1e-6, 0.028 + r() * 0.012);

  const rings = chance(P.anelli), sea = chance(P.mare);
  const traits = { era, civ, flora, fauna, style, notte: night, anelli: rings, mare: sea };
  const rarity = RARITA.findLast(([, min]) => bits >= min)[0];

  const scaleName = civ === 'alieni' ? pick(['hirajoshi', 'lydian']) : pick(Object.keys(SCALES));
  return {
    seed: seedStr,
    name, era, civ, flora, fauna, style, flyers, traits, bits, rarity, night, sky, accent, layers,
    lights: civ !== 'rovine' && civ !== 'disabitato' && (eraIdx >= 2 || civ === 'alieni'),
    ships: eraIdx >= 4 || civ === 'alieni' ? Math.floor(r() * 5) : 0,
    stars: night ? 300 : Math.floor(r() * 60),
    sun: { x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.3, size: 0.03 + r() * 0.09, color: c(hue + shift + 20, 90, night ? 85 : 75) },
    moons: Array.from({ length: Math.floor(r() * 4) }, () => ({ x: r(), y: 0.05 + r() * 0.3, size: 0.006 + r() * 0.03 })),
    rings,
    water: sea ? c(hue + shift, 50, night ? 8 : 30) : null,
    music: {
      root: 36 + Math.floor(r() * 12), // MIDI, C2..B2
      scaleName,
      scale: SCALES[scaleName],
      bpm: 50 + Math.floor(r() * 50),
      // Older eras sound softer, future ones brighter and buzzier.
      wave: ['triangle', 'triangle', 'square', 'sine', 'sawtooth', 'sawtooth'][eraIdx],
      microtonal: civ === 'alieni',
      density: (civ === 'disabitato' ? 0.15 : 0.25) + r() * 0.4,
      cutoff: 400 + eraIdx * 200 + r() * 1200,
      noteSeed: hashSeed(seedStr + ':music'),
    },
  };
}
