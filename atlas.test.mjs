import assert from 'node:assert/strict';
import { makeWorld, sectorOf } from './world.js';
import { ENTRIES, COMBOS, emptyState, visit, findRelic, findSpecies, dailySeed, mission, matches, checkMission, isoDay } from './atlas.js';

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
console.log('atlas ok', ENTRIES.length, 'entries, mission', JSON.stringify(m));
