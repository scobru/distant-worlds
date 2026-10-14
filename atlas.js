// Player progress: discoveries, achievements, saved worlds, daily world. Pure logic on a
// plain object; index.html persists it in localStorage.
import { TRAITS, RARITY, RELICS, hashSeed, rng, rngFrom, randomSeed, bredId, generation, MAX_GEN, EPOCH, DAY, CONCEPTS, languageOf } from './world.js';

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
  ['Pathfinder', 'Finish a seasonal expedition', (st) => (st.expeditions ?? []).length >= 1],
  ['Polyglot', 'Learn every word of a language', (st) => Object.values(st.words ?? {}).some((n) => n >= CONCEPTS.length)],
  ['Settler', 'Choose a home planet', (st) => !!st.home],
  ['Founder', 'Grow your home into a village', (st) => civLevel(st.home) >= 3],
  ['Mayor', 'Grow your home into a city', (st) => civLevel(st.home) >= 6],
  ['Architect', 'Build every kind of building', (st) => Object.keys(BUILDINGS).every((k) => st.home?.built.some((b) => partsOf(b).includes(k)))],
  ['Rancher', 'Bring 10 creatures home', (st) => (st.home?.animals.length ?? 0) >= 10],
];
/** Runs `change` and returns the achievements it unlocked. */
export const withAchievements = (st, change) => discover(st, [], null, change).achievements;

export const emptyState = () => ({ fuel: 100, seen: [], combos: [], count: 0, favs: [], species: [], plants: [], stars: [], daily: { done: null, streak: 0, best: 0 },
  bag: { plant: 0, ore: 0, creature: [], seeds: [] }, home: null, avatar: null });

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

// `n` trait constraints from `r`, found on at least `min` of the worlds (rare enough to hunt for).
function goal(r, n, min) {
  const keys = Object.keys(TRAITS);
  for (;;) {
    const ks = Array.from({ length: n }, () => keys[Math.floor(r() * keys.length)]);
    if (new Set(ks).size < n) continue;
    const pick = (k) => { const t = Object.entries(TRAITS[k]).slice(1); const [v, w] = t[Math.floor(r() * t.length)]; return [k, v, w / Object.values(TRAITS[k]).reduce((a, b) => a + b)]; };
    const g = ks.map(pick);
    if (g.reduce((p, [, , q]) => p * q, 1) >= min) return g.map(([k, v]) => [k, v]);
  }
}
// Two trait constraints derived from the date, findable (at least ~1 world in 40).
export const mission = (day) => goal(rng(hashSeed('missione:' + day)), 2, 1 / 40);

// Seasonal expedition: every 14 days, the same chain of stages for every explorer. Stages are
// done in order, each one by landing on a world that fits it; the last one is a badge.
export const SEASON = 14 * DAY, EXPEDITION = { stages: 5, fuel: 50 };
export function expedition(now = Date.now()) {
  const id = Math.floor((now - EPOCH) / SEASON), r = rng(hashSeed('spedizione:' + id));
  return { id, end: EPOCH + (id + 1) * SEASON, stages: Array.from({ length: EXPEDITION.stages }, (_, i) => goal(r, i < 2 ? 1 : 2, i < 2 ? 1 / 6 : 1 / 40)) };
}
/** Advances the expedition if `w` fits its next stage; returns { stage, done } or null. */
export function checkExpedition(st, w, now = Date.now()) {
  const ex = expedition(now);
  if (st.exp?.id !== ex.id) st.exp = { id: ex.id, n: 0 };
  if (st.exp.n >= ex.stages.length || !matches(w, ex.stages[st.exp.n])) return null;
  st.exp.n++; addFuel(st, EXPEDITION.fuel);
  const done = st.exp.n === ex.stages.length;
  if (done) st.expeditions = [...(st.expeditions ?? []), ex.id + 1];
  return { stage: st.exp.n, done };
}

