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
