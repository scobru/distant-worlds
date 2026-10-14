import assert from 'node:assert/strict';
import { makeWorld, sectorOf } from './world.js';
import { FUEL, addFuel, jumpCost, ENTRIES, COMBOS, emptyState, visit, findRelic, findSpecies, dailySeed, mission, matches, checkMission, isoDay } from './atlas.js';

const st = emptyState();
let found = 0, missionWorld;
const m = mission('2026-10-12');
assert.deepEqual(m, mission('2026-10-12'), 'mission is deterministic');
for (let i = 0; i < 3000; i++) {
  const w = makeWorld('v1-' + i);
  found += visit(st, w).entries.length;
  if (!missionWorld && matches(w, m)) missionWorld = w;
}
assert.equal(st.count, 3000);
assert.equal(found, st.seen.length);
found = 0;
for (const k of st.seen) assert.ok(ENTRIES.includes(k), k);
assert.equal(st.seen.length, ENTRIES.filter((e) => !e.startsWith('relic:')).length, 'every trait entry is findable');
assert.deepEqual(findRelic(st, 'portal').entries, ['relic:portal']);
assert.deepEqual(findRelic(st, 'portal').entries, [], 'relic counted once');
findRelic(st, 'monolith');
assert.deepEqual(findRelic(st, 'skeleton').achievements, ['Relic seeker']);
assert.equal(st.combos.length, COMBOS.length, 'every combo is findable');
assert.ok(missionWorld, 'mission is findable');
// Streak: yesterday done -> +1, gap -> reset, same day -> no double count.
st.daily = { done: '2026-10-11', streak: 3, best: 3 };
assert.ok(checkMission(st, missionWorld, '2026-10-12', '2026-10-11'));
assert.deepEqual(st.daily, { done: '2026-10-12', streak: 4, best: 4 });
assert.ok(!checkMission(st, missionWorld, '2026-10-12', '2026-10-11'));
st.daily = { done: '2026-10-01', streak: 3, best: 5 };
checkMission(st, missionWorld, '2026-10-12', '2026-10-11');
assert.deepEqual(st.daily, { done: '2026-10-12', streak: 1, best: 5 });
for (let d = 1; d <= 60; d++) mission(`2026-01-${d}`); // terminates
assert.equal(isoDay(new Date(2026, 0, 5)), '2026-01-05');
// Bestiary: species recorded once, achievements at 10.
const st2 = emptyState();
let speciesSeen = 0;
for (let i = 0; speciesSeen < 10; i++) {
  const w = makeWorld('b' + i);
  for (const sp of w.species) {
    const res = findSpecies(st2, sp, w);
    assert.ok(res.isNew);
    assert.ok(!findSpecies(st2, sp, w).isNew, 'species counted once');
    if (++speciesSeen === 10) assert.ok(res.achievements.includes('Naturalist'));
    if (speciesSeen === 10) break;
  }
}
assert.equal(dailySeed('2026-10-12'), dailySeed('2026-10-12'));
assert.ok(sectorOf(dailySeed('2026-10-12')), 'daily world is on the map');
assert.notEqual(dailySeed('2026-10-12'), dailySeed('2026-10-13'));
// Fuel: clamps, and jumps cost more the farther they go (with wrap-around).
const f = emptyState();
assert.equal(f.fuel, 100);
f.fuel = 95; addFuel(f, 30); assert.equal(f.fuel, FUEL.max);
assert.equal(jumpCost([5, 5], [5, 5], 10000), 20);
assert.equal(jumpCost([5, 5], [6, 4], 10000), 35);
assert.equal(jumpCost([0, 0], [9999, 0], 10000), 35, 'wraps around the galaxy edge');
assert.equal(jumpCost([0, 0], [500, 500], 10000), FUEL.random);
assert.equal(jumpCost(null, [1, 1], 10000), 60);
console.log('atlas ok', ENTRIES.length, 'entries, mission', JSON.stringify(m));

// Hover cards: every drawable kind gets a title.
{
  const { describe, boxOf } = await import('./describe.js');
  const { makeWorld, chunk } = await import('./world.js');
  const known = { relic: () => false, species: () => false };
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const w = makeWorld('h' + i);
    for (const f of w.flyers) { assert.ok(describe({ type: 'flyer', ...f }, w, known).title); n++; }
    for (let L = 0; L < w.layers.length; L++) {
      const ch = chunk(w, L, 0);
      for (const t of ch.things) { const d = describe({ type: 'thing', ...t }, w, known); assert.ok(d.title && !d.title.includes('undefined'), JSON.stringify(t)); n++; }
      for (const c of ch.creatures) { const d = describe({ type: 'walker', ...c }, w, known); assert.ok(d.title && d.lines.every((l) => !l.includes('undefined')), JSON.stringify(c.kind)); n++; }
    }
  }
  const [x0, y0, x1, y1] = boxOf({ type: 'thing', kind: 'house' }, 100, 200, 10);
  assert.ok(x0 < 100 && x1 > 100 && y0 < 200 && y1 === 200);
  console.log('describe ok,', n, 'entities');
}

// Herbarium: plants are recorded once; ten make a Herbalist.
{
  const { emptyState, findPlant } = await import('./atlas.js');
  const { makeWorld, makePlant } = await import('./world.js');
  const st = emptyState(), w = makeWorld('v1-1_1_1');
  assert.deepEqual(makePlant('s', 0, 'forest'), makePlant('s', 0, 'forest'));
  let last;
  for (let i = 0; i < 10; i++) { last = findPlant(st, makePlant('w' + i, 0, 'cacti'), w); assert.ok(last.isNew); }
  assert.ok(!findPlant(st, makePlant('w0', 0, 'cacti'), w).isNew);
  assert.ok(last.achievements.includes('Herbalist'));
  for (let i = 0; i < 100; i++) { const p = makeWorld('p' + i).plants; for (const pl of p) assert.ok(/^[A-Z][a-z]+ [a-z]+$/.test(pl.name), pl.name); }
  console.log('herbarium ok:', makePlant('x', 0, 'blossoms').name);
}