// Languages: a new world teaches one word of its people's language, a relic two.
export function learn(st, w, n) {
  const lang = languageOf(w);
  if (!lang) return 0;
  st.words ??= {};
  const had = st.words[lang] ?? 0;
  st.words[lang] = Math.min(CONCEPTS.length, had + n);
  return st.words[lang] - had;
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
  // the first harvest of a plant species also gives its seeds, sown at home on the next visit
  if (p.kind === 'plant' && p.species && !(st.bag.seeds ??= []).includes(p.species) && !st.home?.garden?.includes(p.species)) st.bag.seeds.push(p.species);
  if (p.kind === 'creature') for (let k = 1 + gatherBonus(st, 'creature'); k--;) st.bag.creature.push(p.dna);
  return true;
}
export const boostOn = (st, seed, now) => st.boost?.seed === seed && now < st.boost.until;

// Home planet: the explorer's own world, where gathered resources become a civilization.
// Plants and ore are spent; animals (captured creatures, released at home) are a requirement.
// `gather`: extra per plant / ore / creature taken; `hour`: produced while you are away; `jump`: cheaper jumps;
// `house`: people it shelters; `food`: people it feeds; `guard`: defence against pirates.
export const BUILDINGS = {
  house: { name: 'Hut', cost: { plant: 5 }, hour: { plant: 1 }, house: 4, food: 2 },
  windmill: { name: 'Mill', cost: { plant: 8, ore: 2 }, gather: 'plant', hour: { plant: 1 }, house: 1, food: 10 },
  longhouse: { name: 'Stable', cost: { plant: 6, ore: 2, animals: 2 }, gather: 'creature', house: 2, food: 4 },
  factory: { name: 'Workshop', cost: { plant: 4, ore: 8 }, gather: 'ore', hour: { ore: 1 }, house: 3 },
  temple: { name: 'Temple', cost: { plant: 6, ore: 12, animals: 3 }, hour: { fuel: 5 }, house: 2 },
  castle: { name: 'Castle', cost: { plant: 10, ore: 20 }, hour: { ore: 2 }, house: 8, guard: 6 },
  tower: { name: 'Tower', cost: { plant: 5, ore: 30, animals: 5 }, jump: 0.1, house: 1, guard: 4 },
  dome: { name: 'Dome', cost: { plant: 20, ore: 30, animals: 8 }, hour: { plant: 2, ore: 2, fuel: 5 }, house: 10, food: 10 },
};
// Buildings come as { kind } here and as [kind, x] in homes published on Freenet.
// Damaged buildings (pirates) shelter, feed and count for nothing until repaired.
// A fused building ({ kind, fused }) is both kinds at once; Freenet homes publish it as two entries.
export const partsOf = (b) => [b.kind ?? b[0], ...(b.fused ? [b.fused] : [])];
export const buildingName = (b) => partsOf(b).map((k) => BUILDINGS[k].name).join('-');
const kinds = (home) => (home?.built ?? []).filter((b) => !b.damaged).flatMap(partsOf).filter((k) => BUILDINGS[k]);
// What the land around the landing site feeds without farms.
export const BASE_FOOD = 6;
/** People living at home: as many as the buildings shelter, but no more than they can feed. */
export function population(home) {
  const k = kinds(home);
  if (!k.length) return 0;
  const sum = (f) => k.reduce((a, x) => a + (BUILDINGS[x][f] ?? 0), 0);
  return Math.min(sum('house'), BASE_FOOD + sum('food'));
}
/** Civilization points: people, what was built (its cost), the variety of buildings (each kind of fusion too), creatures. */
export function civPoints(home) {
  const k = kinds(home), c = (x) => (BUILDINGS[x].cost.plant ?? 0) + (BUILDINGS[x].cost.ore ?? 0);
  const fused = new Set((home?.built ?? []).filter((b) => b.fused && !b.damaged).map((b) => partsOf(b).sort().join('+')));
  return population(home) * 5 + k.reduce((a, x) => a + c(x), 0) + (new Set(k).size + fused.size) * 10 + (home?.animals.length ?? 0) * 3;
}
/** Civilization level, from 1: each level needs more points than the one before. */
export const civLevel = (home) => 1 + Math.floor(Math.sqrt(civPoints(home) / 20));
const builtOf = (st, k) => st.home?.built.filter((b) => partsOf(b).includes(k) && !b.damaged).length ?? 0;
// +1 per building of that kind, at most +3 (creatures: at most one extra)
export const gatherBonus = (st, kind) => Math.min(kind === 'creature' ? 1 : 3,
  Object.entries(BUILDINGS).filter(([, b]) => b.gather === kind).reduce((a, [k]) => a + builtOf(st, k), 0));
