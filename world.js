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
// "v1-<sx>_<sy>_<i>", or "v1-<sx>_<sy>_<i>.<g>" for the g-th world born from that star (see lifeOf).
// Seeds of other shapes still make worlds, they just aren't on the map.
export const GALAXY = 10000;
export const wrapS = (v) => ((v % GALAXY) + GALAXY) % GALAXY;
const STAR = /^v1-(\d+)_(\d+)_(\d+)(?:\.([1-9]\d*))?$/;
export function starsIn(sx, sy, now = Date.now()) {
  const r = rngFrom(`${VERSION}:settore:${sx}:${sy}`);
  return Array.from({ length: 4 + Math.floor(r() * 6) }, (_, i) => ({ ...lifeOf(sx, sy, i, now), x: sx + r(), y: sy + r() }));
}
export const sectorOf = (seed) => { const m = STAR.exec(seed); return m && [+m[1], +m[2]]; };
export function randomSeed(rand = Math.random, now = Date.now()) {
  const sx = Math.floor(rand() * GALAXY), sy = Math.floor(rand() * GALAXY), stars = starsIn(sx, sy, now);
  return stars[Math.floor(rand() * stars.length)].seed;
}

// Worlds are born, age and collapse; then their star makes a new one. The clock is the same for
// everyone: each star has its own lifespan (30-120 days) and phase, counted from EPOCH.
export const EPOCH = Date.UTC(2026, 9, 1), DAY = 864e5;
/** The world star (sx, sy, i) holds at `now`: its seed, age (0-100) and when it collapses. */
const lifespan = (sx, sy, i) => { const r = rngFrom(`life:${sx}_${sy}_${i}`), span = (30 + r() * 90) * DAY; return [span, r() * span]; };
export function lifeOf(sx, sy, i, now = Date.now()) {
  const [span, off] = lifespan(sx, sy, i);
  const u = (now - EPOCH + off) / span, gen = Math.max(0, Math.floor(u));
  return { seed: `${VERSION}-${sx}_${sy}_${i}${gen ? '.' + gen : ''}`, gen, age: (u - gen) * 100, collapse: EPOCH - off + (gen + 1) * span };
}
/** Life of the world `seed`: null off the map; `dead` (with the star's current world) once it collapsed. */
export function ageOf(seed, now = Date.now()) {
  const m = STAR.exec(seed);
  if (!m) return null;
  const cur = lifeOf(+m[1], +m[2], +m[3], now), gen = +(m[4] ?? 0);
  return gen === cur.gen ? cur : { ...cur, dead: gen < cur.gen, unborn: gen > cur.gen, next: cur.seed };
}
/** 0 while a world is young, rising to 1 as it nears collapse (from age 70). */
export const instability = (age) => Math.max(0, Math.min(1, (age - 70) / 30));

// Regions span 4x4 sectors and bias what their worlds are made of.
export const REGIONS = [
  ['Deep Space', 6, {}],
  ['Alien Nebula', 1, { civ: { aliens: 8 } }],
  ['Ruins Sector', 1, { civ: { ruins: 6 } }],
  ['Ancient Cluster', 1, { era: { ancient: 4, medieval: 3 } }],
  ['Future Frontier', 1, { era: { future: 4, 'far future': 6 } }],
  ['Star Garden', 1, { flora: { forest: 2, mushrooms: 4, crystals: 5 } }],
  ['Sky Seas', 1, { fauna: { whales: 10, jellyfish: 5 } }],
  ['Sakura Drift', 1, { culture: { japanese: 10 } }],
  ['Dune Sea', 1, { culture: { desert: 8, western: 3 } }],
  ['Frozen Rim', 1, { culture: { arctic: 6, nordic: 5 } }],
  ['Ash Belt', 1, { culture: { apocalyptic: 6, war: 5 } }],
];
export function regionAt(sx, sy) {
  const r = rngFrom(`${VERSION}:regione:${Math.floor(sx / 4)}:${Math.floor(sy / 4)}`);
  let x = r() * REGIONS.reduce((a, [, w]) => a + w, 0);
  return REGIONS.find(([, w]) => (x -= w) < 0) ?? REGIONS[0];
}

const SYL = ['ka', 've', 'lor', 'ny', 'tha', 'ri', 'os', 'mu', 'zen', 'ae', 'quel', 'dra', 'si', 'on', 'xi', 'ul', 'bre', 'ith'];
const SCALES = {
  hijaz: [0, 1, 4, 5, 7, 8, 10],
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
function noise(L, x) {
  let amp = 1, f = L.freq, sum = 0, total = 0;
  for (let o = 0; o < 4; o++) {
    const X = x * f, k = Math.floor(X), t = X - k, s = t * t * (3 - 2 * t);
    sum += amp * (knot(L.seed, o, k) * (1 - s) + knot(L.seed, o, k + 1) * s);
    total += amp; amp *= L.rough; f *= 2;
  }
  return sum / total;
}
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Ground height in [0, 1] at x; the layer's shape gives each world its relief. */
export function height(L, x) {
  const v = noise(L, x);
  switch (L.shape) {
    case 'peaks': { // ridged: sharp crests, deep valleys
      const r = 1 - Math.abs(2 * v - 1);
      return r * r;
    }
    case 'mesas': { // flat tops and sheer walls, in steps
      const f = Math.min(v * 1.25, 0.999) * 3, k = Math.floor(f);
      return (k + smooth(0.8, 1, f - k)) / 3;
    }
    case 'dunes': { // long windward slopes, short steep lee faces
      const X = x * L.freq * 1.5, k = Math.floor(X), t = X - k;
      const saw = t < 0.8 ? smooth(0, 0.8, t) : 1 - smooth(0.8, 1, t);
      return 0.55 * v + 0.45 * saw * (0.6 + 0.4 * knot(L.seed, 9, k));
    }
    case 'spires': { // rolling ground pierced by needles of rock
      const X = x * L.freq * 2, k = Math.floor(X);
      let spike = 0;
      for (const c of [k - 1, k, k + 1]) {
        if (knot(L.seed, 7, c) < 0.55) continue;
        const d = Math.abs(X - (c + 0.5)) / (0.08 + 0.1 * knot(L.seed, 8, c));
        if (d < 1) spike = Math.max(spike, (1 - d) ** 2 * (0.5 + 0.5 * knot(L.seed, 6, c)));
      }
      return Math.min(1, 0.45 * v + spike);
    }
    default: return v;
  }
}

/** Rivers run from the horizon towards the viewer, about one every few screens. Pure, like chunk(). */
export function riversNear(w, x0, x1) {
  if (!w.rivers) return [];
  const out = [];
  for (let k = Math.floor(x0 / 1.6) - 1; k <= Math.floor(x1 / 1.6) + 1; k++) {
    const r = rngFrom(`${w.seed}:river:${k}`);
    if (r() < 0.7) out.push({ x: (k + 0.2 + r() * 0.6) * 1.6, width: 0.7 + r() * 0.9, phase: r() * 7 });
  }
  return out;
}

/** Columns of smoke rising from the far ranges (industry, ruins, war). */
export function smokeNear(w, x0, x1) {
  if (!w.smoke) return [];
  const out = [];
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1; k++) {
    const r = rngFrom(`${w.seed}:smoke:${k}`);
    if (r() < 0.6) out.push({ x: k + r(), size: 0.6 + r() * 0.8, phase: r() * 7 });
  }
  return out;
}

