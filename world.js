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

// 128-bit hash + sfc32 so distinct seeds give distinct worlds (a 32-bit state collides
// after ~65k worlds by the birthday bound).
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (const ch of str) {
    const k = ch.codePointAt(0);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}
export function rngFrom(str) {
  let [a, b, c, d] = cyrb128(str);
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

// Seeds carry the generator version: a future v2 must keep generating v1 seeds the v1 way,
// so links people already shared keep showing the same world.
export const VERSION = 'v1';

// Galaxy: a GALAXY x GALAXY torus of sectors, each holding a few stars; a star's seed is
// "v1-<sx>_<sy>_<i>". Seeds of other shapes still make worlds, they just aren't on the map.
export const GALAXY = 10000;
export const wrapS = (v) => ((v % GALAXY) + GALAXY) % GALAXY;
export function starsIn(sx, sy) {
  const r = rngFrom(`${VERSION}:settore:${sx}:${sy}`);
  return Array.from({ length: 4 + Math.floor(r() * 6) }, (_, i) => ({ seed: `${VERSION}-${sx}_${sy}_${i}`, x: sx + r(), y: sy + r() }));
}
export const sectorOf = (seed) => { const m = /^v1-(\d+)_(\d+)_\d+$/.exec(seed); return m && [+m[1], +m[2]]; };
export function randomSeed(rand = Math.random) {
  const sx = Math.floor(rand() * GALAXY), sy = Math.floor(rand() * GALAXY), stars = starsIn(sx, sy);
  return stars[Math.floor(rand() * stars.length)].seed;
}

// Regions span 4x4 sectors and bias what their worlds are made of.
export const REGIONI = [
  ['Spazio profondo', 6, {}],
  ['Nebulosa aliena', 1, { civ: { alieni: 8 } }],
  ['Settore delle rovine', 1, { civ: { rovine: 6 } }],
  ['Ammasso antico', 1, { era: { antico: 4, medievale: 3 } }],
  ['Frontiera del futuro', 1, { era: { futuro: 4, 'lontano futuro': 6 } }],
  ['Giardino stellare', 1, { flora: { foresta: 2, funghi: 4, cristalli: 5 } }],
  ['Mari del cielo', 1, { fauna: { balene: 10, meduse: 5 } }],
];
export function regionAt(sx, sy) {
  const r = rngFrom(`${VERSION}:regione:${Math.floor(sx / 4)}:${Math.floor(sy / 4)}`);
  let x = r() * REGIONI.reduce((a, [, w]) => a + w, 0);
  return REGIONI.find(([, w]) => (x -= w) < 0) ?? REGIONI[0];
}

const SYL = ['ka', 've', 'lor', 'ny', 'tha', 'ri', 'os', 'mu', 'zen', 'ae', 'quel', 'dra', 'si', 'on', 'xi', 'ul', 'bre', 'ith'];
const SCALES = {
  pentatonic: [0, 2, 4, 7, 9],
  minorPenta: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  hirajoshi: [0, 2, 3, 7, 8],
};

// Terrain is a function of x (in screen widths, any value), not a stored array, so a
// world can be walked forever. Knots come from an integer hash of (layer, octave, index).
function knot(seed, o, i) {
  let h = Math.imul(seed ^ Math.imul(o + 1, 0x9e3779b1) ^ Math.imul(i, 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
export function height(L, x) {
  let amp = 1, f = L.freq, sum = 0, total = 0;
  for (let o = 0; o < 4; o++) {
    const X = x * f, k = Math.floor(X), t = X - k, s = t * t * (3 - 2 * t);
    sum += amp * (knot(L.seed, o, k) * (1 - s) + knot(L.seed, o, k + 1) * s);
    total += amp; amp *= L.rough; f *= 2;
  }
  return sum / total;
}

export const REPERTI = ['portale', 'monolite', 'scheletro'];

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
  const r = rngFrom(seedStr);
  const sector = sectorOf(seedStr), region = sector && regionAt(...sector);
  // Regional bias multiplies the global weights; rarity is measured against what was used.
  const T = (k) => Object.fromEntries(Object.entries(TRAITS[k]).map(([v, w]) => [v, w * (region?.[2][k]?.[v] ?? 1)]));
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

  const era = wpick(T('era')), civ = wpick(T('civ')), flora = wpick(T('flora')), style = wpick(T('style'));
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
      seed: Math.floor(r() * 2 ** 32),
      freq: 2 + Math.floor(r() * 4),
      rough: 0.35 + r() * 0.3,
      base: 0.5 + depth * 0.32,
      span: 0.12 + r() * 0.25 * (1 - depth * 0.5),
      color: c(groundHue, 20 + r() * 30, night ? 16 - depth * 12 : 30 - depth * 22),
      parallax: 0.15 + depth * 0.85,
    };
  });

  // Flyers live in the sky and follow the traveller; walkers are placed per chunk (see chunk()).
  // Speeds are in screen-widths per ms.
  const fauna = wpick(T('fauna')), flyers = [];
  const sign = () => (r() < 0.5 ? -1 : 1);
  if (fauna === 'uccelli') for (let k = 1 + Math.floor(r() * 3); k--;)
    flyers.push({ kind: 'stormo', x: r(), y: 0.1 + r() * 0.3, speed: sign() * (1 + r() * 2) * 1e-5, size: 0.006 + r() * 0.006, seed: Math.floor(r() * 2 ** 32) });
  if (fauna === 'meduse') for (let k = 2 + Math.floor(r() * 5); k--;)
    flyers.push({ kind: 'medusa', x: r(), y: 0.1 + r() * 0.35, speed: sign() * r() * 3e-6, size: 0.015 + r() * 0.02, seed: Math.floor(r() * 2 ** 32) });
  if (fauna === 'balene') for (let k = 1 + Math.floor(r() * 2); k--;)
    flyers.push({ kind: 'balena', x: r(), y: 0.1 + r() * 0.2, speed: sign() * (2 + r() * 2) * 1e-6, size: 0.08 + r() * 0.07, seed: Math.floor(r() * 2 ** 32) });
  const pop = {
    structs: civ === 'disabitato' ? null : civ === 'alieni' ? ALIENE : STRUTTURE[era],
    structDensity: 0.5 + r() * 2.5, // mean per chunk
    floraDensity: flora === 'brullo' ? 0 : r() * 20,
    herdLayer: nLayers - 1 - Math.floor(r() * 2),
  };
  const species = fauna === 'branchi' || fauna === 'giganti'
    ? Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => makeSpecies(seedStr, k, fauna === 'giganti')) : [];

  const rings = chance(P.anelli), sea = chance(P.mare);
  const traits = { era, civ, flora, fauna, style, notte: night, anelli: rings, mare: sea };
  const rarity = RARITA.findLast(([, min]) => bits >= min)[0];

  const scaleName = civ === 'alieni' ? pick(['hirajoshi', 'lydian']) : pick(Object.keys(SCALES));
  return {
    seed: seedStr, sector, region: region?.[0] ?? null, species,
    name, era, civ, flora, fauna, style, flyers, pop, traits, bits, rarity, night, sky, accent, layers,
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
      microtonal: civ === 'alieni',
      density: (civ === 'disabitato' ? 0.15 : 0.25) + r() * 0.4,
      cutoff: 400 + eraIdx * 200 + r() * 1200,
      noteSeed: hashSeed(seedStr + ':music'),
      // Timbre: older eras lean acoustic, future and alien worlds lean synthetic.
      lead: civ === 'alieni' ? pick(['vetro', 'campana']) : pick([
        ['flauto', 'pizzico', 'marimba', 'campana'], ['flauto', 'pizzico', 'marimba', 'campana'],
        ['pizzico', 'marimba', 'campana', 'flauto'], ['pizzico', 'marimba', 'campana', 'vetro'],
        ['campana', 'vetro', 'pizzico', 'marimba'], ['vetro', 'campana', 'vetro', 'pizzico']][eraIdx]),
      drone: pick(['organo', 'vento', 'coro', 'organo', 'vento']),
      pad: r() < 0.5,
      bass: r() < 0.5,
      perc: r() < (eraIdx >= 2 ? 0.45 : 0.12),
      space: 1.5 + r() * 4.5, // reverb seconds
    },
  };
}

