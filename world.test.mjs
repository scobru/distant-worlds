import assert from 'node:assert/strict';
import { makeWorld } from './world.js';

const a = makeWorld('abc123'), b = makeWorld('abc123'), c = makeWorld('abc124');
assert.deepEqual(a, b, 'same seed must give same world');
assert.notDeepEqual(a, c, 'different seed should differ');
for (const l of a.layers) for (const h of l.heights) assert.ok(h >= 0 && h <= 1);
console.log('ok', a.name, '/', c.name, a.music.scaleName, a.music.bpm + 'bpm');
