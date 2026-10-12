import assert from 'node:assert/strict';
import { makeWorld, chunk, height, walkerAt, starsIn, sectorOf, randomSeed, regionAt, makeSpecies, GALAXY } from './world.js';

const a = makeWorld('abc123'), b = makeWorld('abc123'), c = makeWorld('abc124');
assert.deepEqual(a, b, 'same seed must give same world');
assert.notDeepEqual(a, c, 'different seed should differ');

// Terrain: bounded, continuous, defined far away and at negative x.
for (const L of a.layers) for (const x of [-1e4, -3.3, 0, 0.5, 7, 1e4]) {
  const h = height(L, x);
  assert.ok(h >= 0 && h <= 1, `height ${h}`);
  assert.ok(Math.abs(height(L, x + 1e-5) - h) < 1e-3, 'terrain is continuous');
}

let things = 0, relics = 0, walkers = 0;
for (let i = 0; i < 300; i++) {
  const w = makeWorld('s' + i);
  for (const f of w.flyers) assert.ok(f.kind && f.size > 0);
  for (let L = 0; L < w.layers.length; L++) for (const c of [-2, 0, 5]) {
    const ch = chunk(w, L, c);
    assert.deepEqual(ch, chunk(w, L, c), 'chunks are deterministic');
    for (const t of ch.things) { assert.ok(t.kind && t.x >= c && t.x < c + 1, JSON.stringify(t)); things++; relics += !!t.relic; }
    for (const cr of ch.creatures) {
      walkers++;
      for (const t of [0, 1e5, 1e8]) {
        const [x, dir] = walkerAt(cr, t);
        assert.ok(x >= cr.x - 1e-9 && x <= cr.x + cr.range + 1e-9 && Math.abs(dir) === 1);
      }
    }
  }
  assert.ok(w.music.lead && w.music.drone && w.music.scale);
}
assert.ok(things && relics && walkers, `${things} ${relics} ${walkers}`);
// Galaxy: stars are stable, seeds parse back to their sector, regions bias worlds.
assert.deepEqual(starsIn(12, 34), starsIn(12, 34));
for (const st of starsIn(12, 34)) assert.deepEqual(sectorOf(st.seed), [12, 34]);
for (let i = 0; i < 200; i++) { const s = randomSeed(); const [x, y] = sectorOf(s); assert.ok(x >= 0 && x < GALAXY && y >= 0 && y < GALAXY && starsIn(x, y).some((st) => st.seed === s)); }
assert.equal(sectorOf('v1-abc'), null);
let alien = null;
for (let x = 0; !alien; x += 4) if (regionAt(x, 0)[0] === 'Alien Nebula') alien = x;
const aliens = starsIn(alien, 0).concat(starsIn(alien + 1, 0), starsIn(alien, 1)).filter((st) => makeWorld(st.seed).civ === 'aliens').length;
assert.ok(aliens >= 5, `alien nebula should be full of aliens, got ${aliens}`);
// Species: deterministic, valid parts.
assert.deepEqual(makeSpecies('w', 0, false), makeSpecies('w', 0, false));
for (let i = 0; i < 500; i++) { const sp = makeSpecies('w' + i, 0, i % 2); assert.ok([2, 4, 6].includes(sp.legs) && sp.name && sp.rarity); }
console.log('ok', a.name, '/', c.name, '—', things, 'things,', relics, 'relics,', walkers, 'walkers');
