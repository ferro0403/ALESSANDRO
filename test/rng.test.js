import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng, subSeed } from '../src/shared/rng.js';

test('PRNG: primi valori fissati (un refactor non deve cambiare i seed condivisi)', () => {
  const r = new Rng(0);
  assert.deepEqual([r.nextU32(), r.nextU32(), r.nextU32()], [2462723854, 1020716019, 454327756]);
});

test('PRNG: int nei limiti e sotto-seed diversi per scopo', () => {
  const r = new Rng(123);
  for (let i = 0; i < 10000; i++) {
    const v = r.int(-3, 7);
    assert.ok(v >= -3 && v <= 7 && Number.isInteger(v));
  }
  assert.notEqual(subSeed(1, 'layout'), subSeed(1, 'combat'));
  assert.equal(subSeed(1, 'layout'), subSeed(1, 'layout'));
});