// each tower takes 10% off jumps, at most 50%
export const jumpDiscount = (st) => Math.min(0.5, builtOf(st, 'tower') * BUILDINGS.tower.jump);

/** What the home produced since the last visit (at most a day's worth), added to bag and tank. */
export function produce(st, now) {
  const H = st.home, hours = Math.min(24, Math.max(0, (now - (H.prod ?? now)) / 3.6e6)), got = { plant: 0, ore: 0, fuel: 0 };
  H.prod = now;
  for (const k of kinds(H)) for (const [r, n] of Object.entries(BUILDINGS[k].hour ?? {})) got[r] += n * hours;
  // workers: +2% plants and ore per inhabitant, at most double
  const work = 1 + Math.min(1, population(H) / 50);
  got.plant *= work; got.ore *= work;
  for (const r in got) got[r] = Math.floor(got[r]);
  st.bag.plant += got.plant; st.bag.ore += got.ore; addFuel(st, got.fuel);
  return got;
}
const TITLES = [[1, 'Landing site'], [2, 'Camp'], [3, 'Village'], [5, 'Town'], [6, 'City'], [9, 'Capital']];
export const civTitle = (home) => TITLES.findLast(([n]) => civLevel(home) >= n)[1];

export const setHome = (st, seed, now = 0) => (st.home = { seed, built: [], animals: [], prod: now, since: now });

/** Releases the creatures in the bag on the home planet; returns how many. */
/** Sows the seeds in the bag in the home's garden (one entry per species); returns how many are new. */
export function sow(st) {
  st.home.garden ??= []; // homes from before the garden, and a bag without seeds
  const fresh = (st.bag.seeds ?? []).filter((s) => !st.home.garden.includes(s));
  st.home.garden.push(...fresh); st.bag.seeds = [];
  return fresh.length;
}
export function arriveHome(st) {
  const n = st.bag.creature.length;
  st.home.animals.push(...st.bag.creature); st.bag.creature = [];
  return n;
}

/** What a building costs under gravity `g` (1 normal, up to 2 on a dying world): plants and ore weigh more. */
export const costOf = (kind, g = 1) => { const c = BUILDINGS[kind].cost; return { ...c, plant: Math.ceil((c.plant ?? 0) * g), ore: Math.ceil((c.ore ?? 0) * g) }; };
export const canBuild = (st, kind, g = 1) => {
  const c = costOf(kind, g);
  return st.bag.plant >= c.plant && st.bag.ore >= c.ore && st.home.animals.length >= (c.animals ?? 0);
};

/** Builds `kind` at x (on the structures' layer) if the bag pays for it. */
export function build(st, kind, x, g = 1) {
  if (!canBuild(st, kind, g)) return false;
  const c = costOf(kind, g);
  st.bag.plant -= c.plant; st.bag.ore -= c.ore;
  st.home.built.push({ kind, x, seed: st.home.built.length + 1 });
  return true;
}

// Pirates, on a clock everyone shares: every 8 hours a home may be attacked. They come for bigger
// civilizations with bigger crews; castles and towers, people and creatures defend it. A lost raid
// damages a building (it does nothing until repaired); a repelled one leaves ore from the wreck.
// New homes are left alone for 3 days, and a home that lost a raid for a day.
export const PIRATES = { slot: 8 * 3600e3, chance: 0.3, grace: 3 * 864e5, shield: 864e5 };
/** Defence of a home: castles and towers, one per 5 people, one per 3 creatures. */
export const defence = (home) => kinds(home).reduce((a, k) => a + (BUILDINGS[k].guard ?? 0), 0)
  + Math.floor(population(home) / 5) + Math.floor((home?.animals.length ?? 0) / 3);