/** Volcanoes on the far ranges, a few screens apart, smoking and glowing with lava. */
export function volcanoesNear(w, x0, x1) {
  if (!w.volcanoes) return [];
  const out = [];
  for (let k = Math.floor(x0 / 2.5) - 1; k <= Math.floor(x1 / 2.5) + 1; k++) {
    const r = rngFrom(`${w.seed}:volcano:${k}`);
    if (r() < 0.6) out.push({ x: (k + 0.2 + r() * 0.6) * 2.5, size: 0.7 + r() * 0.8, phase: r() * 7, erupting: r() < 0.35 });
  }
  return out;
}

/** Waterfalls pouring down the face of a range, about one every couple of screens. */
export function fallsNear(w, x0, x1) {
  if (!w.falls) return [];
  const out = [];
  for (let k = Math.floor(x0 / 1.8) - 1; k <= Math.floor(x1 / 1.8) + 1; k++) {
    const r = rngFrom(`${w.seed}:falls:${k}`);
    if (r() < 0.65) out.push({ x: (k + 0.15 + r() * 0.7) * 1.8, width: 0.5 + r() * 0.9, phase: r() * 7 });
  }
  return out;
}

/** Floating islands drift in the sky (parallax ISLAND_PARALLAX), some pouring a waterfall. */
export const ISLAND_PARALLAX = 0.08;
export function islandsNear(w, x0, x1) {
  if (!w.islands) return [];
  const out = [];
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1; k++) {
    const r = rngFrom(`${w.seed}:islands:${k}`);
    for (let n = Math.floor(r() * 3); n--;) out.push({ x: k + r(), y: 0.14 + r() * 0.28, size: 0.06 + r() * 0.1, fall: r() < 0.6, tree: r() < 0.6, seed: Math.floor(r() * 2 ** 32) });
  }
  return out;
}

export const RELICS = ['portal', 'monolith', 'skeleton'];

// Trait tables with relative weights: lower weight = rarer.
export const TRAITS = {
  era: { ancient: 3, medieval: 3, industrial: 2, present: 2, future: 2, 'far future': 1 },
  civ: { uninhabited: 4, humans: 3, ruins: 2, aliens: 1 },
  culture: { temperate: 3, japanese: 2, nordic: 2, desert: 2, jungle: 1.5, western: 1.5, arctic: 1, apocalyptic: 1, war: 1 },
  flora: { barren: 3, forest: 3, conifers: 3, mushrooms: 1.5, crystals: 1, blossoms: 1, bamboo: 1, palms: 1, cacti: 1, deadwood: 1 },
  relief: { rolling: 3, peaks: 3, mesas: 1.5, dunes: 1.5, spires: 1, islands: 1 },
  fauna: { none: 3, birds: 4, herds: 3, giants: 1, jellyfish: 1, whales: 0.5 },
  style: { classic: 5, pastel: 2, sepia: 1.5, mono: 1, neon: 1 },
};
const ERAS = Object.keys(TRAITS.era);
// Chance of the yes/no traits.
const P = { night: 0.35, rings: 0.2, sea: 0.5 };

// Rarity class from the world's improbability, in bits (-log2 p).
// Thresholds tuned so roughly 60% / 27% / 10% / 3% of worlds land in each class.
export const RARITY = [['common', 0], ['rare', 19.4], ['epic', 21.9], ['legendary', 24.1]];

const STRUCTURES = {
  ancient: ['pyramid', 'temple', 'obelisk'],
  medieval: ['castle', 'house', 'windmill'],
  industrial: ['factory', 'house', 'block'],
  present: ['block', 'house', 'antenna'],
  future: ['tower', 'dome', 'antenna'],
  'far future': ['tower', 'dome', 'arch'],
};
const ALIEN_KINDS = ['spire', 'orb', 'pods', 'spire'];

// Cultures reinvent real places (One Piece style): each biases flora and relief, colours the world,
// brings its own buildings, weather and music. Bias multiplies the trait weights, like regions do.
const CULTURE_STYLE = { style: { classic: 4 } };
export const CULTURES = {
  temperate: { bias: {} },
  // (every other culture also gets CULTURE_STYLE: its colours should show)
  japanese: {
    bias: { flora: { blossoms: 12, bamboo: 8, conifers: 2 }, relief: { peaks: 3, islands: 2 } },
    hue: 330, ground: 140, kit: ['pagoda', 'torii', 'minka', 'pagoda'], weather: 'petals', scale: 'hirajoshi', lead: ['pluck', 'flute'],
  },
  nordic: {
    bias: { flora: { conifers: 10, barren: 2 }, relief: { peaks: 4, spires: 2 } },
    hue: 205, ground: 190, kit: ['longhouse', 'stavechurch', 'runestone'], weather: 'snow', scale: 'minorPenta', lead: ['flute', 'bell'], drone: 'choir',
  },
  desert: {
    bias: { flora: { palms: 10, barren: 5, cacti: 2 }, relief: { dunes: 8, mesas: 2 } },
    hue: 30, ground: 35, sat: 1.3, kit: ['mosque', 'mudhouse', 'pyramid', 'mudhouse'], weather: null, scale: 'hijaz', lead: ['pluck', 'flute'],
  },
  jungle: {
    bias: { flora: { forest: 8, palms: 4, bamboo: 3, mushrooms: 2 }, relief: { rolling: 2, spires: 3, islands: 2 } },
    hue: 150, ground: 120, kit: ['steppyramid', 'stilthut', 'totem'], weather: null, scale: 'pentatonic', lead: ['marimba'], perc: true,
  },
  western: {
    bias: { flora: { cacti: 12, barren: 4 }, relief: { mesas: 10 } },
    hue: 20, ground: 15, sat: 1.2, kit: ['saloon', 'watertower', 'windmill', 'saloon'], weather: null, scale: 'pentatonic', lead: ['pluck'],
  },
  arctic: {
    bias: { flora: { barren: 8, crystals: 4, conifers: 1 }, relief: { peaks: 3, spires: 3 } },
    hue: 195, ground: 200, light: 1.6, kit: ['igloo', 'lighthouse', 'igloo'], weather: 'snow', scale: 'lydian', lead: ['glass', 'bell'],
  },
  apocalyptic: {
    bias: { flora: { deadwood: 10, barren: 6, mushrooms: 3 }, relief: { rolling: 2, spires: 2 } },
    hue: 65, ground: 30, sat: 0.6, kit: ['wreck', 'shack', 'brokentower', 'antenna'], weather: 'ash', scale: 'minorPenta', lead: ['glass', 'pluck'], drone: 'wind',
  },
  war: {
    bias: { flora: { deadwood: 8, barren: 6 }, relief: { rolling: 4, mesas: 1 } },
    hue: 10, ground: 40, sat: 0.5, kit: ['bunker', 'watchtower', 'tank', 'searchlight'], weather: 'ash', scale: 'dorian', lead: ['pluck'], perc: true, drone: 'organ',
  },
};

