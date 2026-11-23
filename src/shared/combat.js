// Danni, knockback ed eventi. La simulazione NON produce effetti grafici: emette eventi
// (world.events) che il client trasforma in shake, flash, particelle e suoni. In rete gli
// stessi eventi viaggeranno nello snapshot del server.

import { FLASH_TIME, HIT_STUN, PLAYER, ENEMIES } from './constants.js';
import { makeProjectile } from './entities.js';
import { hasLineOfSight } from './grid.js';

export function emit(world, type, data = {}) {
  world.events.push({ type, tick: world.tick, ...data });
}

export function applyDamage(world, target, amount, fromX, fromY, sourceKind) {
  if (!target.alive) return;
  target.hp = Math.max(0, target.hp - amount);
  target.flash = FLASH_TIME;

  let dx = target.x - fromX;
  let dy = target.y - fromY;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  if (target.kind === 'player') {
    target.invuln = PLAYER.invulnTime;
    target.stun = PLAYER.hurtStun;
    target.kbx = dx * PLAYER.hurtKnockback;
    target.kby = dy * PLAYER.hurtKnockback;
    emit(world, 'playerHurt', { id: target.id, playerId: target.playerId, x: target.x, y: target.y, amount, hp: target.hp, source: sourceKind });
  } else {
    const kb = ENEMIES[target.kind].knockbackTaken;
    target.kbx = dx * kb;
    target.kby = dy * kb;
    target.stun = target.kind === 'boss' ? HIT_STUN * 0.4 : HIT_STUN;
    emit(world, 'enemyHit', { id: target.id, kind: target.kind, x: target.x, y: target.y, amount, dirX: dx, dirY: dy });
    // un colpo interrompe il telegrafo dei nemici a distanza (premia l'aggressivita')
    if (target.kind === 'ranged' && target.ai.state === 'windup') {
      target.ai.state = 'kite';
      target.ai.cd = 0.6;
      target.charging = 0;
    }
    if (target.kind === 'boss' && !target.enraged && target.hp <= target.maxHp / 2 && target.hp > 0) {
      target.enraged = true;
      emit(world, 'bossPhase', { id: target.id, x: target.x, y: target.y });
    }
  }

  if (target.hp <= 0) {
    target.alive = false;
    if (target.kind === 'player') {
      emit(world, 'playerDied', { id: target.id, playerId: target.playerId, x: target.x, y: target.y, cause: sourceKind });
    } else {
      world.stats.kills++;
      emit(world, 'enemyDied', { id: target.id, kind: target.kind, x: target.x, y: target.y, roomId: target.roomId });
    }
  }
}

export function fireProjectile(world, from, angle, speed, damage) {
  const p = makeProjectile(
    world,
    from.x + Math.cos(angle) * (from.r + 2),
    from.y + Math.sin(angle) * (from.r + 2),
    Math.cos(angle) * speed,
    Math.sin(angle) * speed,
    damage,
    from.team,
  );
  world.projectiles.push(p);
  return p;
}

/** Giocatore vivo piu' vicino nella stessa stanza (pronto per il co-op: N giocatori). */
export function nearestPlayer(world, e) {
  let best = null;
  let bestD = Infinity;
  for (const p of world.entities) {
    if (p.kind !== 'player' || !p.alive || p.roomId !== e.roomId) continue;
    const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Linea di vista "spessa": centro piu' due linee parallele a +-r, per corpi non puntiformi. */
export function clearPath(world, a, b, r) {
  if (!hasLineOfSight(world, a.x, a.y, b.x, b.y)) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  return (
    hasLineOfSight(world, a.x + nx, a.y + ny, b.x + nx, b.y + ny) &&
    hasLineOfSight(world, a.x - nx, a.y - ny, b.x - nx, b.y - ny)
  );
}
