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
