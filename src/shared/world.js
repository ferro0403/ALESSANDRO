// Il mondo di gioco: stato + step a passo fisso. Questo e' il "server" del gioco.
//
//   const world = createWorld({ seed, playerIds: ['p1'] });
//   step(world, { p1: { mx, my, ax, ay, attack } });   // 60 volte al secondo
//   world.events  -> cosa e' successo in questo passo (per grafica/suoni)
//
// Per il multiplayer online: il server chiamera' step() con gli input di tutti i giocatori
// e inviera' snapshot dello stato; i client faranno da renderer (+ predizione locale).
// Per questo: niente Phaser, niente Math.random, niente tempo reale qui dentro.

import { PLAYER, ENEMIES, SIM_DT, KNOCKBACK_DAMPING } from './constants.js';
import { generateDungeon, roomAtPixel, roomInteriorPx, roomCenterPx } from './dungeon.js';
import { Rng, subSeed } from './rng.js';
import { makePlayer, makeEnemy } from './entities.js';
import { moveWithCollision, isSolidAt } from './grid.js';
import { applyDamage, emit } from './combat.js';
import { activateEnemy, updateEnemy } from './ai.js';

export function createWorld({ seed, playerIds = ['p1'] }) {
  const dungeon = generateDungeon(seed);
  const world = {
    seed: seed >>> 0,
    tick: 0,
    time: 0,
    status: 'playing', // 'playing' | 'won' | 'lost'
    dungeon,
    rng: new Rng(subSeed(seed, 'combat')), // separato dal layout: il combattimento non sposta la mappa
    nextId: 1,
    entities: [],
    projectiles: [],
    doors: dungeon.doors.map((d) => ({ id: d.id, open: true })),
    doorsVersion: 0,
    rooms: dungeon.rooms.map((r) => ({ id: r.id, state: r.kind === 'start' ? 'cleared' : 'dormant' })),
    events: [],
    flow: {}, // cache dell'IA, non fa parte dello stato da sincronizzare
    stats: { kills: 0, roomsCleared: 0, deepestRoom: 0 },
  };

  const start = dungeon.rooms[dungeon.startRoom];
  const c = roomCenterPx(start);
  playerIds.forEach((pid, i) => {
    const off = (i - (playerIds.length - 1) / 2) * 24;
    world.entities.push(makePlayer(world, pid, c.x + off, c.y, start.id));
  });

  for (const r of dungeon.rooms) {
    for (const s of r.spawns) world.entities.push(makeEnemy(world, s.type, s.x, s.y, r.id));
  }
  return world;
}

export function getPlayer(world, playerId) {
  return world.entities.find((e) => e.kind === 'player' && e.playerId === playerId) || null;
}

export function getBoss(world) {
  return world.entities.find((e) => e.kind === 'boss') || null;
}

/** Normalizza un input proveniente dall'esterno (domani: dalla rete). Mai fidarsi del client. */
export function sanitizeInput(input) {
  if (!input) return { mx: 0, my: 0, ax: 0, ay: 0, attack: false };
  let mx = Number(input.mx) || 0;
  let my = Number(input.my) || 0;
  mx = Math.max(-1, Math.min(1, mx));
  my = Math.max(-1, Math.min(1, my));
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  return { mx, my, ax: Number(input.ax) || 0, ay: Number(input.ay) || 0, attack: !!input.attack };
}