// Visual style is a filter on every colour the world picks.
function toner(style) {
  return (h, s, l) => {
    if (style === 'neon') { s = 100; l *= 0.7; }
    if (style === 'pastel') { s *= 0.5; l = 45 + l * 0.5; }
    if (style === 'mono') s = 0;
    if (style === 'sepia') { h = 30; s *= 0.45; }
    return `hsl(${Math.round(h % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;
  };
}

export function makeWorld(seedStr) {
  const r = rngFrom(seedStr);
  const sector = sectorOf(seedStr), region = sector && regionAt(...sector);
  // Regional bias multiplies the global weights; rarity is measured against what was used.
  let cult = CULTURES.temperate;
  const T = (k) => Object.fromEntries(Object.entries(TRAITS[k]).map(([v, w]) => [v, w * (region?.[2][k]?.[v] ?? 1) * (cult.bias[k]?.[v] ?? 1)]));
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

  const culture = wpick(T('culture'));
  cult = CULTURES[culture];
  if (culture !== 'temperate') cult = { ...cult, bias: { ...CULTURE_STYLE, ...cult.bias } };
  const era = wpick(T('era')), civ = wpick(T('civ')), flora = wpick(T('flora')), style = wpick(T('style'));
  const eraIdx = ERAS.indexOf(era);
  const c = toner(style);

  const hue = cult.hue === undefined ? Math.floor(r() * 360) : cult.hue + (r() - 0.5) * 50;
  const shift = cult.hue === undefined ? 40 + r() * 140 : 20 + r() * 60;
  const night = chance(P.night);
  const sky = {
    top: c(hue, (30 + r() * 40) * (cult.sat ?? 1), night ? 4 : (12 + r() * 15) * (cult.light ?? 1)),
    bottom: c(hue + shift, Math.min(100, (50 + r() * 40) * (cult.sat ?? 1)), night ? 15 : Math.min(92, (45 + r() * 25) * (cult.light ?? 1))),
  };
  const groundHue = cult.ground === undefined ? hue + 180 + (r() - 0.5) * 80 : cult.ground + (r() - 0.5) * 30;
  const accent = c(hue + shift + 180, 90, 65);

  const relief = wpick(T('relief'));
  const nLayers = 3 + Math.floor(r() * 3);
  const layers = Array.from({ length: nLayers }, (_, i) => {
    const depth = i / (nLayers - 1); // 0 far, 1 near
    // the relief shapes the distant ranges; the two nearest layers stay walkable (dunes and mesas reach them)
    const shape = relief === 'islands' ? 'rolling' : i < nLayers - 2 || relief === 'dunes' || relief === 'mesas' ? relief : 'rolling';
    const tall = shape === 'peaks' || shape === 'spires' ? 1.8 : 1;
    return {
      seed: Math.floor(r() * 2 ** 32),
      freq: 2 + Math.floor(r() * 4),
      rough: 0.35 + r() * 0.3,
      shape,
      base: 0.5 + depth * 0.32,
      // tall ranges, but their crests stay below the top fifth of the sky
      span: Math.min((0.12 + r() * 0.25 * (1 - depth * 0.5)) * (depth < 0.7 ? tall : 1), 0.3 + depth * 0.32),
      color: c(groundHue, (20 + r() * 30) * (cult.sat ?? 1), night ? 16 - depth * 12 : Math.min(85, (30 - depth * 22) * (cult.light ?? 1) ** 2)),
      parallax: 0.15 + depth * 0.85,
    };
  });

  // Flyers live in the sky and follow the traveller; walkers are placed per chunk (see chunk()).
  // Speeds are in screen-widths per ms.
  const fauna = wpick(T('fauna')), flyers = [];
  const sign = () => (r() < 0.5 ? -1 : 1);
  if (fauna === 'birds') for (let k = 1 + Math.floor(r() * 3); k--;)
    flyers.push({ kind: 'flock', x: r(), y: 0.1 + r() * 0.3, speed: sign() * (1 + r() * 2) * 1e-5, size: 0.006 + r() * 0.006, seed: Math.floor(r() * 2 ** 32) });
  if (fauna === 'jellyfish') for (let k = 2 + Math.floor(r() * 5); k--;)
    flyers.push({ kind: 'jellyfish', x: r(), y: 0.1 + r() * 0.35, speed: sign() * r() * 3e-6, size: 0.015 + r() * 0.02, seed: Math.floor(r() * 2 ** 32) });
  if (fauna === 'whales') for (let k = 1 + Math.floor(r() * 2); k--;)
    flyers.push({ kind: 'whale', x: r(), y: 0.1 + r() * 0.2, speed: sign() * (2 + r() * 2) * 1e-6, size: 0.08 + r() * 0.07, seed: Math.floor(r() * 2 ** 32) });
  const pop = {
    // temperate worlds and the far future build by era; other cultures with their own kit
    structs: civ === 'uninhabited' ? null : civ === 'aliens' ? ALIEN_KINDS : cult.kit && eraIdx < 4 ? cult.kit : STRUCTURES[era],
    structDensity: 0.5 + r() * 2.5, // mean per chunk
    floraDensity: flora === 'barren' ? 0 : r() * 20,
    herdLayer: nLayers - 1 - Math.floor(r() * 2),
  };
  const plants = flora === 'barren' ? [] : Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => makePlant(seedStr, k, flora));
  const species = fauna === 'herds' || fauna === 'giants'
    ? Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => makeSpecies(seedStr, k, fauna === 'giants')) : [];

  const rings = chance(P.rings), sea = chance(P.sea);
  // Volcanoes and waterfalls come from their own stream, so every v1 world keeps all it had before.
  const rs = rngFrom(`${seedStr}:scenery`);
  const volcanoes = rs() < (culture === 'apocalyptic' || culture === 'war' ? 0.5 : relief === 'peaks' ? 0.3 : 0.12);
  const falls = relief !== 'dunes' && culture !== 'desert' && rs() < (relief === 'peaks' || relief === 'spires' || relief === 'mesas' ? 0.7 : 0.3);
  const traits = { culture, era, civ, flora, fauna, style, relief, night, rings, sea, volcanoes, falls };
  // the flyers' species, capturable like walkers (own stream too)
  const flyerSpecies = flyers.length ? [makeFlyer(seedStr, flyers[0].kind)] : [];
  for (const f of flyers) f.dna = flyerSpecies[0];
  // Vertical features: rivers towards the viewer, floating islands, auroras, smoke columns.
  const rivers = relief !== 'dunes' && (sea || r() < 0.35), islands = relief === 'islands' || r() < 0.08;
  const aurora = night && r() < (culture === 'arctic' || culture === 'nordic' ? 0.8 : 0.25);
  const smoke = ERAS.indexOf(era) === 2 || civ === 'ruins' || culture === 'war' || culture === 'apocalyptic' ? r() < 0.7 : r() < 0.05;
  const rarity = RARITY.findLast(([, min]) => bits >= min)[0];
  // One world in six is walked into (a path towards the horizon) rather than across; own stream too.
  const view = rngFrom(`${seedStr}:view`)() < 1 / 6 ? 'depth' : 'side';

  const scaleName = civ === 'aliens' ? pick(['hirajoshi', 'lydian']) : cult.scale && r() < 0.75 ? cult.scale : pick(Object.keys(SCALES));
  return {
    seed: seedStr, view, sector, region: region?.[0] ?? null, species, flyerSpecies, plants, relief, rivers, islands, aurora, smoke, volcanoes, falls, culture, weather: cult.weather ?? null,
    name, era, civ, flora, fauna, style, flyers, pop, traits, bits, rarity, night, sky, accent, layers,
    lights: civ !== 'ruins' && civ !== 'uninhabited' && (eraIdx >= 2 || civ === 'aliens'),
    ships: eraIdx >= 4 || civ === 'aliens' ? Math.floor(r() * 5) : 0,
    stars: night ? 300 : Math.floor(r() * 60),
    sun: { x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.3, size: 0.03 + r() * 0.09, color: c(hue + shift + 20, 90, night ? 85 : 75) },
    moons: Array.from({ length: Math.floor(r() * 4) }, () => ({ x: r(), y: 0.05 + r() * 0.3, size: 0.006 + r() * 0.03 })),
    rings,
    water: sea ? c(hue + shift, 50, night ? 8 : 30) : null,
    river: c(hue + shift + 10, 55, night ? 14 : 42),
    music: {
      root: 36 + Math.floor(r() * 12), // MIDI, C2..B2
      scaleName,
      scale: SCALES[scaleName],
      bpm: 50 + Math.floor(r() * 50),
      microtonal: civ === 'aliens',
      density: (civ === 'uninhabited' ? 0.15 : 0.25) + r() * 0.4,
      cutoff: 400 + eraIdx * 200 + r() * 1200,
      noteSeed: hashSeed(seedStr + ':music'),
      // Timbre: older eras lean acoustic, future and alien worlds lean synthetic.
      lead: civ === 'aliens' ? pick(['glass', 'bell']) : cult.lead && r() < 0.7 ? pick(cult.lead) : pick([
        ['flute', 'pluck', 'marimba', 'bell'], ['flute', 'pluck', 'marimba', 'bell'],
        ['pluck', 'marimba', 'bell', 'flute'], ['pluck', 'marimba', 'bell', 'glass'],
        ['bell', 'glass', 'pluck', 'marimba'], ['glass', 'bell', 'glass', 'pluck']][eraIdx]),
      drone: cult.drone ?? pick(['organ', 'wind', 'choir', 'organ', 'wind']),
      pad: r() < 0.5,
      bass: r() < 0.5,
      perc: cult.perc || r() < (eraIdx >= 2 ? 0.45 : 0.12),
      space: 1.5 + r() * 4.5, // reverb seconds
      // sounds of the place under the music, from the traits alone (no random draw: v1 worlds keep everything else)
      ambience: [sea && 'waves', rivers && 'brook', night ? 'crickets' : fauna === 'birds' && 'birds', volcanoes && 'rumble'].filter(Boolean),
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
    things.push({ kind: pick(w.pop.structs), x: c + r(), size: 0.05 + r() * 0.09, seed: id(), broken: w.civ === 'ruins' });
  if (i >= n - 2) for (let k = count(w.pop.floraDensity / 2); k--;)
    { const th = { kind: w.flora, x: c + r(), size: 0.015 + r() * 0.04, seed: id(), plant: w.plants[Math.floor(r() * w.plants.length)] }; th.size *= th.plant?.scale ?? 1; things.push(th); }
  if (i === n - 2 && r() < 0.06) things.push({ kind: pick(RELICS), x: c + 0.2 + r() * 0.6, size: 0.1, seed: id(), relic: true });
  things.sort((a, b) => b.size - a.size);

  // Walkers pace back and forth over [x, x + range] (see walkerAt), so they never pop at chunk edges.
  const walker = (kind, x, range, speed, size, dna) => creatures.push({ kind, x, range, speed, size, phase: r() * 2, seed: id(), dna });
  if (w.fauna === 'herds' && i === w.pop.herdLayer && r() < 0.5) {
    const x = c + 0.1 + r() * 0.5, v = (2 + r() * 3) * 1e-6;
    const sp = pick(w.species);
    for (let k = 3 + Math.floor(r() * 5); k--;) walker('species', x + r() * 0.12, 0.25 * Math.max(1, sp.scale ?? 1), v * sp.pace, (0.03 + r() * 0.02) * (sp.scale ?? 1), sp);
  }
  if (w.fauna === 'giants' && i === Math.min(1, n - 2) && r() < 0.5) {
    const sp = pick(w.species);
    walker('species', c + r() * 0.4, 0.5, (1 + r()) * 1e-6 * sp.pace, Math.min(0.3, (0.1 + r() * 0.08) * Math.max(1, sp.scale ?? 1)), sp);
  }
  // Titans: on worlds of giants, now and then a beast so huge only its legs fit on screen.
  // Own rng, so the rest of the chunk (and worlds already seen) stay the same.
  if (w.fauna === 'giants' && i === n - 2) {
    const q = rngFrom(`${w.seed}:titan:${c}`);
    if (q() < 0.2) creatures.push({ kind: 'species', dna: w.species[Math.floor(q() * w.species.length)], x: c + q() * 0.3, range: 0.6,
      speed: (2 + q()) * 1e-6, size: 2 + q(), phase: q() * 2, seed: Math.floor(q() * 2 ** 32), titan: true });
  }
  if ((w.civ === 'humans' || w.civ === 'aliens') && i === n - 2) for (let k = count(1.5); k--;)
    walker(w.civ === 'humans' ? 'human' : 'alien', c + r() * 0.7, 0.3, (3 + r() * 5) * 1e-6, 0.028 + r() * 0.012);
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
  neck: { none: 3, short: 4, long: 2 },
  head: { round: 4, long: 3, flat: 2 },
  extra: { none: 5, horns: 3, antennae: 1.5, crest: 1.5 },
  tail: { none: 2, short: 4, long: 3, bushy: 1 },
  pattern: { plain: 5, spots: 2, stripes: 2 },
};
const SUFFIX = ['odonte', 'ide', 'ope', 'ulo', 'ante', 'aro', 'ix'];
export const SPECIES_RARITY = [['common', 0], ['rare', 9.8], ['epic', 11.3], ['legendary', 12.4]];

export function makeSpecies(worldSeed, k, giant) {
  const r = rngFrom(`${worldSeed}:species:${k}`);
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
  const sp = {
    id: `${worldSeed}#${k}`,
    name: name[0].toUpperCase() + name.slice(1),
    ...dna,
    bodyLen: 0.35 + r() * 0.35, bodyH: 0.12 + r() * 0.15,
    legLen: (giant ? 0.6 : 0.25) + r() * 0.4,
    neckLen: { none: 0, short: 0.25, long: giant ? 1 : 0.6 }[dna.neck] * (0.7 + r() * 0.6),
    pace: 0.6 + r() * 0.8,
    rarity: SPECIES_RARITY.findLast(([, min]) => bits >= min)[0],
    bits,
    scale: sizeOf(r(), SPECIES_SIZES),
  };
  // the tiniest and the hugest are rarer finds
  sp.bits += sizeBits(sp.scale);
  sp.rarity = SPECIES_RARITY.findLast(([, min]) => sp.bits >= min)[0];
  return sp;
}
// How big a species or plant grows next to the usual (×1): drawn last, so older traits stay the same.
const SPECIES_SIZES = [[0.12, 0.55], [0.32, 0.8], [0.72, 1], [0.9, 1.6], [1, 2.6]];
const PLANT_SIZES = [[0.15, 0.6], [0.7, 1], [0.9, 1.8], [1, 3.5]];
const sizeOf = (u, table) => table.find(([p]) => u < p)[1];
// rarity bits for a species' size: the extremes are rarer
const sizeBits = (scale) => (scale >= 2.6 || scale <= 0.55 ? 0.6 : scale >= 1.6 ? 0.25 : 0);
/** A word for a scale (species or plant), or '' for the usual size. */
export const sizeWord = (scale) => (scale >= 3 ? 'giant' : scale >= 1.5 ? 'large' : scale <= 0.6 ? 'tiny' : scale < 1 ? 'small' : '');

