import assert from 'node:assert/strict';
import { strength, mine, validText, POW_BITS } from './names.js';

// Same vector as python: sha256("dw1|v1-1_2_3|Vega|eve|42"); the contract hashes the same string.
const hex = (b) => Buffer.from(b).toString('hex');
assert.equal(hex(strength('v1-1_2_3', { name: 'Vega', by: 'eve', nonce: 42 })), '8e798aba81f332e1ab872bcf809f173bd3289bb90b73ac1b601236283494fa37');

const c = await mine('v1-1_2_3', 'Vega', 'eve');
const h = strength('v1-1_2_3', c);
assert.ok(h[0] === 0 && h[1] === 0 && h[2] < 64, `${POW_BITS} leading zero bits`);
const c2 = await mine('v1-1_2_3', 'Altair', 'bob', c);
assert.ok(Buffer.compare(Buffer.from(strength('v1-1_2_3', c2)), Buffer.from(h)) < 0, 'outbids the holder');
assert.ok(!validText('a|b', 'x') && !validText(' a', 'x') && !validText('a', '') && validText('Nova Prime', 'scobru'));
console.log('names ok, nonces', c.nonce, c2.nonce);
