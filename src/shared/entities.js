// Factory delle entita'. Le entita' sono oggetti piatti e serializzabili: nessuna classe,
// nessun riferimento a oggetti grafici. Il client crea gli sprite guardando `kind` e `id`.

import { PLAYER, ENEMIES } from './constants.js';

export function makePlayer(world, playerId, x, y, roomId) {
  return {
    id: world.nextId++,
    kind: 'player',
    team: 'players',
    playerId,
    x, y, prevX: x, prevY: y,
    vx: 0, vy: 0,
    kbx: 0, kby: 0,
    r: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    alive: true,
    roomId,
    facing: 0, // angolo di mira (radianti)
    attackCd: 0,
    swing: 0, // >0 mentre il fendente e' visibile
    flash: 0,
    invuln: 0,
    stun: 0,
    moving: false,
  };
}

export function makeEnemy(world, type, x, y, roomId) {
  const def = ENEMIES[type];
  return {
    id: world.nextId++,
    kind: type, // 'chaser' | 'ranged' | 'boss'
    team: 'enemies',
    x, y, prevX: x, prevY: y,
    vx: 0, vy: 0,
    kbx: 0, kby: 0,
    r: def.radius,
    hp: def.maxHp,
    maxHp: def.maxHp,
    alive: true,
    roomId,
    facing: 0,
    flash: 0,
    stun: 0,
    charging: 0, // >0 durante il telegrafo di un attacco
    enraged: false,
    ai: { state: 'dormant', t: 0, cd: 0, mode: 'hold', strafe: 1, strafeT: 0, pattern: 0, stuckT: 0 },
  };
}

export function makeProjectile(world, x, y, vx, vy, damage, team) {
  return {
    id: world.nextId++,
    x, y, prevX: x, prevY: y,
    vx, vy,
    r: 3,
    damage,
    team,
    life: 4,
    alive: true,
  };
}
