import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, getPlayer, getBoss } from '../src/shared/world.js';
import { applyDamage } from '../src/shared/combat.js';
import { SIM_HZ } from '../src/shared/constants.js';
import { freeSpotInRoom, stateHash } from './helpers.js';

function scriptedInputs(t) {
  // input "a caso" ma deterministici
  return { p1: { mx: Math.sin(t * 0.05), my: Math.cos(t * 0.031), ax: 600 + 100 * Math.sin(t * 0.1), ay: 400, attack: t % 20 < 3 } };
}

test('stessa partita, stessi input -> stesso stato (determinismo per il netcode)', () => {
  const run = () => {
    const w = createWorld({ seed: 777 });
    for (let t = 0; t < 600; t++) step(w, scriptedInputs(t));
    return stateHash(w);
  };
  assert.equal(run(), run());
});

test('entrare in una stanza chiude le porte; eliminare i nemici le riapre', () => {
  const w = createWorld({ seed: 99 });
  const room = w.dungeon.rooms.find((r) => r.kind === 'normal');
  const p = getPlayer(w, 'p1');
  Object.assign(p, freeSpotInRoom(w, room));
  p.invuln = 1e9;
  step(w, {});
  assert.equal(w.rooms[room.id].state, 'active');
  for (const id of room.doors) assert.equal(w.doors[id].open, false, 'porta ancora aperta');
  assert.ok(w.events.some((e) => e.type === 'roomLocked'));

  for (const e of w.entities.filter((e) => e.roomId === room.id && e.team === 'enemies')) applyDamage(w, e, 9999, p.x, p.y, 'test');
  step(w, {});
  assert.equal(w.rooms[room.id].state, 'cleared');
  for (const id of room.doors) assert.equal(w.doors[id].open, true, 'porta ancora chiusa');
});

test('IA: nessun inseguitore resta incastrato (200 seed, ogni stanza)', () => {
  let rooms = 0;
  let stuck = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const base = createWorld({ seed });
    for (const room of base.dungeon.rooms.filter((r) => r.kind === 'normal')) {
      const w = createWorld({ seed });
      const p = getPlayer(w, 'p1');
      Object.assign(p, freeSpotInRoom(w, room));
      p.invuln = 1e9; // niente knockback: misuriamo solo se l'IA arriva
      const chasers = w.entities.filter((e) => e.kind === 'chaser' && e.roomId === room.id);
      if (!chasers.length) continue;
      const reached = new Set();
      for (let t = 0; t < SIM_HZ * 10 && reached.size < chasers.length; t++) {
        step(w, { p1: { mx: 0, my: 0, ax: p.x + 1, ay: p.y, attack: false } });
        for (const c of chasers) if (Math.hypot(c.x - p.x, c.y - p.y) < c.r + p.r + 3) reached.add(c.id);
      }
      rooms++;
      if (reached.size < chasers.length) {
        stuck++;
        console.log(`  bloccato: seed ${seed} stanza ${room.id}`);
      }
    }
  }
  console.log(`  stanze provate: ${rooms}, con inseguitori bloccati: ${stuck}`);
  assert.equal(stuck, 0);
});

test('il nemico a distanza telegrafa e spara', () => {
  for (let seed = 1; seed < 50; seed++) {
    const w = createWorld({ seed });
    const r = w.entities.find((e) => e.kind === 'ranged');
    if (!r) continue;
    const room = w.dungeon.rooms[r.roomId];
    const p = getPlayer(w, 'p1');
    Object.assign(p, freeSpotInRoom(w, room));
    p.invuln = 1e9;
    let windup = false;
    let shot = false;
    for (let t = 0; t < SIM_HZ * 8 && !shot; t++) {
      step(w, { p1: { ax: p.x, ay: p.y - 1 } });
      if (r.charging > 0) windup = true;
      if (w.events.some((e) => e.type === 'enemyShoot' && e.id === r.id)) shot = true;
    }
    assert.ok(windup && shot, `seed ${seed}: windup=${windup} shot=${shot}`);
    return;
  }
  assert.fail('nessun nemico a distanza trovato');
});

test('battere il boss -> vittoria; perdere tutta la vita -> sconfitta', () => {
  const w = createWorld({ seed: 5 });
  const boss = getBoss(w);
  const p = getPlayer(w, 'p1');
  const room = w.dungeon.rooms[boss.roomId];
  Object.assign(p, freeSpotInRoom(w, room));
  p.y += 40;
  p.invuln = 1e9;
  let phase = false;
  for (let t = 0; t < SIM_HZ * 60 && w.status === 'playing'; t++) {
    // insegue il boss e colpisce
    const dx = boss.x - p.x;
    const dy = boss.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    step(w, { p1: { mx: d > 20 ? dx / d : 0, my: d > 20 ? dy / d : 0, ax: boss.x, ay: boss.y, attack: true } });
    if (w.events.some((e) => e.type === 'bossPhase')) phase = true;
  }
  assert.equal(w.status, 'won');
  assert.ok(phase, 'seconda fase del boss mai attivata');

  const w2 = createWorld({ seed: 5 });
  const p2 = getPlayer(w2, 'p1');
  applyDamage(w2, p2, 9999, 0, 0, 'test');
  step(w2, {});
  assert.equal(w2.status, 'lost');
});
