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
assert.deepEqual(starsIn(12, 34, 1.8e12), starsIn(12, 34, 1.8e12));
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

// Colonists: the same species for one explorer everywhere, different explorers differ, more time = more.
{
  const { colonists } = await import('./world.js');
  const a = colonists('aa'.repeat(32), 'v1-1_1_1', 5, 4), b = colonists('aa'.repeat(32), 'v1-2_2_2', 5, 600);
  assert.deepEqual(a[0].dna, b[0].dna, 'one people per explorer');
  assert.notDeepEqual(colonists('bb'.repeat(32), 'v1-1_1_1', 5, 4)[0].dna, a[0].dna);
  assert.deepEqual(a, colonists('aa'.repeat(32), 'v1-1_1_1', 5, 4));
  assert.ok(a.length >= 2 && b.length > a.length && b.length <= 8);
  for (const c of b) { const [x] = walkerAt(c, 1e6); assert.ok(x >= c.x && x <= c.x + c.range); }
  console.log('colonists ok:', a[0].dna.name, a.length, '→', b.length);
}

// Every relief shape stays in [0, 1] and continuous (no cliffs drawn as gaps), far and at negative x.
{
  const { riversNear, islandsNear } = await import('./world.js');
  const shapes = new Set();
  for (let i = 0; i < 150; i++) {
    const w = makeWorld('r' + i);
    for (const L of w.layers) {
      shapes.add(L.shape);
      for (let x = -3; x < 3; x += 0.0137) {
        const h = height(L, x);
        assert.ok(h >= 0 && h <= 1, `${L.shape} ${h}`);
        assert.ok(Math.abs(height(L, x + 1e-6) - h) < 1e-2, `${L.shape} jumps at ${x}`);
      }
    }
    for (const r of riversNear(w, -2, 3)) assert.ok(r.width > 0 && Number.isFinite(r.x));
    for (const s of islandsNear(w, -2, 3)) assert.ok(s.size > 0 && s.y > 0 && s.y < 1);
  }
  assert.deepEqual([...shapes].sort(), ['dunes', 'mesas', 'peaks', 'rolling', 'spires']);
  console.log('relief ok:', [...shapes].join(', '));
}

