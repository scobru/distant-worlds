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
  const species = fauna === 'herds' || fauna === 'giants'
    ? Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => makeSpecies(seedStr, k, fauna === 'giants')) : [];

  const rings = chance(P.rings), sea = chance(P.sea);
  const traits = { culture, era, civ, flora, fauna, style, relief, night, rings, sea };
  // Vertical features: rivers towards the viewer, floating islands, auroras, smoke columns.
  const rivers = relief !== 'dunes' && (sea || r() < 0.35), islands = relief === 'islands' || r() < 0.08;
  const aurora = night && r() < (culture === 'arctic' || culture === 'nordic' ? 0.8 : 0.25);
  const smoke = ERAS.indexOf(era) === 2 || civ === 'ruins' || culture === 'war' || culture === 'apocalyptic' ? r() < 0.7 : r() < 0.05;
  const rarity = RARITY.findLast(([, min]) => bits >= min)[0];

  const scaleName = civ === 'aliens' ? pick(['hirajoshi', 'lydian']) : cult.scale && r() < 0.75 ? cult.scale : pick(Object.keys(SCALES));
  return {
    seed: seedStr, sector, region: region?.[0] ?? null, species, relief, rivers, islands, aurora, smoke, culture, weather: cult.weather ?? null,
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
    things.push({ kind: w.flora, x: c + r(), size: 0.015 + r() * 0.04, seed: id() });
  if (i === n - 2 && r() < 0.06) things.push({ kind: pick(RELICS), x: c + 0.2 + r() * 0.6, size: 0.1, seed: id(), relic: true });
  things.sort((a, b) => b.size - a.size);

  // Walkers pace back and forth over [x, x + range] (see walkerAt), so they never pop at chunk edges.
  const walker = (kind, x, range, speed, size, dna) => creatures.push({ kind, x, range, speed, size, phase: r() * 2, seed: id(), dna });
  if (w.fauna === 'herds' && i === w.pop.herdLayer && r() < 0.5) {
    const x = c + 0.1 + r() * 0.5, v = (2 + r() * 3) * 1e-6;
    const sp = pick(w.species);
    for (let k = 3 + Math.floor(r() * 5); k--;) walker('species', x + r() * 0.12, 0.25, v * sp.pace, 0.03 + r() * 0.02, sp);
  }
  if (w.fauna === 'giants' && i === Math.min(1, n - 2) && r() < 0.5) {
    const sp = pick(w.species);
    walker('species', c + r() * 0.4, 0.5, (1 + r()) * 1e-6 * sp.pace, 0.1 + r() * 0.08, sp);
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
  return {
    id: `${worldSeed}#${k}`,
    name: name[0].toUpperCase() + name.slice(1),
    ...dna,
    bodyLen: 0.35 + r() * 0.35, bodyH: 0.12 + r() * 0.15,
    legLen: (giant ? 0.6 : 0.25) + r() * 0.4,
    neckLen: { none: 0, short: 0.25, long: giant ? 1 : 0.6 }[dna.neck] * (0.7 + r() * 0.6),
    pace: 0.6 + r() * 0.8,
    rarity: SPECIES_RARITY.findLast(([, min]) => bits >= min)[0],
    bits,
  };
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