// Pickups: once a day each, 3 time shards per planet per day, boosts stack per planet.
{
  const { emptyState, collect, picked, boostOn, PICKUP } = await import('./atlas.js');
  const st = emptyState(); st.fuel = 10;
  const fuel = { id: '3', kind: 'fuel' }, map = { id: '9', kind: 'map' };
  assert.ok(collect(st, 'd1', 'A', fuel, 0)); assert.equal(st.fuel, 10 + PICKUP.fuel);
  assert.ok(!collect(st, 'd1', 'A', fuel, 0), 'once a day');
  assert.ok(picked(st, 'd1', 'A', fuel) && !picked(st, 'd1', 'B', fuel));
  assert.ok(collect(st, 'd2', 'A', fuel, 0), 'back the next day');
  for (let i = 0; i < 3; i++) assert.ok(collect(st, 'd2', 'A', { id: 't' + i, kind: 'time' }, 1000));
  assert.ok(!collect(st, 'd2', 'A', { id: 't9', kind: 'time' }, 1000), 'three shards a day per planet');
  assert.ok(collect(st, 'd2', 'B', { id: 't9', kind: 'time' }, 1000), 'another planet has its own three');
  assert.ok(boostOn(st, 'B', 1000 + PICKUP.boostMs - 1) && !boostOn(st, 'A', 1000) && !boostOn(st, 'B', 1000 + PICKUP.boostMs));
  st.boost = null;
  collect(st, 'd3', 'A', { id: 'x', kind: 'time' }, 0); collect(st, 'd3', 'A', { id: 'y', kind: 'time' }, 0);
  assert.equal(st.boost.until, 2 * PICKUP.boostMs, 'shards stack on the same planet');
  assert.ok(collect(st, 'd3', 'A', map, 0) && st.halfJump);
  console.log('pickups state ok');
}
{
  // Gathering fills the bag; the home planet spends it.
  const { collect, picked, BUILDINGS, civTitle, setHome, arriveHome, canBuild, build } = await import('./atlas.js');
  const st = emptyState();
  for (let i = 0; i < 14; i++) assert.ok(collect(st, 'd', 'A', { id: i, kind: 'plant' }, 0));
  assert.ok(!collect(st, 'd', 'A', { id: 0, kind: 'plant' }, 0), 'one harvest per plant a day');
  assert.ok(picked(st, 'd', 'A', { id: 0, kind: 'plant' }) && !picked(st, 'd2', 'A', { id: 0, kind: 'plant' }), 'plants grow back');
  collect(st, 'd', 'A', { id: 'ore1', kind: 'ore', amount: 3 }, 0);
  collect(st, 'd', 'A', { id: 7, kind: 'creature', dna: 'A#0' }, 0);
  assert.deepEqual(st.bag, { plant: 14, ore: 3, creature: ['A#0'], seeds: [] });
  setHome(st, 'A');
  assert.equal(civTitle(st.home), 'Landing site');
  assert.equal(arriveHome(st), 1);
  assert.deepEqual([st.bag.creature, st.home.animals], [[], ['A#0']]);
  assert.ok(!canBuild(st, 'longhouse'), 'a stable needs 2 animals at home');
  assert.ok(build(st, 'house', 0.5) && build(st, 'windmill', 0.7));
  assert.deepEqual([st.bag.plant, st.bag.ore], [1, 1]);
  assert.ok(!build(st, 'castle', 0), 'not enough ore');
  assert.equal(st.home.built.length, 2);
  assert.equal(civTitle(st.home), 'Camp');
  console.log('home ok');
}
{
  // Buildings: gathering bonus, production while away, cheaper jumps, achievements.
  const { collect, setHome, build, produce, gatherBonus, jumpDiscount, withAchievements } = await import('./atlas.js');
  const st = emptyState();
  assert.deepEqual(withAchievements(st, () => setHome(st, 'H', 0)), ['Settler']);
  st.bag = { plant: 100, ore: 200, creature: [] }; st.home.animals = Array(10).fill('H#0');
  build(st, 'windmill', 0); build(st, 'longhouse', 0);
  assert.equal(gatherBonus(st, 'plant'), 1);
  collect(st, 'd', 'A', { id: 1, kind: 'plant' }, 0);
  collect(st, 'd', 'A', { id: 2, kind: 'creature', dna: 'A#0' }, 0);
  assert.equal(st.bag.creature.length, 2, 'a stable doubles captures');
  const plants = st.bag.plant, fuel = st.fuel = 0;
  build(st, 'temple', 0);
  assert.deepEqual(produce(st, 3 * 3.6e6), { plant: 3, ore: 0, fuel: 15, eaten: 2, starved: 0 }, 'mill 1/h, temple 5 fuel/h, 5 people eat 0.1/h each');
  assert.equal(st.bag.plant, plants - 6 + 3 - 2);
  assert.deepEqual(produce(st, 100 * 3.6e6), { plant: 26, ore: 0, fuel: 120, eaten: 12, starved: 0 }, 'at most a day, +10% from 5 workers');
  assert.equal(st.fuel, 100, 'the tank stays capped');
  for (let i = 0; i < 7; i++) st.home.built.push({ kind: 'tower' });
  assert.equal(jumpDiscount(st), 0.5);
  assert.ok(withAchievements(st, () => {}).length === 0);
  console.log('buildings ok');
}
{
  // Hunger: people eat plants from the bag; with nothing to eat some starve, and come back once fed.
  const { setHome, produce, population } = await import('./atlas.js');
  const st = emptyState();
  setHome(st, 'H', 0);
  st.home.built = Array(5).fill({ kind: 'castle' }); // 40 beds, the land feeds 6, no plants made
  st.bag.plant = 0;
  assert.equal(population(st.home), 6);
  const got = produce(st, 10 * 3.6e6);
  assert.deepEqual([got.eaten, got.starved, population(st.home)], [0, 6, 0], 'an empty bag: everyone starves');
  st.bag.plant = 100;
  produce(st, 22 * 3.6e6);
  assert.equal(population(st.home), 3, '12 hours fed: 3 of 6 came back');
  produce(st, 46 * 3.6e6);
  assert.ok(population(st.home) === 6 && !('lost' in st.home), 'fed long enough: all back');
  console.log('hunger ok');
}
{
  // Fleet: ships from stables and workshops fly to visited stars and bring loot back home.
  const { setHome, fleetSize, voyage, sendShip, shipLoot, fleetBack } = await import('./atlas.js');
  const st = emptyState();
  setHome(st, 'v1-10_10_0', 0);
  assert.equal(fleetSize(st), 0);
  assert.equal(sendShip(st, 'v1-11_10_0', 0), false, 'no ship without a stable or workshop');
  st.home.built = [{ kind: 'longhouse' }, { kind: 'factory' }, { kind: 'factory' }, { kind: 'longhouse' }];
  assert.equal(fleetSize(st), 3, 'at most 3');
  const v = voyage(st, 'v1-11_10_0');
  assert.deepEqual(v, { fuel: 35, hours: 2 });
  assert.ok(voyage(st, 'v1-15_10_0').hours > v.hours, 'farther is longer');
  st.fuel = 100;
  assert.ok(sendShip(st, 'v1-11_10_0', 0) && st.fuel === 65);
  assert.equal(sendShip(st, st.home.seed, 0), false, 'not to home');
  assert.deepEqual(fleetBack(st, 7.2e6 - 1), [], 'still away');
  const loot = shipLoot(st.fleet[0]), plants = st.bag.plant;
  const [back] = fleetBack(st, 7.2e6);
  assert.ok(back.lost || (back.plant > 0 && st.bag.plant === plants + loot.plant), 'the same voyage gives the same');
  assert.equal(st.fleet.length, 0);
  console.log('fleet ok');
}
{
  // Population: shelter limited by food; civilization level from people, buildings, variety, creatures.
  const { population, civPoints, civLevel, civTitle } = await import('./atlas.js');
  const home = (k, animals = 0) => ({ built: k.map((kind) => ({ kind })), animals: Array(animals).fill('A#0') });
  assert.equal(population(null), 0);
  assert.equal(population(home([])), 0, 'nobody lives at an empty landing site');
  assert.equal(population(home(['house'])), 4);
  assert.equal(population(home(['castle', 'castle'])), 6, 'no farms: only what the land feeds');
  assert.equal(population(home(['castle', 'castle', 'windmill'])), 16, 'a mill feeds them');
  assert.equal(civLevel(home([])), 1);
  assert.equal(civPoints(home(['house'], 1)), 4 * 5 + 5 + 10 + 3);
  // published homes carry buildings as [kind, x]
  assert.equal(civPoints({ built: [['house', 50]], animals: ['A#0'] }), civPoints(home(['house'], 1)));
  const big = home([...Array(4).fill('house'), 'windmill', 'windmill', 'castle', 'castle', 'dome', 'temple', 'factory', 'tower'], 12);
  assert.ok(civLevel(big) >= 6 && civTitle(big) === 'City', `level ${civLevel(big)}`);
  console.log('population ok');
}
{
  // Pirates: the same raids for everyone, defended by castles, towers, people and creatures.
  const { setHome, pirates, raidAt, defence, pirateThreat, repair, repairCost, population, PIRATES } = await import('./atlas.js');
  const st = emptyState(), day = 864e5;
  setHome(st, 'P', 0);
  const { sow } = await import('./atlas.js');
  assert.equal(sow(st), 0); assert.deepEqual(st.home.garden, [], 'sowing an empty bag');
  assert.deepEqual(pirates(st, 2 * day), [], 'new homes are left alone');
  st.home.built = ['castle', 'castle', 'tower', 'windmill', 'house'].map((kind, i) => ({ kind, x: i / 5 }));
  assert.equal(defence(st.home), 6 + 6 + 4 + Math.floor(population(st.home) / 5));
  // find a day with a raid; the home wins it: no damage, ore from the wreck
  let t = 4 * day;
  const raids = (from, to) => { const out = []; for (let s = Math.floor(from / PIRATES.slot); s * PIRATES.slot < to; s++) { const r = raidAt(st.home, s); if (r && r.at >= from && r.at < to) out.push(r); } return out; };
  while (!raids(t - day, t).length) t += day;
  st.home.raided = t - day;
  const ore = st.bag.ore, won = pirates(st, t);
  assert.ok(won.length && won.every((r) => r.won && r.loot) && st.bag.ore > ore, JSON.stringify(won));
  assert.ok(st.home.built.every((b) => !b.damaged));
  assert.deepEqual(raidAt(st.home, 7), raidAt(st.home, 7), 'deterministic');
  // undefended: the raid damages a building, which then counts for nothing, and a day of shield follows
  st.home.built = [{ kind: 'house', x: 0 }];
  st.home.raided = t;
  let lost = [];
  for (t += day; !lost.length; t += day) lost = pirates(st, t).filter((r) => !r.won);
  assert.equal(lost.length, 1, 'a lost raid shields the home for a day');
  assert.ok(lost[0].crew > defence({ built: [{ kind: 'house' }], animals: [] }) && lost[0].damaged === 'house');
  assert.equal(population(st.home), 0, 'a damaged hut shelters nobody');
  assert.ok(pirateThreat({ built: [], animals: [] }) < pirateThreat({ built: [{ kind: 'dome' }], animals: [] }));
  st.bag = { plant: 0, ore: 0, creature: [] };
  assert.ok(!repair(st, 0), 'repairs cost');
  st.bag.plant = repairCost('house').plant;
  assert.ok(repair(st, 0) && !st.home.built[0].damaged && population(st.home) === 4);
  console.log('pirates ok');
}
{
  // Sieges (Freenet): paid for in fuel and ore, fought by the defender like a pirate raid.
  const { setHome, besieged, siegeCrew, siegeLoot, payForSiege, SIEGE } = await import('./atlas.js');
  const st = emptyState(), day = 864e5;
  st.bag.ore = SIEGE.ore - 1;
  assert.ok(!payForSiege(st), 'not enough ore');
  st.bag.ore = SIEGE.ore;
  assert.ok(payForSiege(st) && st.bag.ore === 0 && st.fuel === 100 - SIEGE.fuel);
  assert.equal(siegeCrew(30 * 60), 15, 'one raider per 2 minutes');
  assert.ok(siegeLoot(10) > siegeLoot(2));
  assert.equal(besieged(st, 5, day, 'k'), null, 'no home, nothing to fight');
  setHome(st, 'S', 0);
  st.home.built = [{ kind: 'castle', x: 0 }];
  assert.equal(besieged(st, 50, day, 'k'), null, 'new homes are spared');
  const held = besieged(st, 3, 4 * day, 'a');
  assert.ok(held.won && held.loot > 0);
  const lost = besieged(st, 50, 4 * day, 'b');
  assert.ok(!lost.won && lost.damaged === 'castle' && st.home.built[0].damaged);
  assert.equal(besieged(st, 50, 4.5 * day, 'c'), null, 'shielded for a day');
  console.log('sieges ok');
}
{
  // Breeding: a stable, two wild species at home, plants and ore; one young per stable a day.
  const { setHome, breedAt, breedsLeft, BREED } = await import('./atlas.js');
  const { speciesOf, makeWorld, randomSeed, rng, generation, parentsOf, bredId, MAX_GEN } = await import('./world.js');
  const st = emptyState(), wilds = [];
  for (let k = 0; wilds.length < 3; k++) { const w = makeWorld(randomSeed(rng(k))); if (w.species.length) wilds.push(w.species[0].id); }
  const [a, b, c] = wilds;
  setHome(st, 'H', 0); st.home.animals = [a, b, c];
  st.bag = { plant: 100, ore: 100, creature: [] };
  assert.equal(breedAt(st, a, b, 'd1'), null, 'no stable');
  st.home.built = [{ kind: 'longhouse', x: 0 }];
  assert.equal(breedAt(st, a, a, 'd1'), null, 'two different species');
  const young = breedAt(st, b, a, 'd1');
  assert.equal(young, [a, b].sort().join('+'));
  assert.deepEqual([st.bag.plant, st.bag.ore], [100 - BREED.plant, 100 - BREED.ore]);
  assert.equal(breedsLeft(st, 'd1'), 0);
  assert.equal(breedAt(st, a, c, 'd1'), null, 'one a day per stable');
  const second = breedAt(st, young, c, 'd2');
  assert.equal(second, bredId(young, c), 'the young breed too');
  assert.equal(generation(second), 2);
  st.home.built.push({ kind: 'longhouse', x: 1 });
  const third = breedAt(st, second, young, 'd3');
  assert.equal(generation(third), 3);
  assert.equal(breedAt(st, third, a, 'd3'), null, `at most ${MAX_GEN} generations`);
  assert.ok(speciesOf(third)?.bred, 'a third-generation young resolves');
  const sp = speciesOf(young), again = speciesOf(bredId(b, a));
  assert.ok(sp.bred && sp.name && sp.legs && sp.id === young);
  assert.deepEqual({ ...again, id: sp.id }, sp, 'the same parents, the same young');
  assert.equal(speciesOf(`${young}+${c}`), null, 'a bred parent goes in parentheses');
  assert.equal(parentsOf(`${b}+${a}`), a < b ? null : [b, a], 'only the sorted spelling');
  assert.deepEqual(parentsOf(bredId(young, c)), [young, c].sort());
  for (const bad of ['', 'x', 'v1-1_1_1', '(v1-1_1_1#0)', `${a}+`, `(${a}+${b}`, `${a}+${b}+${c}`]) assert.equal(generation(bad), -1, bad);
  console.log('breeding ok');
}
{
  // Crossing: a mill, two wild plants in the garden; one hybrid per mill a day, never the same twice.
  const { setHome, crossAt, crossesLeft, CROSS } = await import('./atlas.js');
  const { plantOf, makeWorld, randomSeed, rng } = await import('./world.js');
  const st = emptyState(), wilds = [];
  for (let k = 0; wilds.length < 3; k++) { const w = makeWorld(randomSeed(rng(k))); if (w.plants.length) wilds.push(w.plants[0].id); }
  const [a, b, c] = wilds;
  setHome(st, 'H', 0); st.home.garden = [a, b, c];
  st.bag = { plant: 100, ore: 100, creature: [] };
  assert.equal(crossAt(st, a, b, 'd1'), null, 'no mill');
  st.home.built = [{ kind: 'windmill', x: 0 }];
  assert.equal(crossAt(st, a, a, 'd1'), null, 'two different plants');
  const hy = crossAt(st, b, a, 'd1');
  assert.equal(hy, [a, b].sort().join('+'));
  assert.ok(st.home.garden.includes(hy));
  assert.deepEqual([st.bag.plant, st.bag.ore], [100 - CROSS.plant, 100 - CROSS.ore]);
  assert.equal(crossesLeft(st, 'd1'), 0);
  assert.equal(crossAt(st, a, c, 'd1'), null, 'one a day per mill');
  assert.equal(crossAt(st, a, b, 'd2'), null, 'already grown');
  assert.equal(crossAt(st, hy, c, 'd2'), null, 'only wild plants cross');
  const pl = plantOf(hy);
  assert.ok(pl.crossed && /^[A-Z][a-z]+ [a-z]+$/.test(pl.name) && pl.id === hy);
  assert.deepEqual(plantOf([b, a].join('+')), plantOf(hy), 'the same parents, the same hybrid');
  assert.equal(plantOf(`${hy}+${c}`), null);
  console.log('crossing ok');
}
{
  // Fusing: two working buildings of different kinds become one that is both.
  const { setHome, fuse, FUSE, population, defence, civPoints, partsOf, buildingName, repairCost } = await import('./atlas.js');
  const st = emptyState();
  setHome(st, 'H', 0); st.bag = { plant: 100, ore: 100, creature: [] };
  st.home.built = [{ kind: 'house', x: 0 }, { kind: 'castle', x: 1 }, { kind: 'house', x: 2 }];
  const pop = population(st.home), def = defence(st.home), pts = civPoints(st.home);
  assert.ok(!fuse(st, 0, 2), 'different kinds');
  assert.ok(!fuse(st, 0, 0));
  assert.ok(fuse(st, 1, 0));
  assert.equal(st.home.built.length, 2);
  assert.deepEqual(partsOf(st.home.built[0]), ['castle', 'house']);
  assert.equal(buildingName(st.home.built[0]), 'Castle-Hut');
  assert.deepEqual([population(st.home), defence(st.home), civPoints(st.home)], [pop, def, pts + 10], 'does what both did, a new kind');
  assert.deepEqual([st.bag.plant, st.bag.ore], [100 - FUSE.plant, 100 - FUSE.ore]);
  assert.ok(!fuse(st, 0, 1), 'a fused building fuses no more');
  assert.deepEqual(repairCost(st.home.built[0]), { plant: repairCost('castle').plant + repairCost('house').plant, ore: repairCost('castle').ore });
  console.log('fusing ok');
}
{
  const { setHome, build, moveCost, moveHome, loseHome, evacuate } = await import('./atlas.js');
  const st = emptyState();
  setHome(st, 'A'); st.bag = { plant: 20, ore: 10, creature: ['x', 'y', 'z'] };
  build(st, 'house', 0); build(st, 'house', 0); // 10 plants spent
  assert.deepEqual(moveCost(st), { plant: 6, ore: 6 });
  assert.ok(moveHome(st, 'B') && st.home.seed === 'B' && st.home.built.length === 2);
  assert.deepEqual([st.bag.plant, st.bag.ore], [4, 4]);
  assert.ok(!moveHome(st, 'C'), 'not enough to move again');
  st.home.animals = ['a', 'b'];
  assert.equal(loseHome(st).built.length, 2);
  assert.equal(st.home, null);
  assert.deepEqual(st.ruins.map((r) => [r.seed, r.built.length]), [['B', 2]], 'its ruins are remembered');
  assert.deepEqual(st.bag.creature, ['x', 'y', 'z', 'a', 'b'], 'creatures escape');
  evacuate(st);
  assert.deepEqual(st.bag, { plant: 2, ore: 2, creature: ['x', 'y'] });
  // gravity on a dying world: building costs more
  const { costOf } = await import('./atlas.js');
  assert.deepEqual([costOf('windmill', 1).plant, costOf('windmill', 2).plant, costOf('windmill', 1.5).ore], [8, 16, 3]);
  const s2 = emptyState(); setHome(s2, 'A'); s2.bag = { plant: 9, ore: 9, creature: [] };
  assert.ok(!build(s2, 'house', 0, 2), 'a hut needs 10 plants at gravity 2');
  assert.ok(build(s2, 'house', 0, 1.5) && s2.bag.plant === 1);
  // seeds: one per species, sown at home
  const { collect: col, sow } = await import('./atlas.js');
  const s3 = emptyState(); setHome(s3, 'H');
  col(s3, 'd', 'A', { id: 1, kind: 'plant', species: 'A~0' }, 0); col(s3, 'd', 'A', { id: 2, kind: 'plant', species: 'A~0' }, 0); col(s3, 'd', 'A', { id: 3, kind: 'plant', species: 'A~1' }, 0);
  assert.deepEqual(s3.bag.seeds, ['A~0', 'A~1']);
  assert.equal(sow(s3), 2); assert.deepEqual([s3.home.garden, s3.bag.seeds], [['A~0', 'A~1'], []]);
  col(s3, 'd2', 'A', { id: 1, kind: 'plant', species: 'A~0' }, 0);
  assert.deepEqual(s3.bag.seeds, [], 'already in the garden');
  console.log('exodus ok');
}
{
  const { trade } = await import('./atlas.js');
  const st = emptyState(); st.bag = { plant: 20, ore: 5, creature: [] }; st.fuel = 10;
  assert.ok(trade(st, { give: { plant: 10 }, get: { ore: 4 } }) && st.bag.plant === 10 && st.bag.ore === 9);
  assert.ok(trade(st, { give: { ore: 8 }, get: { fuel: 30 } }) && st.fuel === 40);
  assert.ok(!trade(st, { give: { plant: 11 }, get: { ore: 1 } }), 'not enough plants');
  assert.ok(!trade(st, { give: { plant: 1 }, get: { creature: 1 } }), 'no creature to give');
  assert.ok(trade(st, { give: { plant: 1 }, get: { creature: 1 } }, 'v1-1_1_1#0') && st.bag.creature[0] === 'v1-1_1_1#0');
  console.log('trade ok');
}