export function step(world, inputs = {}, dt = SIM_DT) {
  world.events = [];
  world.tick++;
  world.time += dt;

  for (const e of world.entities) {
    e.prevX = e.x;
    e.prevY = e.y;
  }
  for (const p of world.projectiles) {
    p.prevX = p.x;
    p.prevY = p.y;
  }
  if (world.status !== 'playing') return world;

  // 1) giocatori
  for (const e of world.entities) {
    if (e.kind === 'player' && e.alive) updatePlayer(world, e, sanitizeInput(inputs[e.playerId]), dt);
  }

  // 2) stanze: attivazione / chiusura porte
  updateRooms(world);

  // 3) IA
  for (const e of world.entities) if (e.team === 'enemies') updateEnemy(world, e, dt);
  separateEnemies(world);

  // 4) integrazione con collisioni
  const kbDecay = Math.exp(-KNOCKBACK_DAMPING * dt);
  for (const e of world.entities) {
    if (!e.alive) continue;
    const wantX = e.vx * dt;
    const wantY = e.vy * dt;
    const x0 = e.x;
    const y0 = e.y;
    moveWithCollision(world, e, wantX + e.kbx * dt, wantY + e.kby * dt);
    e.kbx *= kbDecay;
    e.kby *= kbDecay;
    if (Math.abs(e.kbx) < 1) e.kbx = 0;
    if (Math.abs(e.kby) < 1) e.kby = 0;

    if (e.ai) {
      const want = Math.hypot(wantX, wantY);
      const got = Math.hypot(e.x - x0, e.y - y0);
      e.ai.stuckT = want > 0.05 && got < want * 0.3 ? e.ai.stuckT + dt : 0;
    }

    e.flash = Math.max(0, e.flash - dt);
    e.stun = Math.max(0, e.stun - dt);
    if (e.kind === 'player') {
      e.invuln = Math.max(0, e.invuln - dt);
      e.attackCd = Math.max(0, e.attackCd - dt);
      e.swing = Math.max(0, e.swing - dt);
      const rid = roomAtPixel(world.dungeon, e.x, e.y);
      if (rid !== -1) e.roomId = rid;
    }
  }

  // 5) proiettili
  updateProjectiles(world, dt);

  // 6) danno da contatto
  for (const en of world.entities) {
    if (en.team !== 'enemies' || !en.alive || en.ai.state === 'dormant') continue;
    for (const p of world.entities) {
      if (p.kind !== 'player' || !p.alive || p.invuln > 0) continue;
      const rr = en.r + p.r - 1;
      if ((en.x - p.x) ** 2 + (en.y - p.y) ** 2 < rr * rr) {
        applyDamage(world, p, ENEMY_CONTACT[en.kind], en.x, en.y, en.kind);
      }
    }
  }

  // 7) morti, stanze ripulite, fine partita
  cleanup(world);
  return world;
}

const ENEMY_CONTACT = Object.fromEntries(Object.entries(ENEMIES).map(([k, v]) => [k, v.contactDamage]));

// ------------------------------------------------------------------------------ giocatore
function updatePlayer(world, p, input, dt) {
  const control = p.stun > 0 ? 0 : 1;
  p.vx = input.mx * PLAYER.speed * control;
  p.vy = input.my * PLAYER.speed * control;
  p.moving = control > 0 && (input.mx !== 0 || input.my !== 0);
  p.facing = Math.atan2(input.ay - p.y, input.ax - p.x);

  if (input.attack && p.attackCd <= 0 && p.stun <= 0) {
    p.attackCd = PLAYER.attackCooldown;
    p.swing = PLAYER.swingTime;
    emit(world, 'swing', { id: p.id, playerId: p.playerId, x: p.x, y: p.y, angle: p.facing });
    meleeHit(world, p);
  }
}

function meleeHit(world, p) {
  const half = PLAYER.attackArc / 2;
  for (const e of world.entities) {
    if (e.team !== 'enemies' || !e.alive || e.ai.state === 'dormant') continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist - e.r > PLAYER.attackRange) continue;
    let diff = Math.atan2(dy, dx) - p.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    // se il nemico e' praticamente addosso, l'angolo conta poco
    if (Math.abs(diff) > half && dist > e.r + p.r + 2) continue;
    applyDamage(world, e, PLAYER.attackDamage, p.x, p.y, 'player');
  }
}