/** Average pirate crew for a home of this civilization level (a raid ranges from half to 1.5 times it). */
export const pirateThreat = (home) => 2 + 2 * civLevel(home);
/** The raid on `home` in clock slot `slot`, or null: { at, crew } (the same for everyone, from the seed). */
export function raidAt(home, slot) {
  const r = rngFrom(`${home.seed}:pirates:${slot}`);
  if (r() >= PIRATES.chance) return null;
  return { at: (slot + r()) * PIRATES.slot, crew: Math.round(pirateThreat(home) * (0.5 + r())) };
}
/** Fights the raids since the last check (at most a day's worth, like production); returns what happened:
 *  [{ at, crew, defence, won, damaged?: kind, loot?: ore }]. */
export function pirates(st, now) {
  const H = st.home, from = Math.max(H.raided ?? 0, (H.since ?? 0) + PIRATES.grace, now - 864e5), out = [];
  H.raided = now;
  for (let slot = Math.floor(from / PIRATES.slot); slot * PIRATES.slot < now; slot++) {
    const raid = raidAt(H, slot);
    if (!raid || raid.at < from || raid.at >= now || raid.at < (H.shield ?? 0)) continue;
    out.push(fight(st, raid, slot));
  }
  return out;
}
// A raid on our home: won, it leaves ore; lost, a building (picked from `key`) is damaged and a day of shield follows.
function fight(st, raid, key) {
  const H = st.home, d = defence(H), won = d >= raid.crew, res = { ...raid, defence: d, won };
  if (won) { res.loot = 2 + Math.floor(raid.crew / 3); st.bag.ore += res.loot; }
  else {
    const ok = H.built.filter((b) => !b.damaged);
    if (ok.length) { const b = ok[Math.floor(rngFrom(`${H.seed}:hit:${key}`)() * ok.length)]; b.damaged = true; res.damaged = b.kind; }
    H.shield = raid.at + PIRATES.shield;
  }
  return res;
}

// Sieges (Freenet): an explorer spends time on another explorer's home; each 2 minutes of siege is one
// raider. A siege costs fuel and ore to start; a won one brings back ore from the defeated home.
export const SIEGE = { fuel: 20, ore: 10, minutesPerRaider: 2 };
export const siegeCrew = (seconds) => Math.floor(seconds / 60 / SIEGE.minutesPerRaider);
export const siegeLoot = (crew) => 5 + Math.floor(crew / 2);
export const canSiege = (st) => (st.fuel ?? 0) >= SIEGE.fuel && st.bag.ore >= SIEGE.ore;
export function payForSiege(st) {
  if (!canSiege(st)) return false;
  st.fuel -= SIEGE.fuel; st.bag.ore -= SIEGE.ore;
  return true;
}
/** Another explorer besieged our home with `crew` raiders at time `at` (`key` identifies the raid): fought
 *  like pirates, unless the home is new or shielded after a lost raid (then null). */
export function besieged(st, crew, at, key) {
  const H = st.home;
  if (!H || at < (H.since ?? 0) + PIRATES.grace || at < (H.shield ?? 0)) return null;
  return fight(st, { at, crew }, key);
}
/** Repairing a damaged building (a kind, or a built one: a fused one costs both) costs half of building it. */
export const repairCost = (b, g = 1) => (typeof b === 'string' ? [b] : partsOf(b)).map((k) => costOf(k, g))
  .reduce((a, c) => ({ plant: a.plant + Math.ceil(c.plant / 2), ore: a.ore + Math.ceil(c.ore / 2) }), { plant: 0, ore: 0 });
export function repair(st, i, g = 1) {
  const b = st.home.built[i], c = b?.damaged && repairCost(b, g);
  if (!c || st.bag.plant < c.plant || st.bag.ore < c.ore) return false;
  st.bag.plant -= c.plant; st.bag.ore -= c.ore; delete b.damaged;
  return true;
}

// Breeding: each working stable lets two species living at home have a young one a day, for plants and
// ore. The young (world.js breed) joins the home's creatures; it can breed in turn, up to MAX_GEN generations.
export const BREED = { plant: 10, ore: 5 };
export const breedsLeft = (st, day) => builtOf(st, 'longhouse') - (st.home.bred?.day === day ? st.home.bred.n : 0);
/** Breeds species `a` and `b` (both living at home) on `day`; returns the young's id, or null. */
export function breedAt(st, a, b, day) {
  const H = st.home, id = a === b ? null : bredId(a, b);
  if (!id || generation(id) < 1 || !H.animals.includes(a) || !H.animals.includes(b)) return null;
  if (breedsLeft(st, day) < 1 || st.bag.plant < BREED.plant || st.bag.ore < BREED.ore) return null;
  st.bag.plant -= BREED.plant; st.bag.ore -= BREED.ore;
  H.bred = { day, n: (H.bred?.day === day ? H.bred.n : 0) + 1 };
  H.animals.push(id);
  return id;
}

