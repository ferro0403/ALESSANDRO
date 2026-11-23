// IA nemici: una piccola FSM per tipo. Ogni update scrive solo la velocita' desiderata
// (e.vx, e.vy) e, quando serve, spara; il movimento con collisioni lo fa world.step.
//
// Strati (skill game-ai): percezione (bersaglio + linea di vista) -> decisione (stato FSM)
// -> percorso (flow field per stanza) -> sterzata (velocita').
// Regole di equita': ritardo di reazione all'attivazione, telegrafo prima di ogni sparo,
// isteresi sulle soglie di distanza per evitare sfarfallii di stato.

import { ENEMIES } from './constants.js';
import { buildFlowField, flowDirection } from './grid.js';
import { nearestPlayer, clearPath, fireProjectile, emit } from './combat.js';

export function activateEnemy(world, e) {
  const def = ENEMIES[e.kind];
  e.ai.state = 'idle';
  e.ai.t = world.rng.range(def.reaction[0], def.reaction[1]);
  e.ai.cd = world.rng.range(0.6, 1.4);
}

export function updateEnemy(world, e, dt) {
  e.vx = 0;
  e.vy = 0;
  if (!e.alive || e.ai.state === 'dormant') return;
  if (e.stun > 0) return; // colpito: sta fermo per un attimo (il knockback lo muove)

  switch (e.kind) {
    case 'chaser': return chaser(world, e, dt);
    case 'ranged': return ranged(world, e, dt);
    case 'boss': return boss(world, e, dt);
  }
}

// ---------------------------------------------------------------------------- inseguitore
function chaser(world, e, dt) {
  const def = ENEMIES.chaser;
  const ai = e.ai;
  if (ai.state === 'idle') {
    ai.t -= dt;
    if (ai.t <= 0) ai.state = 'chase';
    return;
  }
  const target = nearestPlayer(world, e);
  if (!target) return;
  steerTowards(world, e, target, def.speed, dt);
}

// --------------------------------------------------------------------------- a distanza
function ranged(world, e, dt) {
  const def = ENEMIES.ranged;
  const ai = e.ai;
  const target = nearestPlayer(world, e);

  if (ai.state === 'idle') {
    ai.t -= dt;
    if (ai.t <= 0) ai.state = 'kite';
    return;
  }
  if (!target) return;

  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.hypot(dx, dy);
  e.facing = Math.atan2(dy, dx);

  if (ai.state === 'windup') {
    ai.t -= dt;
    e.charging = ai.t;
    if (ai.t <= 0) {
      fireProjectile(world, e, e.facing, def.projectileSpeed, def.projectileDamage);
      emit(world, 'enemyShoot', { id: e.id, kind: e.kind, x: e.x, y: e.y });
      e.charging = 0;
      ai.state = 'kite';
      ai.cd = world.rng.range(def.fireCooldown[0], def.fireCooldown[1]);
    }
    return;
  }

  // kite: decide la modalita' con isteresi
  const los = clearPath(world, e, target, 2);
  if (ai.mode === 'flee') {
    if (d > def.nearExit) ai.mode = 'hold';
  } else if (ai.mode === 'approach') {
    if (los && d < def.farExit) ai.mode = 'hold';
  } else {
    if (d < def.nearEnter) ai.mode = 'flee';
    else if (d > def.farEnter || !los) ai.mode = 'approach';
  }

  if (ai.mode === 'flee') {
    // allontanati; se contro un muro, scivola di lato
    const len = d || 1;
    let vx = -dx / len;
    let vy = -dy / len;
    if (ai.stuckT > 0.25) {
      vx = -dy / len * ai.strafe;
      vy = dx / len * ai.strafe;
    }
    e.vx = vx * def.speed;
    e.vy = vy * def.speed;
  } else if (ai.mode === 'approach') {
    steerTowards(world, e, target, def.speed, dt);
  } else {
    // hold: gira intorno al bersaglio, cambiando verso ogni tanto
    ai.strafeT -= dt;
    if (ai.strafeT <= 0 || ai.stuckT > 0.3) {
      ai.strafe = -ai.strafe;
      ai.strafeT = world.rng.range(1.0, 2.0);
      ai.stuckT = 0;
    }
    const len = d || 1;
    e.vx = (-dy / len) * ai.strafe * def.speed * 0.5;
    e.vy = (dx / len) * ai.strafe * def.speed * 0.5;
  }

  ai.cd -= dt;
  if (ai.cd <= 0 && los && d < 230) {
    ai.state = 'windup';
    ai.t = def.windup;
    e.charging = def.windup;
    e.vx = 0;
    e.vy = 0;
  }
}