// --------------------------------------------------------------------------------- stanze
function updateRooms(world) {
  const d = world.dungeon;
  for (const rs of world.rooms) {
    if (rs.state !== 'dormant') continue;
    const room = d.rooms[rs.id];
    const box = roomInteriorPx(room);
    // la stanza si chiude solo quando un giocatore e' tutto dentro (mai chiuso nella porta).
    // Co-op futuro: qui si teletrasporteranno dentro i compagni rimasti fuori.
    const inside = world.entities.some(
      (p) => p.kind === 'player' && p.alive &&
        p.x - p.r > box.x + 2 && p.x + p.r < box.x + box.w - 2 &&
        p.y - p.r > box.y + 2 && p.y + p.r < box.y + box.h - 2,
    );
    if (!inside) continue;
    rs.state = 'active';
    setRoomDoors(world, room, false);
    for (const e of world.entities) if (e.team === 'enemies' && e.roomId === rs.id) activateEnemy(world, e);
    world.stats.deepestRoom = Math.max(world.stats.deepestRoom, room.depth);
    emit(world, 'roomLocked', { roomId: rs.id, boss: room.kind === 'boss' });
  }
}

function setRoomDoors(world, room, open) {
  for (const id of room.doors) {
    if (open) {
      // una porta condivisa resta chiusa se l'altra stanza e' ancora in combattimento
      const other = world.dungeon.doors[id].rooms.find((r) => r !== room.id);
      if (world.rooms[other].state === 'active') continue;
    }
    if (world.doors[id].open !== open) {
      world.doors[id].open = open;
      emit(world, open ? 'doorOpened' : 'doorClosed', { doorId: id });
    }
  }
  world.doorsVersion++;
}

function separateEnemies(world) {
  const list = world.entities.filter((e) => e.team === 'enemies' && e.alive && e.ai.state !== 'dormant');
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r + 1;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const push = ((min - d) / d) * 30; // spinta morbida come velocita'
      const wa = b.r / (a.r + b.r); // il piu' grosso si sposta meno
      a.vx -= dx * push * wa;
      a.vy -= dy * push * wa;
      b.vx += dx * push * (1 - wa);
      b.vy += dy * push * (1 - wa);
    }
  }
}

function updateProjectiles(world, dt) {
  for (const pr of world.projectiles) {
    if (!pr.alive) continue;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0) {
      pr.alive = false;
      continue;
    }
    if (isSolidAt(world, pr.x, pr.y)) {
      pr.alive = false;
      emit(world, 'projectileWall', { x: pr.x, y: pr.y });
      continue;
    }
    for (const p of world.entities) {
      if (p.team === pr.team || !p.alive || p.kind !== 'player') continue;
      const rr = p.r + pr.r;
      if ((p.x - pr.x) ** 2 + (p.y - pr.y) ** 2 < rr * rr) {
        pr.alive = false;
        if (p.invuln <= 0) applyDamage(world, p, pr.damage, pr.x - pr.vx, pr.y - pr.vy, 'projectile');
        break;
      }
    }
  }
  world.projectiles = world.projectiles.filter((p) => p.alive);
}

function cleanup(world) {
  const deadBoss = world.entities.some((e) => e.kind === 'boss' && !e.alive);
  world.entities = world.entities.filter((e) => e.alive || e.kind === 'player');

  for (const rs of world.rooms) {
    if (rs.state !== 'active') continue;
    const left = world.entities.some((e) => e.team === 'enemies' && e.roomId === rs.id);
    if (left) continue;
    rs.state = 'cleared';
    world.stats.roomsCleared++;
    const room = world.dungeon.rooms[rs.id];
    setRoomDoors(world, room, true);
    emit(world, 'roomCleared', { roomId: rs.id, boss: room.kind === 'boss' });
  }

  if (deadBoss) {
    world.status = 'won';
    world.projectiles = [];
    emit(world, 'victory', {});
  } else if (!world.entities.some((e) => e.kind === 'player' && e.alive)) {
    world.status = 'lost';
    emit(world, 'defeat', {});
  }
}
