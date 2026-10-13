// Player progress: discoveries, achievements, saved worlds, daily world. Pure logic on a
// plain object; index.html persists it in localStorage.
import { TRAITS, RARITY, RELICS, hashSeed, rng, rngFrom, randomSeed } from './world.js';

// Every discoverable entry, as "trait:value".
export const ENTRIES = [
  ...Object.entries(TRAITS).flatMap(([k, t]) => Object.keys(t).map((v) => `${k}:${v}`)),
  'night:true', 'rings:true', 'sea:true',
  ...RARITY.map(([r]) => `rarity:${r}`),
  ...RELICS.map((r) => `relic:${r}`),
];

// Second tier: who lived in which era. Rare pairs (aliens in the far future) take a while.
export const COMBOS = Object.keys(TRAITS.civ).flatMap((c) => Object.keys(TRAITS.era).map((e) => `${c}@${e}`));

const has = (st, k, vals) => vals.filter((v) => st.seen.includes(`${k}:${v}`)).length;
export const ACHIEVEMENTS = [
  ['Time traveller', 'Visit every era', (st) => has(st, 'era', Object.keys(TRAITS.era)) === 6],
  ['Zoologist', 'Meet every fauna', (st) => has(st, 'fauna', Object.keys(TRAITS.fauna)) === 6],
  ['Botanist', 'Find every flora', (st) => has(st, 'flora', Object.keys(TRAITS.flora)) === 5],
  ['Aesthete', 'See every style', (st) => has(st, 'style', Object.keys(TRAITS.style)) === 5],
  ['Archaeologist', 'Ruins from 4 different eras', (st) => st.combos.filter((c) => c.startsWith('ruins@')).length >= 4],
  ['Historian', 'Every civilization in every era', (st) => COMBOS.every((c) => st.combos.includes(c))],
  ['First contact', 'Find the aliens', (st) => st.seen.includes('civ:aliens')],
  ['Legend hunter', 'Find a legendary world', (st) => st.seen.includes('rarity:legendary')],
  ['Relic seeker', 'Find a portal, a monolith and a skeleton', (st) => has(st, 'relic', RELICS) === RELICS.length],
  ['Naturalist', 'Catalogue 10 species', (st) => st.species.length >= 10],
  ['Taxonomist', 'Catalogue 50 species', (st) => st.species.length >= 50],
  ['Cryptozoologist', 'Find a legendary species', (st) => st.species.some((s) => s.rarity === 'legendary')],
  ['Herbalist', 'Press 10 plants in your herbarium', (st) => (st.plants ?? []).length >= 10],
  ['Explorer', 'Explore 100 worlds', (st) => st.count >= 100],
  ['Steadfast', 'Daily mission 7 days in a row', (st) => st.daily.best >= 7],
  ['Settler', 'Choose a home planet', (st) => !!st.home],
  ['Founder', 'Grow your home into a village', (st) => (st.home?.built.length ?? 0) >= 3],
  ['Mayor', 'Grow your home into a city', (st) => (st.home?.built.length ?? 0) >= 10],
  ['Architect', 'Build every kind of building', (st) => Object.keys(BUILDINGS).every((k) => st.home?.built.some((b) => b.kind === k))],
  ['Rancher', 'Bring 10 creatures home', (st) => (st.home?.animals.length ?? 0) >= 10],
];
/** Runs `change` and returns the achievements it unlocked. */
export const withAchievements = (st, change) => discover(st, [], null, change).achievements;

export const emptyState = () => ({ fuel: 100, seen: [], combos: [], count: 0, favs: [], species: [], plants: [], stars: [], daily: { done: null, streak: 0, best: 0 },
  bag: { plant: 0, ore: 0, creature: [] }, home: null, avatar: null });

// Applies `change` to the state; returns the entries, combos and achievements it unlocked.
function discover(st, keys, combo, change = () => {}) {
  const before = ACHIEVEMENTS.filter(([, , ok]) => ok(st)).map(([n]) => n);
  const entries = keys.filter((k) => !st.seen.includes(k));
  st.seen.push(...entries);
  const combos = !combo || st.combos.includes(combo) ? [] : [combo];
  st.combos.push(...combos);
  change();
  const achievements = ACHIEVEMENTS.filter(([n, , ok]) => ok(st) && !before.includes(n)).map(([n]) => n);
  return { entries, combos, achievements };
}

