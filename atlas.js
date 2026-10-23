// Player progress: discoveries, achievements, saved worlds, daily world. Pure logic on a
// plain object; index.html persists it in localStorage.
import { PAGES } from './diary.js';
import { speciesOf, TRAITS, RARITY, RELICS, hashSeed, rng, rngFrom, randomSeed, bredId, generation, MAX_GEN, isFlyerId, EPOCH, DAY, CONCEPTS, languageOf, makeWorld, ageOf, instability, sectorOf, GALAXY } from './world.js';

// Every discoverable entry, as "trait:value".
export const ENTRIES = [
  ...Object.entries(TRAITS).flatMap(([k, t]) => Object.keys(t).map((v) => `${k}:${v}`)),
  'night:true', 'rings:true', 'sea:true', 'volcanoes:true', 'falls:true',
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
  ['Reader', "Find every page of Ilen's diary", (st) => (st.diary ?? []).length >= PAGES.length],
  ['Champion', 'Win 25 battles', (st) => (st.wins ?? 0) >= 25],
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
// `auto`: what auto-walk burns per screen (walking by hand burns nothing and earns `perScreen` on new ground)
export const FUEL = { max: 100, perScreen: 4, auto: 1, maxPerSecond: 0.3, entry: 10, combo: 10, species: 15, rareSpecies: 25, relic: 30, mission: 100, random: 100 };
// Local play numbers (they stay in the browser): what was earned, spent and wasted, to tune the game from real play.
export const stat = (st, key, n = 1) => { const s = (st.stats ??= {}); s[key] = (s[key] ?? 0) + n; };
export function addFuel(st, n) {
  const before = st.fuel ?? FUEL.max;
  st.fuel = Math.min(FUEL.max, before + n);
  stat(st, 'fuelIn', st.fuel - before); stat(st, 'fuelLost', n - (st.fuel - before)); // lost: it did not fit in the tank
  return st.fuel;
}

// Cost to jump from sector `from` (null: off the map) to the star in sector `to`: near is cheap.
export function jumpCost(from, to, size) {
  if (!from) return 60;
  const d = (a, b) => Math.min(Math.abs(a - b), size - Math.abs(a - b)); // the galaxy wraps around
  return Math.min(FUEL.random, 20 + 15 * Math.max(d(from[0], to[0]), d(from[1], to[1])));
}

// Pickups: each one can be collected once a day per explorer; at most 3 time shards a day per planet.
export const PICKUP = { fuel: 10, boost: 3, boostMs: 90_000, timePerPlanetDay: 3 };
const pickKey = (seed, p) => `${seed}|${p.id}|${p.kind}`;
export const picked = (st, day, seed, p) => st.picked?.day === day && st.picked.ids.includes(pickKey(seed, p));

// Battles: you, and up to 3 creatures from home, against a wild creature. Each round everyone strikes
// once, the fastest first (your side on a tie); the creature hits one of you at random. Stats come from
// a creature's parts: size gives life and strength, horns hit harder, legs and pace are speed.
// Your level grows with the battles you win: more life and a harder blow.
// Wild creatures grow stronger far from the arrival point and on dying worlds (their level).
// 🌿 Heal spends plants instead of your blow; a creature worn down to a quarter can be captured.
export const BATTLE = { hp: 40, atk: 8, spd: 5, flee: 5, party: 3, heal: { plant: 3, hp: 15 }, capture: 0.6, wild: { hp: 1.6, atk: 1.8 }, ally: { hp: 0.7, atk: 0.3 }, guard: 0.5, chargeEvery: 3 };
// `wild`: a wild creature is tougher than the same species at your side (`BATTLE.wild`); `ally` is how much of its
// strength a creature of yours brings to a battle
export const foeStats = (sp, lv = 1, wild = true) => ({
  hp: Math.round((8 + 10 * sp.scale + (sp.tail === 'bushy' ? 3 : 0)) * (1 + 0.4 * (lv - 1)) * (wild ? BATTLE.wild.hp : 1)),
  atk: Math.round((2 + 2 * sp.scale + (sp.extra === 'horns' ? 3 : 0) + (sp.head === 'long' ? 1 : 0)) * (1 + 0.25 * (lv - 1)) * (wild ? BATTLE.wild.atk : 1)),
  spd: sp.legs + Math.round(sp.pace * 2) - (sp.neck === 'long' ? 1 : 0),
});
export const battleLevel = (st) => 1 + Math.floor(Math.sqrt(st.wins ?? 0));
// Creatures grow with the battles they fight: every win gives each creature at your side an xp, and a
// level (1 + √xp) adds life and blows (half as much as a wild creature's level does).
export const creatureLevel = (st, id) => 1 + Math.floor(Math.sqrt(st.xp?.[id] ?? 0));
/** The walking creatures of your home that fight at your side: the best against a foe of element `foeEl`
 *  (strength and level, times the element's edge), at most 3, each with its `level`. */
export const battleParty = (st, foeEl = null) => (st.home?.animals ?? []).map(speciesOf).filter((sp) => sp?.legs)
  .map((sp) => { const level = creatureLevel(st, sp.id), s = foeStats(sp, 1 + (level - 1) / 2, false); return { ...sp, level, score: (s.hp + 3 * s.atk) * edge(elementOf(sp), foeEl) }; })
  .sort((a, b) => b.score - a.score).slice(0, BATTLE.party);
// Elements: a creature fights with the element of its home world's culture (a bred one, of its first
// wild ancestor's). Each element beats the next in the cycle: 🔥 burns 🌿, 🌿 holds against 🌀, 🌀 blows
// away ❄, ❄ puts out 🔥. A blow on the element it beats hits ×1.5, on the one that beats it ×0.75; you have none.
export const ELEMENTS = { fire: ['🔥', 'wild'], wild: ['🌿', 'wind'], wind: ['🌀', 'frost'], frost: ['❄', 'fire'] };
const CULTURE_ELEMENT = { desert: 'fire', apocalyptic: 'fire', war: 'fire', jungle: 'wild', temperate: 'wild', japanese: 'wind', western: 'wind', nordic: 'frost', arctic: 'frost' };
export const cultureElement = (culture) => CULTURE_ELEMENT[culture] ?? null;
export const elementOf = (sp) => { const seed = sp.id?.match(/v1-[^#()+]+/)?.[0]; return seed ? cultureElement(makeWorld(seed).culture) : null; };
export const edge = (a, b) => !a || !b ? 1 : ELEMENTS[a][1] === b ? 1.5 : ELEMENTS[b][1] === a ? 0.75 : 1;
const edgeWord = (m) => (m > 1 ? ' (strong)' : m < 1 ? ' (weak)' : '');

export function startBattle(sp, seed, allies = [], level = 1, foeLevel = 1) {
  const s = foeStats(sp, foeLevel), me = { name: 'You', hp: BATTLE.hp + 3 * (level - 1), atk: BATTLE.atk + level - 1, spd: BATTLE.spd };
  const team = [me, ...allies.map((a) => { const lv = a.level ?? 1, s = foeStats(a, 1 + (lv - 1) / 2, false); return { name: a.name, id: a.id, lv, ...s, hp: Math.round(s.hp * BATTLE.ally.hp), atk: Math.ceil(s.atk * BATTLE.ally.atk), element: elementOf(a) }; })].map((f) => ({ ...f, max: f.hp }));
  return { foe: sp, element: elementOf(sp), level: foeLevel, ...s, max: s.hp, team, special: true, round: 0, charge: false, r: rng(seed) };
}
const blow = (r, atk, m = 1) => Math.max(1, Math.round(atk * m * (0.7 + r() * 0.6)));
export const canCapture = (b) => b.hp > 0 && b.hp <= b.max / 4;
/** One round of battle `b`; `act`: 'attack', 'special' (once a battle, a double blow), 'heal' (the caller pays
 *  the plants), 'capture' (instead of your blow; sets b.caught) or 'guard' (no blow, half the damage to your
 *  side this round). Every third round the wild creature gathers its strength (`b.charge`) and then hits
 *  twice as hard: that is the round to guard. Returns a line per blow. */
export function battleRound(b, act = 'attack') {
  const log = [], foe = { spd: b.spd }, me = b.team[0], special = act === 'special' && b.special;
  if (special) b.special = false;
  if (act === 'heal') { const n = Math.min(BATTLE.heal.hp, me.max - me.hp); me.hp += n; log.push(`You eat some plants: +${n}`); }
  if (act === 'capture') {
    b.caught = canCapture(b) && b.r() < BATTLE.capture;
    if (b.caught) return [`You captured ${b.foe.name}!`];
    log.push(`${b.foe.name} breaks free`);
  }
  if (act === 'guard') log.push('You brace yourselves');
  const heavy = b.charge;
  for (const f of [...b.team, foe].sort((x, y) => y.spd - x.spd)) {
    if (b.hp <= 0 || me.hp <= 0) break;
    if (f === foe) {
      const up = b.team.filter((t) => t.hp > 0), pool = [...up, ...up.filter((t) => t === me)], t = pool[Math.floor(b.r() * pool.length)], m = edge(b.element, t.element), d = blow(b.r, b.atk, m * (heavy ? 2 : 1) * (act === 'guard' ? BATTLE.guard : 1));
      t.hp -= d; log.push(`${b.foe.name} ${heavy ? 'unleashes a heavy blow on' : 'hits'} ${t === me ? 'you' : t.name}: −${d}${edgeWord(m)}`);
    } else if (f.hp > 0 && (f !== me || act === 'attack' || special)) {
      const twice = special && f === me, m = edge(f.element, b.element), d = blow(b.r, f.atk, m) * (twice ? 2 : 1);
      b.hp -= d; log.push(`${f === me ? (twice ? 'Your special move hits' : 'You hit') : `${f.name} hits`} ${b.foe.name}: −${d}${edgeWord(m)}`);
    }
  }
  b.charge = ++b.round % BATTLE.chargeEvery === BATTLE.chargeEvery - 1 && b.hp > 0;
  if (b.charge) log.push(`${b.foe.name} is gathering its strength!`);
  return log;
}
export const battleLoot = (b) => 2 + Math.ceil(b.max / 8);
/** Ends a won battle: the loot goes into the bag, the win counts towards your level. */
export function winBattle(st, b) {
  const n = battleLoot(b); st.bag.ore += n; st.wins = (st.wins ?? 0) + 1;
  for (const f of b.team.slice(1)) (st.xp ??= {})[f.id] = (st.xp[f.id] ?? 0) + 1; // those who fought at your side
  return n;
}

// Jumping. The explorer walks along a layer at position `gx` (layer units); obstacles (`world.js`
// `obstaclesNear`) taller than its height `y` (in explorer sizes) stop it at their edge. A jump rises with
// `JUMP.v0` against gravity `JUMP.g` (more on heavy worlds) and carries it `JUMP.boost` times as fast.
export const JUMP = { v0: 5.3, g: 10, boost: 2.2, reach: 0.006, grav: 0.5 }; // `grav`: how much of a heavy world's gravity a jump feels
/** The move (≤ `dx`) the explorer is allowed from `gx`, `y` high. */
export function walkBy(gx, y, dx, obs) {
  let to = gx + dx;
  for (const o of obs) {
    if (y >= o.h) continue;
    const lo = o.x - o.w - JUMP.reach, hi = o.x + o.w + JUMP.reach;
    if (dx > 0 && gx <= lo && to > lo) to = lo;
    if (dx < 0 && gx >= hi && to < hi) to = hi;
  }
  return to - gx;
}
/** If the explorer has come down inside an obstacle, the position at its nearest edge (else `gx`). */
export function settle(gx, y, obs) {
  for (const o of obs) {
    const lo = o.x - o.w - JUMP.reach, hi = o.x + o.w + JUMP.reach;
    if (y < o.h && gx > lo && gx < hi) return gx - lo < hi - gx ? lo : hi;
  }
  return gx;
}
export const canJump = (j) => j.y === 0 && j.vy === 0;
export const startJump = (j) => { if (canJump(j)) j.vy = JUMP.v0; };
/** Advances a jump (`j` = { y, vy }) by `dt` seconds under gravity `grav` (1 = normal). */
export function jumpStep(j, dt, grav = 1) {
  if (canJump(j)) return;
  j.vy -= JUMP.g * (1 + JUMP.grav * (grav - 1)) * dt; j.y += j.vy * dt;
  if (j.y <= 0) { j.y = 0; j.vy = 0; }
}
/** Auto-walk: is an obstacle within `ahead` of the way (towards `dir`)? Then it is time to leap. */
export const shouldLeap = (gx, dir, obs, ahead) => obs.some((o) => {
  const gap = dir > 0 ? o.x - o.w - JUMP.reach - gx : gx - (o.x + o.w + JUMP.reach);
  return gap >= 0 && gap <= ahead;
});

// Ilen's diary: each world's page can be taken once, and the n-th page found is page n.
export const hasPage = (st, seed) => (st.diary ?? []).includes(seed) || (st.diary ?? []).length >= PAGES.length;
export function readPage(st, seed) {
  if (hasPage(st, seed)) return false;
  (st.diary ??= []).push(seed);
  return true;
}
/** What a chest on planet `seed` holds on `day`: the same for everyone. */
export function chestLoot(seed, id, day) {
  const u = rng(hashSeed(`${seed}:${id}:${day}`))();
  return u < 0.4 ? { fuel: 12 } : u < 0.7 ? { plant: 3 } : { ore: 3 };
}
/** Collect pickup `p` on planet `seed`; returns false if already taken or over today's limit. */
export function collect(st, day, seed, p, now) {
  if (p.kind === 'page') return readPage(st, seed);
  if (st.picked?.day !== day) st.picked = { day, ids: [] };
  if (picked(st, day, seed, p)) return false;
  if (p.kind === 'time' && st.picked.ids.filter((k) => k.startsWith(seed + '|') && k.endsWith('|time')).length >= PICKUP.timePerPlanetDay) return false;
  st.picked.ids.push(pickKey(seed, p));
  if (p.kind === 'fuel') addFuel(st, PICKUP.fuel);
  // shards stack on the same planet; another planet's shard starts a new boost
  if (p.kind === 'time') st.boost = { seed, until: Math.max(now, st.boost?.seed === seed ? st.boost.until : 0) + PICKUP.boostMs };
  if (p.kind === 'map') st.halfJump = true;
  if (p.kind === 'chest') { const l = chestLoot(seed, p.id, day); if (l.fuel) addFuel(st, l.fuel); st.bag.plant += l.plant ?? 0; st.bag.ore += l.ore ?? 0; }
  // gathered on the way, spent on the home planet
  // home buildings make gathering richer
  if (p.kind === 'plant' || p.kind === 'ore') { const n = (p.amount ?? 1) + gatherBonus(st, p.kind); st.bag[p.kind] += n; stat(st, p.kind, n); }
  // the first harvest of a plant species also gives its seeds, sown at home on the next visit
  if (p.kind === 'plant' && p.species && !(st.bag.seeds ??= []).includes(p.species) && !st.home?.garden?.includes(p.species)) st.bag.seeds.push(p.species);
  if (p.kind === 'creature') for (let k = 1 + gatherBonus(st, 'creature'); k--;) { st.bag.creature.push(p.dna); stat(st, 'creature'); }
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
// Upgrades: a building can be upgraded up to MAX_LV times; each level adds half of its base housing, food, hourly
// output and guard (a fused building upgrades both halves). Published homes still list plain parts: the level
// shows in the declared size (people, points), which `size_ok` bounds as UP times the base.
export const MAX_LV = 3;
const mult = (b) => 1 + Math.min(MAX_LV, b.lv ?? 0) / 2;
const working = (home) => (home?.built ?? []).filter((b) => !b.damaged).flatMap((b) => partsOf(b).filter((k) => BUILDINGS[k]).map((k) => [k, mult(b)]));
const kinds = (home) => working(home).map(([k]) => k);
const total = (home, f) => Math.floor(working(home).reduce((a, [k, m]) => a + (BUILDINGS[k][f] ?? 0) * m, 0));
// What the land around the landing site feeds without farms.
export const BASE_FOOD = 6;
/** People living at home: as many as the buildings shelter, but no more than they can feed. */
// A published home lists at most 64 building parts and 64 creatures; it also declares its whole size
// ([parts, creatures, people, points]), which only the leaderboard reads (fights use what is listed).
export const homeSize = (home) => [(home.built ?? []).flatMap(partsOf).length, home.animals.length, population(home), civPoints(home)];
export function population(home) {
  const k = kinds(home);
  if (!k.length) return 0;
  const sum = (f) => total(home, f);
  // `lost`: people who starved (see produce); the empty homes fill again while everyone eats
  return Math.max(0, Math.min(sum('house'), BASE_FOOD + sum('food')) - Math.ceil(home.lost ?? 0));
}
// Each inhabitant eats this many plants an hour (from the bag); one starved person comes back every REGROW hours fed.
export const EAT = 0.1, REGROW = 4;
/** Civilization points: people, what was built (its cost), the variety of buildings (each kind of fusion too), creatures. */
export function civPoints(home) {
  const k = kinds(home), c = (x) => (BUILDINGS[x].cost.plant ?? 0) + (BUILDINGS[x].cost.ore ?? 0), spent = working(home).reduce((a, [x, m]) => a + Math.floor(c(x) * m), 0);
  const fused = new Set((home?.built ?? []).filter((b) => b.fused && !b.damaged).map((b) => partsOf(b).sort().join('+')));
  return population(home) * 5 + spent + (new Set(k).size + fused.size) * 10 + (home?.animals.length ?? 0) * 3;
}
/** Civilization level, from 1: each level needs more points than the one before. */
export const levelFor = (points) => 1 + Math.floor(Math.sqrt(points / 20));
export const civLevel = (home) => levelFor(civPoints(home));
const builtOf = (st, k) => st.home?.built.filter((b) => partsOf(b).includes(k) && !b.damaged).length ?? 0;
// +1 per building of that kind, at most +3 (creatures: at most one extra)
export const gatherBonus = (st, kind) => Math.min(kind === 'creature' ? 1 : 3,
  Object.entries(BUILDINGS).filter(([, b]) => b.gather === kind).reduce((a, [k]) => a + builtOf(st, k), 0));
// Fleet: each stable or workshop at home gives a ship (at most 3). A ship flies to a star you have visited,
// gathers there for 1-4 hours (farther is longer and costs more fuel) and brings back plants, ore and
// maybe a new plant species, collected when you come home. Dying worlds give more, but may take the ship.
export const FLEET = { max: 3 };
export const fleetSize = (st) => Math.min(FLEET.max, builtOf(st, 'longhouse') + builtOf(st, 'factory'));
/** Fuel and hours for a ship from home to `seed`. */
export function voyage(st, seed) {
  const fuel = jumpCost(sectorOf(st.home.seed), sectorOf(seed), GALAXY);
  return { fuel, hours: 1 + Math.round((3 * (fuel - 20)) / 80) };
}
/** Sends a ship to `seed`; false without a free ship or the fuel. */
export function sendShip(st, seed, now) {
  const v = voyage(st, seed);
  if (seed === st.home?.seed || (st.fleet ??= []).length >= fleetSize(st) || (st.fuel ?? FUEL.max) < v.fuel) return false;
  st.fuel -= v.fuel; stat(st, 'fuelShip', v.fuel);
  st.fleet.push({ seed, at: now, back: now + v.hours * 3.6e6 });
  return true;
}
/** What a ship's voyage brings back (the same voyage always gives the same): { plant, ore, species, lost }. */
export function shipLoot(s) {
  const w = makeWorld(s.seed), r = rngFrom(`fleet:${s.seed}:${s.at}`), life = ageOf(s.seed, s.back);
  const risk = life ? (life.dead ? 1 : instability(life.age)) : 0, rich = 1 + risk, hours = (s.back - s.at) / 3.6e6;
  if (r() < risk * 0.5) return { lost: true };
  return { plant: Math.round((3 + r() * 4) * hours * rich), ore: Math.round((1 + r() * 3) * hours * rich), species: w.plants.length && r() < 0.5 ? w.plants[Math.floor(r() * w.plants.length)] : null };
}
/** Ships back by `now`: their loot goes to the bag (and new plants to the herbarium); returns [{ seed, ...loot, isNew }]. */
export function fleetBack(st, now) {
  const back = (st.fleet ?? []).filter((s) => s.back <= now);
  st.fleet = (st.fleet ?? []).filter((s) => s.back > now);
  return back.map((s) => {
    const l = shipLoot(s);
    if (l.lost) return { seed: s.seed, lost: true };
    st.bag.plant += l.plant; st.bag.ore += l.ore;
    const isNew = !!l.species && findPlant(st, l.species, makeWorld(s.seed)).isNew;
    if (isNew && !st.home?.garden?.includes(l.species.id)) (st.bag.seeds ??= []).push(l.species.id);
    return { seed: s.seed, ...l, isNew };
  });
}
// each tower takes 10% off jumps, at most 50%
export const jumpDiscount = (st) => Math.min(0.5, builtOf(st, 'tower') * BUILDINGS.tower.jump);

/** What the home produced since the last visit (at most a day's worth), added to bag and tank. */
export function produce(st, now) {
  const H = st.home, hours = Math.min(24, Math.max(0, (now - (H.prod ?? now)) / 3.6e6)), got = { plant: 0, ore: 0, fuel: 0 };
  H.prod = now;
  for (const [k, m] of working(H)) for (const [r, n] of Object.entries(BUILDINGS[k].hour ?? {})) got[r] += n * m * hours;
  // workers: +2% plants and ore per inhabitant, at most double
  const work = 1 + Math.min(1, population(H) / 50);
  got.plant *= work; got.ore *= work;
  for (const r in got) got[r] = Math.floor(got[r]);
  st.bag.plant += got.plant; st.bag.ore += got.ore; addFuel(st, got.fuel);
  // people eat what the home made and the bag holds; whoever goes hungry dies
  const pop = population(H), need = Math.round(pop * EAT * hours), eaten = Math.min(need, Math.floor(st.bag.plant));
  st.bag.plant -= eaten;
  const starved = need > eaten ? Math.min(pop, Math.ceil((need - eaten) / (EAT * hours))) : 0;
  H.lost = starved ? (H.lost ?? 0) + starved : Math.max(0, (H.lost ?? 0) - hours / REGROW);
  if (!H.lost) delete H.lost;
  return { ...got, eaten, starved };
}
const TITLES = [[1, 'Landing site'], [2, 'Camp'], [3, 'Village'], [5, 'Town'], [6, 'City'], [9, 'Capital']];
export const titleFor = (lv) => TITLES.findLast(([n]) => lv >= n)[1];
export const civTitle = (home) => titleFor(civLevel(home));

// Cities: besides the home planet, a city can be founded on each planet you colonized (up to CITY.max). A city has
// its own buildings, people, creatures and garden (the bag's creatures and seeds are unloaded there when you arrive, as at
// the home) and produces, eats and is upgraded like the home, but has no fleet or breeding; its
// buildings that ask for creatures count the ones at the main home. Pirates raid the main home only. Cities live in
// `st.cities` as home-shaped objects; `withHome` runs home logic (build, upgrade, produce...) on one of them.
export const CITY = { plant: 30, ore: 30, max: 8, grow: 1.5 };
export const cityOf = (st, seed) => (st.cities ?? []).find((c) => c.seed === seed);
export const cityCost = (st) => { const k = CITY.grow ** (st.cities?.length ?? 0); return { plant: Math.ceil(CITY.plant * k), ore: Math.ceil(CITY.ore * k) }; };
/** Founds a city on `seed` (the caller checks that it is your colony): not on the home planet, once per planet. */
export function foundCity(st, seed, now = 0, k = 1) {
  const c = cityCost(st); c.plant *= k; c.ore *= k;
  if (!st.home || st.home.seed === seed || cityOf(st, seed) || (st.cities?.length ?? 0) >= CITY.max || st.bag.plant < c.plant || st.bag.ore < c.ore) return false;
  st.bag.plant -= c.plant; st.bag.ore -= c.ore;
  (st.cities ??= []).push({ seed, built: [], animals: [], prod: now, since: now });
  stat(st, 'cities');
  return true;
}
// Settlers: people from the home or a city found a city on one of your colonies, with a few buildings already up.
// It costs `mult` times a city; the people who leave are missing from where they were (they come back as the starved do).
export const SETTLERS = { mult: 10, people: 5, start: ['house', 'house', 'windmill'] };
export const settlersCost = (st) => { const c = cityCost(st); return { plant: c.plant * SETTLERS.mult, ore: c.ore * SETTLERS.mult }; };
/** Sends settlers from `st.home` (the home or a city swapped in) to found a city on `seed`, whose flag stands at `x`. */
export function sendSettlers(st, seed, x, now = 0) {
  const from = st.home;
  if (!from || population(from) < SETTLERS.people || !withMain(st, () => foundCity(st, seed, now, SETTLERS.mult))) return false;
  cityOf(st, seed).built = SETTLERS.start.map((kind, i) => ({ kind, x: x + (i - 1) * 0.15, seed: i + 1 }));
  from.lost = (from.lost ?? 0) + SETTLERS.people;
  return true;
}
let mainHome = null; // the real home while `withHome` has a city in st.home
/** Runs `f` with `city` as st.home (nested calls keep the first real home). */
export function withHome(st, city, f) {
  if (!city) return f();
  const first = mainHome === null; if (first) mainHome = st.home;
  const was = st.home; st.home = city;
  try { return f(); } finally { st.home = first ? mainHome : was; if (first) mainHome = null; }
}
/** Runs `f` with the real home back in st.home (to save the state while a city is swapped in). */
export function withMain(st, f) {
  if (mainHome === null) return f();
  const city = st.home; st.home = mainHome;
  try { return f(); } finally { st.home = city; }
}
/** A city whose world collapsed is lost with its buildings; returns the lost ones. */
export function loseCities(st, dead) {
  const lost = (st.cities ?? []).filter((c) => dead(c.seed));
  if (lost.length) st.cities = st.cities.filter((c) => !lost.includes(c));
  return lost;
}

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
  return st.bag.plant >= c.plant && st.bag.ore >= c.ore && Math.max(st.home.animals.length, mainHome?.animals.length ?? 0) >= (c.animals ?? 0);
};

/** Builds `kind` at x (on the structures' layer) if the bag pays for it. */
export function build(st, kind, x, g = 1) {
  if (!canBuild(st, kind, g)) return false;
  const c = costOf(kind, g);
  st.bag.plant -= c.plant; st.bag.ore -= c.ore;
  st.home.built.push({ kind, x, seed: st.home.built.length + 1 });
  stat(st, 'built');
  return true;
}

// Pirates, on a clock everyone shares: every 8 hours a home may be attacked. They come for bigger
// civilizations with bigger crews; castles and towers, people and creatures defend it. A lost raid
// damages a building (it does nothing until repaired); a repelled one leaves ore from the wreck.
// New homes are left alone for 3 days, and a home that lost a raid for a day.
export const PIRATES = { slot: 8 * 3600e3, chance: 0.3, grace: 3 * 864e5, shield: 864e5 };
/** Defence of a home: castles and towers, one per 5 people, one per 3 creatures. */
export const defence = (home) => total(home, 'guard')
  + Math.floor(population(home) / 5) + Math.floor((home?.animals.length ?? 0) / 3);
/** Average pirate crew for a home of this civilization level (a raid ranges from half to 1.5 times it). */
export const pirateThreat = (home) => 2 + 2 * civLevel(home);
/** What the home lacks, as meters from 0 to 1 (1: covered), each with the buildings that mend it, best first:
 *  homes (places for the people the land can feed), food (the land against the places), defence (against the
 *  biggest raid), stables (one per 8 creatures) and the plants in the bag (a day of food for everyone). */
// Creatures a stable holds (before upgrades): the Stables need.
const STABLE_ROOM = 8;
export function homeNeeds(st) {
  const H = st.home, sum = (f) => total(H, f);
  const shelter = sum('house'), feed = BASE_FOOD + sum('food'), pop = population(H), top = Math.round(1.5 * pirateThreat(H)), def = defence(H);
  const animals = H.animals.length, stables = builtOf(st, 'longhouse'), room = Math.floor(working(H).reduce((a, [k, m]) => a + (k === 'longhouse' ? STABLE_ROOM * m : 0), 0));
  const hours = pop ? st.bag.plant / (pop * EAT) : Infinity;
  return [
    { key: 'stock', icon: '🌿', label: 'Food stock', v: Math.min(1, hours / 24), text: pop ? `the bag feeds them for ${Math.floor(hours)} h` : 'nobody lives here yet', build: ['windmill', 'house'] },
    { key: 'food', icon: '🍞', label: 'Food', v: feed >= shelter ? 1 : feed / shelter, text: `the land feeds ${feed}, there are places for ${shelter}`, build: ['windmill', 'dome'] },
    { key: 'homes', icon: '🏠', label: 'Homes', v: shelter >= feed ? 1 : shelter / feed, text: `places for ${shelter}, the land feeds ${feed}`, build: ['house', 'castle'] },
    { key: 'defence', icon: '🛡', label: 'Defence', v: Math.min(1, def / top), text: `${def} against raids of up to ${top}`, build: ['castle', 'tower'] },
    { key: 'stables', icon: '🐾', label: 'Stables', v: animals >= 2 ? Math.min(1, room / animals) : 1, text: animals < 2 ? 'a stable breeds your creatures, once you have two' : `${stables} stables hold ${room} of ${animals} creatures (${STABLE_ROOM} each, more when upgraded)`, build: ['longhouse'] },
  ];
}
/** The most pressing need and the cheapest of its buildings, or null when all is covered. When one of its buildings
 *  that you already have can be upgraded for less than a new one costs, `up` is its index in `home.built` (an upgrade counts like a new building).  The first need in the
 *  order above that is below 60% comes first (a growing home needs people fed and housed before it needs walls);
 *  if none is, the lowest meter below 90%. */
export function homeAdvice(st, needs = homeNeeds(st)) {
  const n = needs.find((x) => x.v < 0.6) ?? needs.reduce((a, x) => (x.v < a.v ? x : a));
  if (n.v >= 0.9) return null;
  const cost = (b) => (BUILDINGS[b].cost.plant ?? 0) + (BUILDINGS[b].cost.ore ?? 0) + 10 * (BUILDINGS[b].cost.animals ?? 0), ok = n.build.filter((b) => canBuild(st, b));
  const kind = [...(ok.length ? ok : n.build)].sort((a, b) => cost(a) - cost(b))[0];
  const ups = st.home.built.map((b, i) => [b, i]).filter(([b]) => !b.damaged && (b.lv ?? 0) < MAX_LV && partsOf(b).some((k) => n.build.includes(k)))
    .map(([b, i]) => [i, upgradeCost(b)]).filter(([, c]) => st.bag.plant >= c.plant && st.bag.ore >= c.ore).sort(([, a], [, b]) => a.plant + a.ore - (b.plant + b.ore));
  const up = ups.length && ups[0][1].plant + ups[0][1].ore <= cost(kind) ? ups[0][0] : undefined;
  return { need: n, kind, ...(up !== undefined && { up }) };
}
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
// A flag costs what you carry: it grows 1.8x with every colony you already hold, and taking another explorer's planet costs double.
export const colonyCost = (owned, taken = false) => { const k = 1.8 ** owned * (taken ? 2 : 1); return { ore: Math.round(100 * k), plant: Math.round(150 * k) }; };
// Colonizing at once: the browser does the missing proof of work in a burst instead of waiting on the planet, and you
// pay for it on top of the flag: every minute of the goal still missing adds `perMinute` times the flag's price.
// `maxHashes` refuses a burst that would take too long (a planet whose colonist spent a very long time there).
export const RUSH = { perMinute: 1, maxHashes: 3e7 };
export const rushCost = (owned, taken, secondsLeft) => { const c = colonyCost(owned, taken), k = RUSH.perMinute * Math.ceil(Math.max(0, secondsLeft) / 60); return { ore: c.ore * k, plant: c.plant * k }; };
export const canColonize = (st, cost) => st.bag.ore >= cost.ore && st.bag.plant >= cost.plant;
export function payColony(st, cost) {
  if (!canColonize(st, cost)) return false;
  st.bag.ore -= cost.ore; st.bag.plant -= cost.plant;
  return true;
}
export const SIEGE = { fuel: 20, ore: 10, minutesPerRaider: 2 };
export const siegeCrew = (seconds) => Math.floor(seconds / 60 / SIEGE.minutesPerRaider);
export const siegeLoot = (crew) => 5 + Math.floor(crew / 2);
export const canSiege = (st) => (st.fuel ?? 0) >= SIEGE.fuel && st.bag.ore >= SIEGE.ore;
export function payForSiege(st) {
  if (!canSiege(st)) return false;
  st.fuel -= SIEGE.fuel; stat(st, 'fuelSiege', SIEGE.fuel); st.bag.ore -= SIEGE.ore;
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
  if (!id || generation(id) < 1 || isFlyerId(a) || isFlyerId(b) || !H.animals.includes(a) || !H.animals.includes(b)) return null; // flyers do not breed
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
  a.fused = b.kind; a.lv = Math.max(a.lv ?? 0, b.lv ?? 0) || undefined; H.built.splice(j, 1);
  return true;
}

// Upgrading: a working building gains a level for (level + 1) times the cost of building it (animals excepted).
export const upgradeCost = (b, g = 1) => {
  const c = partsOf(b).map((k) => costOf(k, g)), n = (b.lv ?? 0) + 1;
  return { plant: n * c.reduce((a, x) => a + x.plant, 0), ore: n * c.reduce((a, x) => a + x.ore, 0) };
};
export function upgrade(st, i, g = 1) {
  const b = st.home.built[i];
  if (!b || b.damaged || (b.lv ?? 0) >= MAX_LV) return false;
  const c = upgradeCost(b, g);
  if (st.bag.plant < c.plant || st.bag.ore < c.ore) return false;
  st.bag.plant -= c.plant; st.bag.ore -= c.ore; b.lv = (b.lv ?? 0) + 1;
  stat(st, 'upgraded');
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