// --------------------------------------------------------------------------------- boss
function boss(world, e, dt) {
  const def = ENEMIES.boss;
  const ai = e.ai;
  const target = nearestPlayer(world, e);

  switch (ai.state) {
    case 'idle':
      ai.t -= dt;
      if (ai.t <= 0) {
        ai.state = 'chase';
        ai.t = def.chaseTime;
      }
      return;
    case 'chase':
      if (target) {
        e.facing = Math.atan2(target.y - e.y, target.x - e.x);
        steerTowards(world, e, target, e.enraged ? def.speedEnraged : def.speed, dt);
      }
      ai.t -= dt;
      if (ai.t <= 0) {
        ai.state = 'windup';
        ai.t = def.windup * (e.enraged ? 0.8 : 1);
        e.charging = ai.t;
      }
      return;
    case 'windup':
      ai.t -= dt;
      e.charging = Math.max(ai.t, 0.0001);
      if (target) e.facing = Math.atan2(target.y - e.y, target.x - e.x);
      if (ai.t <= 0) {
        e.charging = 0;
        bossAttack(world, e);
        ai.state = 'recover';
        ai.t = 0.4;
      }
      return;
    case 'recover':
      ai.t -= dt;
      if (ai.t <= 0) {
        ai.state = 'chase';
        ai.t = def.chaseTime * (e.enraged ? 0.75 : 1);
      }
      return;
  }
}

function bossAttack(world, e) {
  const def = ENEMIES.boss;
  const ai = e.ai;
  ai.pattern++;
  // fase 1: ventaglio mirato; fase 2 (sotto meta' vita): alterna ventaglio largo e anello
  const radial = e.enraged && ai.pattern % 2 === 0;
  if (radial) {
    const n = 14;
    const off = world.rng.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) fireProjectile(world, e, off + (i / n) * Math.PI * 2, def.projectileSpeed * 0.9, def.projectileDamage);
  } else {
    const n = e.enraged ? 7 : 5;
    const spread = 0.22;
    for (let i = 0; i < n; i++) {
      fireProjectile(world, e, e.facing + (i - (n - 1) / 2) * spread, def.projectileSpeed, def.projectileDamage);
    }
  }
  emit(world, 'enemyShoot', { id: e.id, kind: 'boss', x: e.x, y: e.y, radial });
}

// ------------------------------------------------------------------------------ sterzata
function steerTowards(world, e, target, speed, dt) {
  const ai = e.ai;
  let dir = null;
  if (clearPath(world, e, target, e.r)) {
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    dir = { x: dx / len, y: dy / len };
  } else {
    const room = world.dungeon.rooms[e.roomId];
    const field = getFlowField(world, room, target);
    dir = flowDirection(world, room, field, e.x, e.y);
  }
  // guardia anti-incastro: se non avanza da un po', prova la direzione del flow field
  if (ai.stuckT > 0.6) {
    const room = world.dungeon.rooms[e.roomId];
    const alt = flowDirection(world, room, getFlowField(world, room, target), e.x, e.y);
    if (alt) dir = alt;
    if (ai.stuckT > 1.2) ai.stuckT = 0;
  }
  if (!dir) return;
  e.vx = dir.x * speed;
  e.vy = dir.y * speed;
  e.facing = Math.atan2(dir.y, dir.x);
}

/** Flow field in cache per stanza; si ricalcola solo quando il bersaglio cambia tile. */
function getFlowField(world, room, target) {
  const key = `${Math.floor(target.x / 16)},${Math.floor(target.y / 16)}`;
  const cached = world.flow[room.id];
  if (cached && cached.key === key && cached.doorsVersion === world.doorsVersion) return cached.field;
  const field = buildFlowField(world, room, target.x, target.y);
  world.flow[room.id] = { key, field, doorsVersion: world.doorsVersion };
  return field;
}