// Records a visited world.
export const visit = (st, w) => discover(st,
  [...Object.entries(w.traits).filter(([, v]) => v !== false).map(([k, v]) => `${k}:${v}`), `rarity:${w.rarity}`],
  `${w.civ}@${w.era}`, () => {
    st.count++;
    // Visited stars, for the map. shortcut: capped list, switch to a Set-like index if it grows a lot.
    if (w.sector && !st.stars.includes(w.seed)) st.stars = [...st.stars, w.seed].slice(-5000);
  });

// Records a species seen while walking; `isNew` tells whether it entered the bestiary.
export function findSpecies(st, sp, w) {
  if (st.species.some((s) => s.id === sp.id)) return { isNew: false, achievements: [] };
  const news = discover(st, [], null, () => st.species.unshift({ id: sp.id, name: sp.name, rarity: sp.rarity, world: w.seed, worldName: w.name }));
  return { isNew: true, achievements: news.achievements };
}

// Records a plant species seen while walking.
export function findPlant(st, pl, w) {
  st.plants ??= [];
  if (st.plants.some((p) => p.id === pl.id)) return { isNew: false, achievements: [] };
  const news = discover(st, [], null, () => st.plants.unshift({ id: pl.id, name: pl.name, family: pl.family, rarity: pl.rarity, world: w.seed, worldName: w.name }));
  return { isNew: true, achievements: news.achievements };
}

// Records a relic seen while walking.
export const findRelic = (st, kind) => discover(st, [`relic:${kind}`]);

export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The daily world is a star on the map, the same for everyone that day.
export const dailySeed = (day) => randomSeed(rngFrom('giorno:' + day));

// Two trait constraints derived from the date, rare enough to hunt for but findable
// (at least ~1 world in 40).
export function mission(day) {
  const r = rng(hashSeed('missione:' + day)), keys = Object.keys(TRAITS);
  for (;;) {
    const k1 = keys[Math.floor(r() * keys.length)], k2 = keys[Math.floor(r() * keys.length)];
    if (k1 === k2) continue;
    const pick = (k) => { const t = Object.entries(TRAITS[k]).slice(1); const [v, w] = t[Math.floor(r() * t.length)]; return [k, v, w / Object.values(TRAITS[k]).reduce((a, b) => a + b)]; };
    const a = pick(k1), b = pick(k2);
    if (a[2] * b[2] >= 1 / 40) return [a, b].map(([k, v]) => [k, v]);
  }
}
export const matches = (w, m) => m.every(([k, v]) => w.traits[k] === v);

// Marks today's mission done (if the world fits) and updates the streak.
export function checkMission(st, w, day, yesterday) {
  if (st.daily.done === day || !matches(w, mission(day))) return false;
  st.daily.streak = st.daily.done === yesterday ? st.daily.streak + 1 : 1;
  st.daily.best = Math.max(st.daily.best, st.daily.streak);
  st.daily.done = day;
  return true;
}

// Hyperdrive fuel: earned by exploring the current world, spent to jump to an unvisited one.
// Revisiting stars, saved worlds, the daily world and shared links are free.
export const FUEL = { max: 100, perScreen: 4, maxPerSecond: 0.3, entry: 10, combo: 10, species: 15, rareSpecies: 25, relic: 30, mission: 100, random: 100 };
export const addFuel = (st, n) => (st.fuel = Math.min(FUEL.max, (st.fuel ?? FUEL.max) + n));

// Cost to jump from sector `from` (null: off the map) to the star in sector `to`: near is cheap.
export function jumpCost(from, to, size) {
  if (!from) return 60;
  const d = (a, b) => Math.min(Math.abs(a - b), size - Math.abs(a - b)); // the galaxy wraps around
  return Math.min(FUEL.random, 20 + 15 * Math.max(d(from[0], to[0]), d(from[1], to[1])));
}

// Pickups: each one can be collected once a day per explorer; at most 3 time shards a day per planet.
export const PICKUP = { fuel: 15, boost: 3, boostMs: 90_000, timePerPlanetDay: 3 };
const pickKey = (seed, p) => `${seed}|${p.id}|${p.kind}`;
export const picked = (st, day, seed, p) => st.picked?.day === day && st.picked.ids.includes(pickKey(seed, p));