// Breeding (at home, with a stable): the young of two species takes each part from one parent, sometimes
// a new one (a mutation), and proportions in between. The same parents always give the same young,
// whichever order. Its id joins the parents' ids with '+', sorted, a bred parent in parentheses:
// "a+b", "(a+b)+c"; up to MAX_GEN generations (the galaxy contract checks the same grammar, is_animal).
export const MAX_GEN = 3, MAX_ID = 256;
const wrap = (id) => (id.includes('+') ? `(${id})` : id);
/** The id of the young of species ids `a` and `b`. */
export const bredId = (a, b) => (a < b ? [a, b] : [b, a]).map(wrap).join('+');
/** [a, b] for a bred id (null for a wild one or a malformed id). */
export function parentsOf(id) {
  let depth = 0, at = -1;
  for (let i = 0; i < id.length; i++) {
    if (id[i] === '(') depth++;
    else if (id[i] === ')' && --depth < 0) return null;
    else if (id[i] === '+' && depth === 0) { if (at >= 0) return null; at = i; }
  }
  if (at < 0 || depth) return null;
  const side = (x) => (!x.includes('+') ? x : x.startsWith('(') && x.endsWith(')') ? x.slice(1, -1) : null);
  const a = side(id.slice(0, at)), b = side(id.slice(at + 1));
  return a && b && bredId(a, b) === id ? [a, b] : null; // only the canonical spelling
}
/** Generations behind a species id: 0 wild, 1 bred from wild ones, …; -1 if it is not a valid id. */
export function generation(id, wild = (x) => /^v1-[0-9_.]+#[0-9]{1,2}$/.test(x), depth = 0) {
  if (typeof id !== 'string' || id.length > MAX_ID || depth > MAX_GEN) return -1;
  if (!id.includes('+')) return wild(id) ? 0 : -1;
  const p = parentsOf(id), g = p && p.map((x) => generation(x, wild, depth + 1));
  return g && Math.min(...g) >= 0 && Math.max(...g) < MAX_GEN ? Math.max(...g) + 1 : -1;
}
export function breed(a, b) {
  if (a.id > b.id) [a, b] = [b, a];
  const r = rngFrom(`breed:${a.id}+${b.id}`), mix = (x, y) => x + (y - x) * r();
  let mutated = 0;
  const dna = Object.fromEntries(Object.entries(DNA).map(([part, t]) => {
    if (r() < 0.12) { mutated++; const vals = Object.keys(t); return [part, vals[Math.floor(r() * vals.length)]]; }
    return [part, r() < 0.5 ? a[part] : b[part]];
  }));
  dna.legs = +dna.legs;
  const bits = Math.max(a.bits, b.bits) + mutated * 1.5;
  return {
    id: bredId(a.id, b.id),
    name: a.name.slice(0, Math.ceil(a.name.length / 2)) + b.name.slice(Math.floor(b.name.length / 2)),
    ...dna,
    bodyLen: mix(a.bodyLen, b.bodyLen), bodyH: mix(a.bodyH, b.bodyH), legLen: mix(a.legLen, b.legLen),
    neckLen: dna.neck === 'none' ? 0 : Math.max(0.2, mix(a.neckLen, b.neckLen)), pace: mix(a.pace, b.pace),
    rarity: SPECIES_RARITY.findLast(([, min]) => bits >= min)[0], bits, bred: true, scale: mix(a.scale ?? 1, b.scale ?? 1),
  };
}
// shortcut: cached forever per id, fine for the few hundred species a session meets.
const speciesMemo = new Map();
/** The species with this id (wild "<world seed>#<k>" or bred, see bredId); null if unknown. */
export function speciesOf(id) {
  if (!speciesMemo.has(id)) {
    let sp = null;
    if (generation(id) === 0) { const [seed, k] = id.split('#'), w = makeWorld(seed); sp = (k >= FLYER_K ? w.flyerSpecies[k - FLYER_K] : w.species[k]) ?? null; }
    else if (generation(id) > 0) { const [a, b] = parentsOf(id).map(speciesOf); sp = a && b && breed(a, b); }
    speciesMemo.set(id, sp || null);
  }
  return speciesMemo.get(id);
}