// Pickups: deterministic per day, new each day, denser away from the start, no time shards offline.
{
  const { pickupsNear } = await import('./world.js');
  const w = makeWorld('v1-3_3_3');
  assert.deepEqual(pickupsNear(w, '2026-10-13', -5, 5, true), pickupsNear(w, '2026-10-13', -5, 5, true));
  assert.notDeepEqual(pickupsNear(w, '2026-10-13', -50, 50, true), pickupsNear(w, '2026-10-14', -50, 50, true));
  let near = 0, far = 0, time = 0, kinds = new Set();
  for (let i = 0; i < 200; i++) {
    const v = makeWorld('pk' + i);
    near += pickupsNear(v, 'd', 0, 0, false).filter((p) => Math.abs(Math.floor(p.x)) <= 1).length;
    far += pickupsNear(v, 'd', 20, 20, false).filter((p) => Math.floor(p.x) >= 19 && Math.floor(p.x) <= 21).length;
    for (const p of pickupsNear(v, 'd', -10, 10, false)) { kinds.add(p.kind); assert.ok(p.kind !== 'time'); }
    time += pickupsNear(v, 'd', -10, 10, true).filter((p) => p.kind === 'time').length;
  }
  assert.ok(far > near * 2, `${far} vs ${near}`);
  assert.ok(time > 0 && kinds.has('fuel') && kinds.has('map'));
  console.log('pickups ok:', near, 'near the start vs', far, 'far away;', time, 'time shards');
}
{
  const { depositsNear } = await import('./world.js');
  const w = makeWorld('v1-3_3_3');
  assert.deepEqual(depositsNear(w, -5, 5), depositsNear(w, -5, 5));
  const all = depositsNear(w, -50, 50);
  assert.ok(all.length > 20 && all.every((d) => d.amount >= 1 && d.amount <= 3 && d.kind === 'ore'));
  assert.equal(new Set(all.map((d) => d.id)).size, all.length, 'deposit ids are unique');
  console.log('deposits ok:', all.length);
}
{
  const { lifeOf, ageOf, instability, starsIn, sectorOf, EPOCH, DAY } = await import('./world.js');
  const t0 = EPOCH + 12 * DAY;
  const a = lifeOf(5, 7, 2, t0);
  assert.ok(a.age >= 0 && a.age < 100 && a.collapse > t0);
  // just before and after the collapse: same star, next world
  const before = lifeOf(5, 7, 2, a.collapse - 1), after = lifeOf(5, 7, 2, a.collapse + 1);
  assert.equal(before.seed, a.seed);
  assert.equal(after.gen, a.gen + 1);
  assert.ok(after.age < 1 && before.age > 99);
  assert.ok(ageOf(a.seed, a.collapse + 1).dead && ageOf(a.seed, a.collapse + 1).next === after.seed);
  assert.ok(!ageOf(a.seed, t0).dead);
  assert.equal(ageOf('my-own-world', t0), null, 'custom seeds never age');
  assert.deepEqual(sectorOf('v1-5_7_2.3'), [5, 7]);
  assert.equal(sectorOf('v1-5_7_2.0'), null, 'generation 0 has no suffix');
  assert.notEqual(makeWorld('v1-5_7_2').name, makeWorld('v1-5_7_2.1').name, 'a reborn star makes a new world');
  assert.ok(starsIn(5, 7, t0).every((s) => !ageOf(s.seed, t0).dead));
  assert.deepEqual([instability(50), instability(85), instability(100)], [0, 0.5, 1]);
  // lifespans 30-120 days
  for (let i = 0; i < 50; i++) { const l = lifeOf(i, 1, 0, t0), n = lifeOf(i, 1, 0, l.collapse + 1); assert.ok(n.collapse - l.collapse >= 30 * DAY - 1 && n.collapse - l.collapse <= 120 * DAY + 1); }
  console.log('life ok:', a.seed, a.age.toFixed(1));
}
{
  const { eventAt, meteoritesNear, migrants, deals, EVENT_SLOT, EPOCH } = await import('./world.js');
  const kinds = {}, t0 = EPOCH + 20 * 864e5;
  for (let i = 0; i < 300; i++) {
    const w = makeWorld(`v1-${i}_${i}_1`);
    for (let h = 0; h < 48; h++) {
      const now = t0 + h * 3600e3, ev = eventAt(w, now);
      assert.deepEqual(ev, eventAt(w, now), 'the same for everyone');
      if (!ev) continue;
      kinds[ev.kind] = (kinds[ev.kind] ?? 0) + 1;
      assert.ok(now >= ev.start && now < ev.end && ev.end - ev.start <= 2 * 3600e3);
      if (ev.kind === 'meteors') assert.ok(meteoritesNear(w, ev, -3, 3).every((m) => m.amount >= 4 && m.id.startsWith('met')));
      if (ev.kind === 'migration') { const m = migrants(ev); assert.ok(m.length >= 8 && m.every((c) => c.dna.id.startsWith(ev.from + '#'))); }
      if (ev.kind === 'trader') assert.equal(deals(w, ev).length, 3);
    }
  }
  assert.ok(kinds.meteors && kinds.migration && kinds.trader, JSON.stringify(kinds));
  assert.equal(eventAt(makeWorld('custom'), t0 + EVENT_SLOT)?.kind === 'migration', false, 'off-map worlds get no migrants');
  console.log('events ok:', JSON.stringify(kinds));
}
{
  const { prevSeed, heritage, ruinsNear, survivors } = await import('./world.js');
  assert.equal(prevSeed('v1-1_2_3'), null);
  assert.equal(prevSeed('v1-1_2_3.1'), 'v1-1_2_3');
  assert.equal(prevSeed('v1-1_2_3.7'), 'v1-1_2_3.6');
  let ruins = 0, surv = 0;
  for (let i = 0; i < 100; i++) {
    const w = makeWorld(`v1-${i}_4_2.3`), her = heritage(w);
    assert.equal(her.seed, `v1-${i}_4_2.2`);
    const rs = ruinsNear(w, her, 0, 5);
    assert.deepEqual(rs, ruinsNear(w, her, 0, 5));
    ruins += rs.length; assert.ok(rs.every((x) => x.broken && her.structs.includes(x.kind)));
    const sv = survivors(w, her); surv += sv.length;
    assert.ok(sv.every((c) => c.dna.id.startsWith(her.seed + '#')), 'survivors keep their species id');
  }
  assert.ok(ruins > 50 && surv > 50, `${ruins} ${surv}`);
  assert.equal(heritage(makeWorld('v1-1_2_3')), null, 'first worlds have no past');
  console.log('heritage ok:', ruins, 'ruins,', surv, 'survivors');
}

// Chronicle: newest world first, back to the star's first one, each born when the previous collapsed.
{
  const { chronicle, lexicon, inscription, languageOf, CONCEPTS } = await import('./world.js');
  const ch = chronicle('v1-5_5_1.3');
  assert.deepEqual(ch.map((c) => c.gen), [3, 2, 1, 0]);
  for (let k = 1; k < ch.length; k++) assert.equal(ch[k].collapse, ch[k - 1].born);
  assert.ok(ch.every((c) => c.story.includes(c.name)));
  assert.equal(chronicle('abc123').length, 0, 'off the map: no chronicle');
  assert.equal(chronicle('v1-5_5_1.20').length, 8, 'capped');
  // Languages: one per culture plus the aliens, every concept a distinct word, learned in a fixed order.
  for (const lang of ['alien', ...Object.keys((await import('./world.js')).CULTURES)]) {
    const lex = lexicon(lang);
    assert.deepEqual(lex, lexicon(lang));
    assert.equal(new Set(Object.values(lex.words)).size, CONCEPTS.length, lang);
    assert.deepEqual([...lex.order].sort(), [...CONCEPTS].sort());
  }
  const w = makeWorld('s1');
  assert.deepEqual(inscription(w, 42), inscription(w, 42));
  assert.ok(inscription(w, 42).every((c) => CONCEPTS.includes(c)));
  assert.equal(languageOf({ civ: 'uninhabited', culture: 'nordic' }), null);
  assert.equal(languageOf({ civ: 'aliens', culture: 'nordic' }), 'alien');
}
{
  // The explorer's look: random from the seed, the player's choices on top.
  const { avatarLook } = await import('./draw.js');
  const a = avatarLook('abc');
  assert.deepEqual(avatarLook('abc'), a, 'the same seed, the same explorer');
  assert.deepEqual(avatarLook('abc', { hat: 4, pack: false }), { ...a, hat: 4, pack: false });
  console.log('avatar look ok');
}