// Expedition: same stages for everyone in a season, done in order, a badge at the end.
{
  const { expedition, checkExpedition, learn, EXPEDITION, SEASON, emptyState: es, ACHIEVEMENTS: A } = await import('./atlas.js');
  const { EPOCH, CONCEPTS } = await import('./world.js');
  const t = EPOCH + 3 * SEASON + 1000, ex = expedition(t);
  assert.equal(ex.id, 3);
  assert.deepEqual(ex, expedition(t + SEASON - 2000), 'same season, same stages');
  assert.notDeepEqual(ex.stages, expedition(t + SEASON).stages);
  assert.equal(ex.stages.length, EXPEDITION.stages);
  const s = es(), fake = (g) => ({ traits: Object.fromEntries(g) });
  assert.equal(checkExpedition(s, fake(ex.stages[1]), t), null, 'stage 2 before stage 1 does not count');
  for (let i = 0; i < ex.stages.length; i++) assert.deepEqual(checkExpedition(s, fake(ex.stages[i]), t), { stage: i + 1, done: i === ex.stages.length - 1 });
  assert.deepEqual(s.expeditions, [4]);
  assert.equal(checkExpedition(s, fake(ex.stages[0]), t), null, 'nothing left this season');
  assert.ok(A.find(([n]) => n === 'Pathfinder')[2](s));
  // Battles: stats from parts, rounds until someone falls, the same blows for the same seed.
  const { startBattle, battleRound, foeStats, BATTLE, battleLevel, winBattle, battleParty } = await import('./atlas.js');
  const { foesNear, makeWorld: mkw } = await import('./world.js');
  const sp = { name: 'Test', scale: 1, tail: 'short', extra: 'horns', head: 'round', legs: 4, pace: 1, neck: 'none' };
  assert.deepEqual(foeStats(sp, 1, false), { hp: 18, atk: 7, spd: 6 });
  assert.deepEqual(foeStats(sp), { hp: 29, atk: 13, spd: 6 }, 'a wild one is tougher');
  assert.ok(foeStats({ ...sp, scale: 2.6 }).hp > foeStats(sp).hp, 'bigger lives longer');
  const run = (seed, allies = [], lv = 1, act = 'attack', foe = sp) => { const b = startBattle(foe, seed, allies, lv), log = [];
    for (let i = 0; i < 50 && b.hp > 0 && b.team[0].hp > 0; i++) log.push(...battleRound(b, act)); return { b, log }; };
  const a = run(7);
  assert.ok(a.b.hp <= 0 || a.b.team[0].hp <= 0, 'the battle ends');
  assert.ok(a.log[0].startsWith('Test hits'), 'the faster strikes first');
  assert.deepEqual(run(7).log, a.log);
  assert.equal(startBattle(sp, 1).team[0].hp, BATTLE.hp);
  assert.ok(startBattle(sp, 1, [], 3).team[0].hp > BATTLE.hp, 'levels add life');
  assert.equal(run(7, [], 1, 'special').log.filter((l) => l.startsWith('Your special')).length, 1, 'the special move once a battle');
  assert.ok(run(7, [sp, sp]).log.some((l) => l.startsWith('Test hits Test')), 'allies strike and get hit');
  const big = { ...sp, scale: 1.3 }, won = (allies) => { let n = 0; for (let s = 0; s < 200; s++) n += run(s, allies, 1, 'attack', big).b.hp <= 0; return n; };
  assert.ok(won([sp]) > won([]), 'allies help');
  assert.ok(foeStats(sp, 3).hp > foeStats(sp).hp && foeStats(sp, 3).atk > foeStats(sp).atk, 'higher levels are stronger');
  assert.equal(startBattle(sp, 1, [], 1, 3).max, foeStats(sp, 3).hp);
  const h = startBattle(sp, 3); h.team[0].hp = 10;
  assert.ok(battleRound(h, 'heal')[0].startsWith('You eat') && h.hp === h.max, 'healing replaces your blow');
  const { canCapture } = await import('./atlas.js');
  const c0 = startBattle(sp, 3); battleRound(c0, 'capture');
  assert.ok(!c0.caught, 'no capture at full life');
  let caught = 0;
  for (let s = 0; s < 100; s++) { const c = startBattle(sp, s); c.hp = 2; assert.ok(canCapture(c)); battleRound(c, 'capture'); caught += c.caught; }
  assert.ok(caught > 40 && caught < 80, 'capture works about 60% of the time');
  const { ELEMENTS, elementOf, edge } = await import('./atlas.js');
  assert.equal(edge('fire', 'wild'), 1.5); assert.equal(edge('wild', 'fire'), 0.75); assert.equal(edge('fire', 'wind'), 1); assert.equal(edge(null, 'fire'), 1);
  assert.ok(Object.values(ELEMENTS).every(([, beats]) => Object.values(ELEMENTS).filter(([, b]) => b === beats).length === 1), 'a cycle: each element beaten by exactly one');
  { const w = [...Array(80)].map((_, i) => mkw(`v1-${i}_6_1`)).find((x) => x.species.length && x.culture === 'nordic');
    assert.equal(elementOf(w.species[0]), 'frost');
    assert.equal(elementOf({ ...w.species[0], id: `(${w.species[0].id}+v1-1_1_1#0)+v1-2_2_2#1` }), 'frost', 'bred: the first wild ancestor');
    assert.equal(elementOf(sp), null);
    const strong = startBattle(sp, 1, [sp]); strong.element = 'wild'; strong.team[1].element = 'fire';
    assert.ok(battleRound(strong).some((l) => l.endsWith('(strong)')), 'an element advantage shows in the log'); }
  { // creatures grow with the battles they fight, and the party follows the foe's element
    const { creatureLevel } = await import('./atlas.js');
    const ws = [...Array(60)].map((_, i) => mkw(`v1-${i}_6_3`)).filter((x) => x.species.some((s) => s.legs)), ids = ws.flatMap((x) => x.species.filter((s) => s.legs).map((s) => s.id));
    const st3 = es(); st3.home = { animals: ids.slice(0, 12) }; st3.bag.ore = 0;
    const party = battleParty(st3, null);
    assert.ok(party.length === 3 && party.every((p) => p.level === 1));
    const b3 = startBattle(sp, 1, party); b3.hp = 0; winBattle(st3, b3);
    assert.ok(party.every((p) => st3.xp[p.id] === 1) && creatureLevel(st3, party[0].id) === 2, 'the first win is a level');
    st3.xp[party[0].id] = 9;
    assert.equal(creatureLevel(st3, party[0].id), 4);
    assert.ok(startBattle(sp, 1, battleParty(st3, null)).team.find((f) => f.id === party[0].id).hp > startBattle(sp, 1, party).team.find((f) => f.id === party[0].id).hp, 'levels add life');
    const st4 = es(); st4.home = { animals: ids.slice(0, 40) };
    const picks = ['fire', 'wild', 'wind', 'frost'].map((e) => battleParty(st4, e).map((p) => p.id).join());
    assert.ok(new Set(picks).size > 1, 'the party depends on the foe');
  }
  { // every third round the wild creature gathers its strength, then hits twice as hard; guarding halves the damage
    const c = startBattle(sp, 5), turns = [];
    for (let i = 0; i < 6; i++) { const charging = c.charge; turns.push([charging, battleRound(c, 'attack').join(' ')]); }
    assert.deepEqual(turns.map(([ch]) => ch), [false, false, true, false, false, true], 'the charge comes every third round');
    assert.ok(turns[1][1].includes('gathering') && turns[2][1].includes('heavy blow') && !turns[3][1].includes('heavy'));
    const dmg = (act) => { let total = 0; for (let s = 0; s < 200; s++) { const g = startBattle(sp, s, [], 1, 1); g.round = 2; g.charge = true; const before = g.team[0].hp; battleRound(g, act); total += before - g.team[0].hp; } return total; };
    assert.ok(dmg('guard') < dmg('attack') * 0.6, 'guarding a heavy blow takes much less');
    const elites = [...Array(40)].flatMap((_, i) => foesNear(mkw(`v1-${i}_4_1`), '2026-10-14', -12, 12)), el = elites.filter((f) => f.elite).length / elites.length;
    assert.ok(el > 0.1 && el < 0.3, `about one in five is elite (${el.toFixed(2)})`);
  }
  { // jumping: obstacles stop a walker that stays on the ground; a leap clears them; auto-walk leaps by itself on any gravity
    const { walkBy, settle, startJump, jumpStep, canJump, shouldLeap, JUMP } = await import('./atlas.js');
    const { obstaclesNear } = await import('./world.js');
    const o = [{ x: 1, w: 0.007, h: 0.3 }];
    let gx = 0.5; for (let k = 0; k < 200; k++) gx += walkBy(gx, 0, 0.01, o);
    assert.ok(Math.abs(gx - (1 - 0.007 - JUMP.reach)) < 1e-9, 'stopped at the edge');
    assert.ok(Math.abs(walkBy(0.98, 0.5, 0.05, o) - 0.05) < 1e-9, 'higher than it: free');
    assert.ok(settle(1.005, 0.1, o) !== 1.005 && settle(1.005, 0.5, o) === 1.005, 'landing on it steps off; flying over it does not');
    const j = { y: 0, vy: 0 }; startJump(j); let apex = 0; for (let k = 0; k < 120; k++) { jumpStep(j, 1 / 60, 1); apex = Math.max(apex, j.y); }
    assert.ok(canJump(j) && apex > 1.3 && apex < 1.5, `a jump rises about one and a half explorers (${apex.toFixed(2)})`);
    const heavy = { y: 0, vy: 0 }; startJump(heavy); let low = 0; for (let k = 0; k < 120; k++) { jumpStep(heavy, 1 / 60, 2); low = Math.max(low, heavy.y); }
    assert.ok(low < apex && low > 0.6, 'lower on a heavy world, but still over the tallest obstacle');
    const w0 = mkw('v1-3_4_1'), obs = obstaclesNear(w0, -3, 12);
    assert.deepEqual(obs, obstaclesNear(w0, -3, 12));
    assert.ok(obs.length > 4 && obs.every((x) => Math.abs(x.x - 0.5) >= 0.1 && x.h >= 0.4 && x.h <= 0.58 && x.w >= 0.006 && x.w <= 0.011), 'none at the arrival spot, all clearable');
    for (const grav of [1, 1.5, 2]) for (let i = 0; i < 12; i++) { // an auto-walk over ten screens
      const all = obstaclesNear(mkw(`v1-${i}_4_1`), -3, 12), air = 0.05 * JUMP.boost, jj = { y: 0, vy: 0 };
      let at = 0.5;
      for (let t = 0; t < 600 && at < 11; t += 1 / 60) {
        const near = all.filter((q) => Math.abs(q.x - at) < 1);
        if (canJump(jj) && shouldLeap(at, 1, near, 0.12 * air)) startJump(jj);
        jumpStep(jj, 1 / 60, grav);
        at = settle(at + walkBy(at, jj.y, (jj.y > 0 ? air : 0.05 / grav) / 60, near), jj.y, near);
      }
      assert.ok(at >= 11, `auto-walk gets through world ${i} at gravity ×${grav} (stopped at ${at.toFixed(2)})`);
    }
  }
  { // rooms: buildings to walk into, and the chest inside
    const { foreStructsNear } = await import('./world.js'), { chestLoot, collect } = await import('./atlas.js');
    const ws = [...Array(80)].map((_, i) => mkw(`v1-${i}_5_1`)), all = ws.flatMap((x) => foreStructsNear(x, -4, 8));
    assert.deepEqual(foreStructsNear(ws[3], -4, 8), foreStructsNear(ws[3], -4, 8));
    assert.ok(all.length > 40 && all.every((b) => Math.floor(b.x) !== 0 && b.size >= 0.13 && b.size <= 0.17), 'a few per world, never at the arrival spot');
    assert.ok(ws.filter((x) => x.civ === 'uninhabited').every((x) => !foreStructsNear(x, -4, 8).length), 'nobody lives there, no rooms');
    assert.ok(all.every((b) => !['obelisk', 'block', 'antenna', 'arch', 'spire', 'orb', 'pods'].includes(b.kind)), 'only buildings with a room');
    assert.deepEqual(chestLoot('v1-1_1_1', 'fore2', '2026-10-14'), chestLoot('v1-1_1_1', 'fore2', '2026-10-14'));
    const kinds = new Set(Array.from({ length: 200 }, (_, i) => Object.keys(chestLoot('v1-1_1_1', 'fore2', `d${i}`))[0]));
    assert.deepEqual([...kinds].sort(), ['fuel', 'ore', 'plant'], 'fuel, plants or ore');
    const c = es(), chest = { id: 'fore2', kind: 'chest' }, loot = chestLoot('v1-1_1_1', 'fore2', 'x'), before = { ore: c.bag.ore, plant: c.bag.plant, fuel: (c.fuel = 50) };
    assert.ok(collect(c, 'x', 'v1-1_1_1', chest, 0) && !collect(c, 'x', 'v1-1_1_1', chest, 0), 'once a day');
    assert.equal(c.bag.ore - before.ore, loot.ore ?? 0); assert.equal(c.bag.plant - before.plant, loot.plant ?? 0); assert.equal(c.fuel - 50, loot.fuel ?? 0);
  }
  const st2 = es(); st2.bag.ore = 0;
  assert.ok(winBattle(st2, a.b) > 0 && st2.bag.ore > 0 && st2.wins === 1 && battleLevel(st2) === 2);
  const fw = [...Array(50)].map((_, i) => mkw(`v1-${i}_4_1`)).find((x) => x.species.length), foes = foesNear(fw, '2026-10-14', -6, 6);
  assert.deepEqual(foes, foesNear(fw, '2026-10-14', -6, 6));
  assert.ok(foes.length && foes.every((f) => Math.floor(f.x) !== 0 && fw.species.includes(f.dna) && f.level === 1 + Math.floor(Math.abs(Math.floor(f.x)) / 4) + (f.elite ? 2 : 0)));
  st2.home = { animals: fw.species.map((s) => s.id).concat(fw.species.map((s) => s.id)) };
  assert.ok(battleParty(st2).length <= BATTLE.party && battleParty(st2).every((s) => s.legs));
  // Ilen's diary: a world's page once, pages in order, Reader at the end.
  const { collect, hasPage } = await import('./atlas.js');
  const { PAGES } = await import('./diary.js');
  const { pageNear, makeWorld: mw } = await import('./world.js');
  const d = es(), pg = { id: 'page', kind: 'page' };
  assert.ok(collect(d, 'x', 'v1-1_1_1', pg) && !collect(d, 'y', 'v1-1_1_1', pg), 'one page per world, whatever the day');
  for (let i = 0; i < PAGES.length; i++) collect(d, 'x', `v1-9_9_${i}`, pg);
  assert.equal(d.diary.length, PAGES.length);
  assert.ok(hasPage(d, 'v1-5_5_5'), 'no pages left after the last one');
  assert.ok(A.find(([n]) => n === 'Reader')[2](d));
  const withPage = Array.from({ length: 400 }, (_, i) => pageNear(mw(`v1-${i}_3_1`), -4, 4)).filter((p) => p.length);
  assert.ok(withPage.length > 105 && withPage.length < 165, 'about one world in three');
  assert.deepEqual(pageNear(mw('v1-7_3_1'), -4, 4), pageNear(mw('v1-7_3_1'), -4, 4));
  assert.ok(withPage.every(([p]) => Math.abs(p.x) >= 1 && Math.abs(p.x) <= 3));
  // Languages: words per language, capped; uninhabited worlds teach nothing.
  const l = es();
  assert.equal(learn(l, { civ: 'uninhabited', culture: 'nordic' }, 1), 0);
  assert.equal(learn(l, { civ: 'humans', culture: 'nordic' }, 2), 2);
  assert.equal(learn(l, { civ: 'aliens', culture: 'nordic' }, 1), 1);
  assert.deepEqual(l.words, { nordic: 2, alien: 1 });
  learn(l, { civ: 'ruins', culture: 'nordic' }, 99);
  assert.equal(l.words.nordic, CONCEPTS.length);
  assert.ok(A.find(([n]) => n === 'Polyglot')[2](l));
}