// Flyers (birds, sky jellyfish, flying whales) are a species too, so they can be captured and live at
// home. Their ids use k = 50 + n ("<seed>#50"): homes and the galaxy contract take them as any wild species.
export const FLYER_K = 50;
export const isFlyerId = (id) => /#5[0-9]$/.test(id);
const FLYER_RARITY = { flock: ['common', 8], jellyfish: ['rare', 10], whale: ['epic', 11.5] };
export function makeFlyer(worldSeed, kind) {
  const r = rngFrom(`${worldSeed}:flyer`), syl = () => SYL[Math.floor(r() * SYL.length)];
  const name = syl() + syl() + { flock: 'wing', jellyfish: 'drifter', whale: 'leviathan' }[kind];
  const [rarity, bits] = FLYER_RARITY[kind];
  return { id: `${worldSeed}#${FLYER_K}`, name: name[0].toUpperCase() + name.slice(1), flyer: kind, rarity, bits };
}

// A colonist's people: one species per explorer (random from their key, the same on every colony),
// living around their flag. How many, where and how they move is random per planet; more time
// invested on the planet means more of them (2 to 8).
export function colonists(persona, seed, flagX, minutes) {
  const r = rngFrom(`colony:${seed}:${persona}`), dna = makeSpecies(`people:${persona}`, 0, false);
  const n = Math.min(8, 2 + Math.floor(Math.log2(1 + minutes / 3)));
  return Array.from({ length: n }, () => ({
    kind: 'species', dna, x: flagX - 0.3 + r() * 0.35, range: 0.1 + r() * 0.3, speed: (2 + r() * 5) * 1e-6,
    size: 0.028 + r() * 0.018, phase: r() * 2, seed: Math.floor(r() * 2 ** 32), hop: r() < 0.35,
  }));
}

