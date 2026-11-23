import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, validateDungeon, dungeonHash } from '../src/shared/dungeon.js';
import { ROOM_COUNT, MIN_BOSS_DEPTH } from '../src/shared/constants.js';

const SEEDS = 500;

test(`seed sweep su ${SEEDS} seed: validi, deterministici, vari`, () => {
  const hashes = new Set();
  let retries = 0;
  const bossDepth = {};
  for (let seed = 1; seed <= SEEDS; seed++) {
    const a = generateDungeon(seed);
    const b = generateDungeon(seed);
    const check = validateDungeon(a);
    assert.ok(check.ok, `seed ${seed}: ${check.errors.join(', ')}`);
    assert.equal(dungeonHash(a), dungeonHash(b), `seed ${seed} non deterministico`);
    assert.equal(a.rooms.length, ROOM_COUNT);
    const boss = a.rooms[a.bossRoom];
    assert.ok(boss.depth >= MIN_BOSS_DEPTH);
    assert.equal(boss.doors.length, 1, 'il boss e\' in una stanza foglia');
    assert.equal(a.rooms[a.startRoom].spawns.length, 0);
    hashes.add(dungeonHash(a));
    retries += a.attempt;
    bossDepth[boss.depth] = (bossDepth[boss.depth] || 0) + 1;
  }
  console.log(`  dungeon distinti: ${hashes.size}/${SEEDS}, rigenerazioni: ${retries}, profondita' boss:`, bossDepth);
  assert.ok(hashes.size > SEEDS * 0.95);
});