// Crossing: each working mill lets two wild plant species sown in the garden give a hybrid a day (world.js
// crossPlant), for plants and ore. The hybrid is sown in the garden too.
export const CROSS = { plant: 8, ore: 4 };
export const crossesLeft = (st, day) => builtOf(st, 'windmill') - (st.home.crossed?.day === day ? st.home.crossed.n : 0);
/** Crosses plant species `a` and `b` (wild, both in the garden) on `day`; returns the hybrid's id, or null (also if already grown). */
const wild = (id) => !id.includes('+');
export function crossAt(st, a, b, day) {
  const H = st.home, g = (H.garden ??= []), id = [a, b].sort().join('+');
  if (a === b || !wild(a) || !wild(b) || !g.includes(a) || !g.includes(b) || g.includes(id)) return null;
  if (crossesLeft(st, day) < 1 || st.bag.plant < CROSS.plant || st.bag.ore < CROSS.ore) return null;
  st.bag.plant -= CROSS.plant; st.bag.ore -= CROSS.ore;
  H.crossed = { day, n: (H.crossed?.day === day ? H.crossed.n : 0) + 1 };
  g.push(id);
  return id;
}

// Fusing: two working buildings of different kinds become one that does what both did, where the first stood.
// A new pair counts as a new kind for the civilization; a raid on it damages both halves.
export const FUSE = { plant: 10, ore: 10 };
export function fuse(st, i, j) {
  const H = st.home, a = H.built[i], b = H.built[j];
  if (i === j || !a || !b || a.fused || b.fused || a.damaged || b.damaged || a.kind === b.kind) return false;
  if (st.bag.plant < FUSE.plant || st.bag.ore < FUSE.ore) return false;
  st.bag.plant -= FUSE.plant; st.bag.ore -= FUSE.ore;
  a.fused = b.kind; H.built.splice(j, 1);
  return true;
}

// Exodus: a home whose world is dying can move, buildings and creatures included, for a price per building.
export const MOVE_COST = { plant: 3, ore: 3 };
export const moveCost = (st) => ({ plant: MOVE_COST.plant * st.home.built.length, ore: MOVE_COST.ore * st.home.built.length });
export function moveHome(st, seed) {
  const c = moveCost(st);
  if (st.bag.plant < c.plant || st.bag.ore < c.ore) return false;
  st.bag.plant -= c.plant; st.bag.ore -= c.ore; st.home.seed = seed;
  return true;
}
/** The home world collapsed: the buildings are lost (their ruins stay in the next world of that star),
 *  the creatures escape into the bag. */
export function loseHome(st) {
  st.bag.creature.push(...st.home.animals);
  const lost = st.home; st.home = null;
  st.ruins = [...(st.ruins ?? []), { seed: lost.seed, built: lost.built }].slice(-20);
  return lost;
}
/** Evacuating a collapsing world: half of what is in the bag is left behind. */
export function evacuate(st) {
  st.bag.plant = Math.floor(st.bag.plant / 2); st.bag.ore = Math.floor(st.bag.ore / 2);
  st.bag.creature = st.bag.creature.slice(0, Math.floor(st.bag.creature.length / 2));
}

/** A trader's deal: pay `give` from the bag, get ore, fuel or a creature (`creatureId`). */
export function trade(st, deal, creatureId) {
  const g = deal.give, x = deal.get;
  if (st.bag.plant < (g.plant ?? 0) || st.bag.ore < (g.ore ?? 0) || (x.creature && !creatureId)) return false;
  st.bag.plant -= g.plant ?? 0; st.bag.ore -= g.ore ?? 0;
  if (x.ore) st.bag.ore += x.ore;
  if (x.fuel) addFuel(st, x.fuel);
  if (x.creature) st.bag.creature.push(creatureId);
  return true;
}