// Plant species: each world grows a few of its flora family, each with its own proportions, colour
// and maybe flowers, and a Latin-sounding name. They go into the herbarium.
const GENUS = ['ia', 'ella', 'ora', 'anthe', 'aria', 'ix'], EPITHET = ['is', 'um', 'ensis', 'ata', 'ica', 'oides'];
export function makePlant(worldSeed, k, family) {
  const r = rngFrom(`${worldSeed}:plant:${k}`), syl = () => SYL[Math.floor(r() * SYL.length)];
  const genus = syl() + syl() + GENUS[Math.floor(r() * GENUS.length)], epithet = syl() + EPITHET[Math.floor(r() * EPITHET.length)];
  const bloom = r() < 0.35, tall = 0.7 + r() * 0.8, wide = 0.7 + r() * 0.6;
  const pl = {
    id: `${worldSeed}~${k}`, family, name: `${genus[0].toUpperCase()}${genus.slice(1)} ${epithet}`,
    tall, wide, hue: Math.floor(r() * 360), bloom,
    rarity: bloom && (tall > 1.35 || wide > 1.2) ? 'rare' : 'common',
    scale: sizeOf(r(), PLANT_SIZES),
  };
  if (pl.scale >= 3.5) pl.rarity = pl.rarity === 'rare' ? 'epic' : 'rare'; // a giant is a find
  return pl;
}

// Crossing (at home, with a mill): like breeding, the hybrid of two wild plant species takes each trait from
// one parent or in between, sometimes a new colour and flowers (a mutation). The same parents always give the
// same hybrid: its id is the parents' ids, sorted, joined by '+'.
export function crossPlant(a, b) {
  if (a.id > b.id) [a, b] = [b, a];
  const r = rngFrom(`cross:${a.id}+${b.id}`), mix = (x, y) => x + (y - x) * r(), mutated = r() < 0.2;
  return {
    id: `${a.id}+${b.id}`, family: r() < 0.5 ? a.family : b.family, name: `${a.name.split(' ')[0]} ${b.name.split(' ')[1]}`,
    tall: mix(a.tall, b.tall), wide: mix(a.wide, b.wide), hue: mutated ? Math.floor(r() * 360) : r() < 0.5 ? a.hue : b.hue,
    bloom: mutated || a.bloom || b.bloom, rarity: mutated ? 'epic' : 'rare', crossed: true, scale: mix(a.scale ?? 1, b.scale ?? 1),
  };
}
// shortcut: cached forever per id, like speciesMemo.
const plantMemo = new Map();
/** The plant species with this id: "<world seed>~<k>", or two wild ones crossed ("<id>+<id>"); null if unknown. */
export function plantOf(id) {
  if (!plantMemo.has(id)) {
    const parents = id.split('+');
    const wild = (x) => { const [seed, k] = x.split('~'); return makeWorld(seed).plants[k] ?? null; };
    const pl = parents.length === 1 ? wild(id) : parents.length === 2 ? (([a, b]) => a && b && crossPlant(a, b))(parents.map(wild)) : null;
    plantMemo.set(id, pl ?? null);
  }
  return plantMemo.get(id);
}

// Pickups along the walk: the same for everyone on a given day (seeded by world, day and chunk),
// rarer near the arrival point. Fuel cells are common, time shards (only where colonies exist:
// `time` true, or 'boosted' on a planet someone else holds) speed up the time miner, map fragments
// halve the next jump.
export function pickupsNear(w, day, x0, x1, time) {
  const out = [];
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1; k++) {
    const r = rngFrom(`${w.seed}:pickups:${day}:${k}`);
    if (r() > Math.min(0.4, 0.1 + 0.05 * Math.abs(k))) continue;
    const roll = r();
    const kind = roll < 0.04 ? 'map' : time && roll < (time === 'boosted' ? 0.45 : 0.25) ? 'time' : 'fuel';
    out.push({ id: `${k}`, kind, x: k + 0.1 + r() * 0.8, phase: r() * 7 });
  }
  return out;
}