/** Collect pickup `p` on planet `seed`; returns false if already taken or over today's limit. */
export function collect(st, day, seed, p, now) {
  if (st.picked?.day !== day) st.picked = { day, ids: [] };
  if (picked(st, day, seed, p)) return false;
  if (p.kind === 'time' && st.picked.ids.filter((k) => k.startsWith(seed + '|') && k.endsWith('|time')).length >= PICKUP.timePerPlanetDay) return false;
  st.picked.ids.push(pickKey(seed, p));
  if (p.kind === 'fuel') addFuel(st, PICKUP.fuel);
  // shards stack on the same planet; another planet's shard starts a new boost
  if (p.kind === 'time') st.boost = { seed, until: Math.max(now, st.boost?.seed === seed ? st.boost.until : 0) + PICKUP.boostMs };
  if (p.kind === 'map') st.halfJump = true;
  // gathered on the way, spent on the home planet
  // home buildings make gathering richer
  if (p.kind === 'plant' || p.kind === 'ore') st.bag[p.kind] += (p.amount ?? 1) + gatherBonus(st, p.kind);
  if (p.kind === 'creature') for (let k = 1 + gatherBonus(st, 'creature'); k--;) st.bag.creature.push(p.dna);
  return true;
}
export const boostOn = (st, seed, now) => st.boost?.seed === seed && now < st.boost.until;

// Home planet: the explorer's own world, where gathered resources become a civilization.
// Plants and ore are spent; animals (captured creatures, released at home) are a requirement.
// `gather`: extra per plant / ore / creature taken; `hour`: produced while you are away; `jump`: cheaper jumps.
export const BUILDINGS = {
  house: { name: 'Hut', cost: { plant: 5 }, hour: { plant: 1 } },
  windmill: { name: 'Mill', cost: { plant: 8, ore: 2 }, gather: 'plant', hour: { plant: 1 } },
  longhouse: { name: 'Stable', cost: { plant: 6, ore: 2, animals: 2 }, gather: 'creature' },
  factory: { name: 'Workshop', cost: { plant: 4, ore: 8 }, gather: 'ore', hour: { ore: 1 } },
  temple: { name: 'Temple', cost: { plant: 6, ore: 12, animals: 3 }, hour: { fuel: 5 } },
  castle: { name: 'Castle', cost: { plant: 10, ore: 20 }, hour: { ore: 2 } },
  tower: { name: 'Tower', cost: { plant: 5, ore: 30, animals: 5 }, jump: 0.1 },
  dome: { name: 'Dome', cost: { plant: 20, ore: 30, animals: 8 }, hour: { plant: 2, ore: 2, fuel: 5 } },
};
const builtOf = (st, k) => st.home?.built.filter((b) => b.kind === k).length ?? 0;
// +1 per building of that kind, at most +3 (creatures: at most one extra)
export const gatherBonus = (st, kind) => Math.min(kind === 'creature' ? 1 : 3,
  Object.entries(BUILDINGS).filter(([, b]) => b.gather === kind).reduce((a, [k]) => a + builtOf(st, k), 0));
// each tower takes 10% off jumps, at most 50%
export const jumpDiscount = (st) => Math.min(0.5, builtOf(st, 'tower') * BUILDINGS.tower.jump);

/** What the home produced since the last visit (at most a day's worth), added to bag and tank. */
export function produce(st, now) {
  const H = st.home, hours = Math.min(24, Math.max(0, (now - (H.prod ?? now)) / 3.6e6)), got = { plant: 0, ore: 0, fuel: 0 };
  H.prod = now;
  for (const b of H.built) for (const [r, n] of Object.entries(BUILDINGS[b.kind].hour ?? {})) got[r] += n * hours;
  for (const r in got) got[r] = Math.floor(got[r]);
  st.bag.plant += got.plant; st.bag.ore += got.ore; addFuel(st, got.fuel);
  return got;
}
const TITLES = [[0, 'Landing site'], [1, 'Camp'], [3, 'Village'], [6, 'Town'], [10, 'City'], [16, 'Capital']];
export const civTitle = (home) => TITLES.findLast(([n]) => (home?.built.length ?? 0) >= n)[1];

export const setHome = (st, seed, now = 0) => (st.home = { seed, built: [], animals: [], prod: now });

/** Releases the creatures in the bag on the home planet; returns how many. */
export function arriveHome(st) {
  const n = st.bag.creature.length;
  st.home.animals.push(...st.bag.creature); st.bag.creature = [];
  return n;
}

export const canBuild = (st, kind) => {
  const c = BUILDINGS[kind].cost;
  return st.bag.plant >= (c.plant ?? 0) && st.bag.ore >= (c.ore ?? 0) && st.home.animals.length >= (c.animals ?? 0);
};

/** Builds `kind` at x (on the structures' layer) if the bag pays for it. */
export function build(st, kind, x) {
  if (!canBuild(st, kind)) return false;
  const c = BUILDINGS[kind].cost;
  st.bag.plant -= c.plant ?? 0; st.bag.ore -= c.ore ?? 0;
  st.home.built.push({ kind, x, seed: st.home.built.length + 1 });
  return true;
}