// Everything standing on layer `i` between x = c and c + 1 (one screen width). Pure, so
// chunks can be dropped when off screen and rebuilt identically when the traveller returns.
export function chunk(w, i, c) {
  const r = rngFrom(`${w.seed}:${i}:${c}`), n = w.layers.length, things = [], creatures = [];
  const pick = (a) => a[Math.floor(r() * a.length)];
  const count = (mean) => Math.floor(mean * 2 * r());
  const id = () => Math.floor(r() * 2 ** 32);
  if (w.pop.structs && (i === n - 2 || i === n - 3)) for (let k = count(w.pop.structDensity / 2); k--;)
    things.push({ kind: pick(w.pop.structs), x: c + r(), size: 0.05 + r() * 0.09, seed: id(), broken: w.civ === 'rovine' });
  if (i >= n - 2) for (let k = count(w.pop.floraDensity / 2); k--;)
    things.push({ kind: w.flora, x: c + r(), size: 0.015 + r() * 0.04, seed: id() });
  if (i === n - 2 && r() < 0.06) things.push({ kind: pick(REPERTI), x: c + 0.2 + r() * 0.6, size: 0.1, seed: id(), relic: true });
  things.sort((a, b) => b.size - a.size);

  // Walkers pace back and forth over [x, x + range] (see walkerAt), so they never pop at chunk edges.
  const walker = (kind, x, range, speed, size, dna) => creatures.push({ kind, x, range, speed, size, phase: r() * 2, seed: id(), dna });
  if (w.fauna === 'branchi' && i === w.pop.herdLayer && r() < 0.5) {
    const x = c + 0.1 + r() * 0.5, v = (2 + r() * 3) * 1e-6;
    const sp = pick(w.species);
    for (let k = 3 + Math.floor(r() * 5); k--;) walker('specie', x + r() * 0.12, 0.25, v * sp.pace, 0.03 + r() * 0.02, sp);
  }
  if (w.fauna === 'giganti' && i === Math.min(1, n - 2) && r() < 0.5) {
    const sp = pick(w.species);
    walker('specie', c + r() * 0.4, 0.5, (1 + r()) * 1e-6 * sp.pace, 0.1 + r() * 0.08, sp);
  }
  if ((w.civ === 'umani' || w.civ === 'alieni') && i === n - 2) for (let k = count(1.5); k--;)
    walker(w.civ === 'umani' ? 'abitante' : 'alieno', c + r() * 0.7, 0.3, (3 + r() * 5) * 1e-6, 0.028 + r() * 0.012);
  return { things, creatures };
}