// Battle encounters (🗡 mode): a wild creature of this world waits on some stretches, the same for
// everyone each day; never on the arrival spot. Farther from it they are stronger (`level`).
export function foesNear(w, day, x0, x1) {
  const out = [];
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1 && w.species.length; k++) {
    const r = rngFrom(`${w.seed}:foes:${day}:${k}`);
    if (k === 0 || r() > 0.3) continue;
    const f = { id: `foe${k}`, kind: 'species', x: k + 0.2 + r() * 0.6, dna: w.species[Math.floor(r() * w.species.length)], seed: Math.floor(r() * 2 ** 32), size: 0.04, level: 1 + Math.floor(Math.abs(k) / 4), elite: r() < 0.2 };
    if (f.elite) f.level += 2; // an elite is two levels above the rest
    out.push(f);
  }
  return out;
}

// Obstacles to jump on the nearest ground: low things in the way (own stream, so `v1` worlds keep all else).
// `w` is the half width in layer units, `h` the height in explorer sizes (a jump clears about 1). Never at the arrival spot.
const OBSTACLE_KIND = { temperate: 'log', jungle: 'log', nordic: 'log', arctic: 'ice', western: 'crate', war: 'crate', apocalyptic: 'crate', desert: 'rock', japanese: 'rock' };
export function obstaclesNear(w, x0, x1) {
  const out = [];
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1; k++) {
    const r = rngFrom(`${w.seed}:obst:${k}`);
    if (r() > 0.6) continue;
    const x = k + 0.12 + r() * 0.76;
    if (Math.abs(x - 0.5) < 0.1) continue;
    out.push({ id: `obst${k}`, kind: OBSTACLE_KIND[w.culture] ?? 'rock', x, w: 0.006 + r() * 0.005, h: 0.4 + r() * 0.18, seed: Math.floor(r() * 2 ** 32) });
  }
  return out;
}

// Buildings big enough to walk into, on the nearest ground (own stream, never at the arrival spot): the ones of
// the world's own kit that have a room. A chest waits inside (`atlas.js` `chestLoot`).
const ENTERABLE = new Set(['house', 'castle', 'temple', 'windmill', 'factory', 'tower', 'dome', 'pagoda', 'minka', 'longhouse', 'stavechurch', 'mosque', 'mudhouse', 'pyramid', 'steppyramid', 'stilthut', 'saloon', 'igloo', 'lighthouse', 'shack', 'bunker', 'watchtower']);
export function foreStructsNear(w, x0, x1) {
  const out = [], kinds = (w.pop.structs ?? []).filter((k) => ENTERABLE.has(k));
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1 && kinds.length; k++) {
    const r = rngFrom(`${w.seed}:fore:${k}`);
    if (k === 0 || r() > 0.25) continue;
    out.push({ id: `fore${k}`, kind: kinds[Math.floor(r() * kinds.length)], x: k + 0.3 + r() * 0.4, size: 0.13 + r() * 0.04, seed: Math.floor(r() * 2 ** 32), broken: w.civ === 'ruins' });
  }
  return out;
}

// Diary pages (diary.js): one world in three keeps one, at a fixed spot near the arrival point.
export function pageNear(w, x0, x1) {
  const r = rngFrom(`${w.seed}:page`);
  if (r() > 1 / 3) return [];
  const x = (r() < 0.5 ? -1 : 1) * (1 + r() * 2);
  return x > x0 - 1 && x < x1 + 1 ? [{ id: 'page', kind: 'page', x, phase: r() * 7 }] : [];
}

// Raw material deposits: a rock with shards of the world's ore, permanent per world (taken ones
// grow back the next day). Own rng, so v1 worlds and their chunks stay unchanged.
export function depositsNear(w, x0, x1) {
  const out = [];
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1; k++) {
    const r = rngFrom(`${w.seed}:ore:${k}`);
    if (r() > 0.45) continue;
    out.push({ id: `ore${k}`, kind: 'ore', x: k + 0.05 + r() * 0.9, amount: 1 + Math.floor(r() * 3), seed: Math.floor(r() * 2 ** 32) });
  }
  return out;
}

// Events, on the clock everyone shares: each world rolls for one every 3 hours; an event lasts 1-2 hours.
// Meteor showers leave rich ore (more often on dying worlds), herds migrate in from a neighbouring star,
// a trader sets up a stall. The same for every explorer at the same time.
export const EVENT_SLOT = 3 * 3600e3;
export function eventAt(w, now = Date.now()) {
  const slot = Math.floor((now - EPOCH) / EVENT_SLOT), r = rngFrom(`${w.seed}:event:${slot}`), life = ageOf(w.seed, now);
  const unstable = life ? instability(life.age) : 0;
  const start = EPOCH + slot * EVENT_SLOT + r() * 3600e3, end = start + (1 + r()) * 3600e3;
  if (r() > 0.4 + unstable * 0.4 || now < start || now >= end) return null;
  const roll = r() * (2 + unstable * 4), id = `${slot}`;
  if (roll >= 2) return { kind: 'meteors', id, start, end };
  if (roll < 1) return { kind: 'trader', id, start, end, x: (r() - 0.5) * 3 };
  // migrants come from a star of the same sector that has animals
  const sector = sectorOf(w.seed), from = sector && starsIn(...sector, now).map((s) => withAnimals(s.seed)).find((o) => o && o.seed !== w.seed);
  return from ? { kind: 'migration', id, start, end, from: from.seed, fromName: from.name } : { kind: 'meteors', id, start, end };
}
// eventAt runs every second and for every star on the map: remember which worlds have animals.
// shortcut: cleared when it reaches 5000 worlds, enough for a long session.
const animalsMemo = new Map();
function withAnimals(seed) {
  if (!animalsMemo.has(seed)) {
    if (animalsMemo.size >= 5000) animalsMemo.clear();
    const o = makeWorld(seed);
    animalsMemo.set(seed, o.species.length ? { seed, name: o.name } : null);
  }
  return animalsMemo.get(seed);
}

/** Rich ore the meteors left, around the arrival point: [{ id, kind: 'ore', x, amount, seed }]. */
export function meteoritesNear(w, ev, x0, x1) {
  const out = [];
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1; k++) {
    const r = rngFrom(`${w.seed}:meteor:${ev.id}:${k}`);
    if (r() < 0.55) out.push({ id: `met${ev.id}_${k}`, kind: 'ore', x: k + 0.1 + r() * 0.8, amount: 4 + Math.floor(r() * 4), seed: Math.floor(r() * 2 ** 32), meteor: true });
  }
  return out;
}

/** The migrating herd: walkers crossing the land, of a species from the neighbouring star. */
export function migrants(ev) {
  const r = rngFrom(`migration:${ev.id}:${ev.from}`), from = makeWorld(ev.from), sp = from.species[Math.floor(r() * from.species.length)];
  // they travel together: same stretch of land and pace, a little spread out
  const speed = (3 + r() * 3) * 1e-6 * sp.pace, phase = r() * 2;
  return Array.from({ length: 8 + Math.floor(r() * 8) }, () => ({
    kind: 'species', dna: sp, x: -0.6 + r() * 0.4, range: 1.6, speed, size: (0.03 + r() * 0.02) * (sp.scale ?? 1), phase: phase + r() * 0.05, seed: Math.floor(r() * 2 ** 32),
  }));
}

/** The trader's three deals for this event: [{ give: { plant, ore }, get: { ore | fuel | creature } }]. */
export function deals(w, ev) {
  const r = rngFrom(`trade:${w.seed}:${ev.id}`), n = (a, b) => a + Math.floor(r() * (b - a + 1));
  return [
    { give: { plant: n(8, 14) }, get: { ore: n(3, 6) } },
    { give: { ore: n(6, 10) }, get: { fuel: n(25, 45) } },
    { give: { plant: n(10, 16), ore: n(4, 8) }, get: { creature: 1 } },
  ];
}

// Heritage: a world born from a star remembers the one before it. Ruins of its buildings stand
// here and there, and one of its species survives. Pure, so every explorer sees the same past.
export function prevSeed(seed) {
  const m = STAR.exec(seed);
  if (!m?.[4]) return null;
  const g = +m[4] - 1;
  return `v1-${m[1]}_${m[2]}_${m[3]}${g ? '.' + g : ''}`;
}
export function heritage(w) {
  const p = prevSeed(w.seed);
  if (!p) return null;
  const pw = makeWorld(p);
  return { seed: p, name: pw.name, structs: pw.pop.structs, survivor: pw.species[0] ?? null };
}
/** Ruins of the previous world's buildings on the structures' layer. */
export function ruinsNear(w, her, x0, x1) {
  if (!her?.structs) return [];
  const out = [];
  for (let k = Math.floor(x0) - 1; k <= Math.floor(x1) + 1; k++) {
    const r = rngFrom(`${w.seed}:ruins:${k}`);
    if (r() < 0.35) out.push({ kind: her.structs[Math.floor(r() * her.structs.length)], x: k + 0.1 + r() * 0.8, size: 0.06 + r() * 0.07, seed: Math.floor(r() * 2 ** 32), broken: true });
  }
  return out;
}
/** The surviving species of the previous world: a small herd near the arrival point. */
export function survivors(w, her) {
  if (!her?.survivor) return [];
  const r = rngFrom(`${w.seed}:survivors`), sp = her.survivor, speed = (2 + r() * 3) * 1e-6 * sp.pace;
  return Array.from({ length: 3 + Math.floor(r() * 4) }, () => ({
    kind: 'species', dna: sp, x: -0.8 + r() * 1.2, range: 0.4 + r() * 0.4, speed, size: (0.03 + r() * 0.02) * (sp.scale ?? 1), phase: r() * 2, seed: Math.floor(r() * 2 ** 32),
  }));
}

// Chronicle of a star: its worlds, newest first, as every explorer would tell it.
const STORY = {
  humans: (w) => `The ${w.culture === 'temperate' ? '' : w.culture + ' '}people of ${w.name} lived there in the ${w.era} age.`,
  aliens: (w) => `Aliens raised their spires on ${w.name}, in an age like our ${w.era}.`,
  ruins: (w) => `${w.name} was already a land of ruins, left from a ${w.era} age.`,
  uninhabited: (w) => `Nobody ever lived on ${w.name}; only its ${w.flora === 'barren' ? 'winds' : w.flora} remember it.`,
};
export function chronicle(seed, max = 8) {
  const m = STAR.exec(seed);
  if (!m) return [];
  const [span, off] = lifespan(+m[1], +m[2], +m[3]), g = +(m[4] ?? 0);
  return Array.from({ length: Math.min(g + 1, max) }, (_, k) => {
    const gen = g - k, s = `v1-${m[1]}_${m[2]}_${m[3]}${gen ? '.' + gen : ''}`, w = makeWorld(s);
    return { gen, seed: s, name: w.name, rarity: w.rarity, born: EPOCH - off + gen * span, collapse: EPOCH - off + (gen + 1) * span,
      story: STORY[w.civ](w), survivor: k ? w.species[0]?.name ?? null : null };
  });
}

// Languages: each culture (and the aliens) speaks its own, the same on every world. Explorers learn
// its words one by one, in a fixed order; inscriptions on buildings and relics show what they know.
export const CONCEPTS = ['we', 'sky', 'star', 'home', 'water', 'fire', 'stone', 'ancestors', 'children', 'sleep', 'build', 'remember',
  'fall', 'rise', 'light', 'dark', 'path', 'end', 'begin', 'sing', 'beast', 'tree', 'gift', 'stranger'];
const SAYINGS = [
  ['ancestors', 'build', 'home', 'stone'], ['we', 'remember', 'fire', 'sky'], ['star', 'fall', 'water', 'sleep'], ['children', 'sing', 'light', 'rise'],
  ['stranger', 'path', 'end', 'home'], ['beast', 'tree', 'gift', 'we'], ['dark', 'begin', 'star', 'remember'], ['sky', 'end', 'fire', 'children'],
  ['we', 'sleep', 'stone', 'ancestors'], ['light', 'path', 'stranger', 'gift'], ['water', 'rise', 'tree', 'sing'], ['home', 'fall', 'dark', 'begin'],
];
const SOUNDS = ['ka', 've', 'lor', 'ny', 'tha', 'ri', 'os', 'mu', 'zen', 'ae', 'quel', 'dra', 'si', 'on', 'xi', 'ul', 'bre', 'ith', 'ko', 'sha', 'gar', 'yu', 'tep', 'im', 'vro', 'el'];
export const languageOf = (w) => w.civ === 'uninhabited' ? null : w.civ === 'aliens' ? 'alien' : w.culture;
export function lexicon(lang) {
  const r = rngFrom(`lingua:${lang}`), sounds = SOUNDS.filter(() => r() < 0.5), words = {}, used = new Set();
  for (const c of CONCEPTS) {
    let word;
    do word = Array.from({ length: 1 + Math.floor(r() * 3) }, () => sounds[Math.floor(r() * sounds.length)]).join(''); while (used.has(word));
    used.add(word); words[c] = word;
  }
  const order = [...CONCEPTS];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { words, order };
}
/** The inscription on something with `seed` on world `w`: concepts, in the world's language. */
export const inscription = (w, seed) => SAYINGS[Math.floor(rngFrom(`${w.seed}:scritta:${seed}`)() * SAYINGS.length)];