// Position and facing (+1 right, -1 left) of a walker at time t (ms).
export function walkerAt(cr, t) {
  const u = (((cr.phase + (t * cr.speed) / cr.range) % 2) + 2) % 2;
  return [cr.x + cr.range * (1 - Math.abs(u - 1)), u < 1 ? 1 : -1];
}

// Species are built from parts, so every world can have animals nobody has seen before.
export const DNA = {
  legs: { 4: 6, 2: 3, 6: 1 },
  neck: { nessuno: 3, corto: 4, lungo: 2 },
  head: { tonda: 4, allungata: 3, piatta: 2 },
  extra: { niente: 5, corna: 3, antenne: 1.5, cresta: 1.5 },
  tail: { nessuna: 2, corta: 4, lunga: 3, folta: 1 },
  pattern: { liscio: 5, macchie: 2, strisce: 2 },
};
const SUFFIX = ['odonte', 'ide', 'ope', 'ulo', 'ante', 'aro', 'ix'];
export const SPECIES_RARITY = [['comune', 0], ['raro', 9.8], ['epico', 11.3], ['leggendario', 12.4]];

export function makeSpecies(worldSeed, k, giant) {
  const r = rngFrom(`${worldSeed}:specie:${k}`);
  let bits = 0;
  const wpick = (table) => {
    const total = Object.values(table).reduce((a, b) => a + b);
    let x = r() * total;
    const [v, w] = Object.entries(table).find(([, w]) => (x -= w) < 0) ?? Object.entries(table).at(-1);
    bits -= Math.log2(w / total);
    return v;
  };
  const dna = Object.fromEntries(Object.entries(DNA).map(([part, t]) => [part, wpick(t)]));
  dna.legs = +dna.legs;
  const name = SYL[Math.floor(r() * SYL.length)] + SYL[Math.floor(r() * SYL.length)] + SUFFIX[Math.floor(r() * SUFFIX.length)];
  return {
    id: `${worldSeed}#${k}`,
    name: name[0].toUpperCase() + name.slice(1),
    ...dna,
    bodyLen: 0.35 + r() * 0.35, bodyH: 0.12 + r() * 0.15,
    legLen: (giant ? 0.6 : 0.25) + r() * 0.4,
    neckLen: { nessuno: 0, corto: 0.25, lungo: giant ? 1 : 0.6 }[dna.neck] * (0.7 + r() * 0.6),
    pace: 0.6 + r() * 0.8,
    rarity: SPECIES_RARITY.findLast(([, min]) => bits >= min)[0],
    bits,
  };
}
