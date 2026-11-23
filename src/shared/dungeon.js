// Generatore di dungeon: produce SOLO dati (griglia di interi + elenco stanze/porte), cosi'
// si testa in Node e domani il server puo' generare lo stesso dungeon dal solo seed.
//
// Algoritmo: crescita casuale di un albero di stanze su una griglia GRID_W x GRID_H di celle
// (ogni cella = una schermata). Ogni arco dell'albero diventa una porta. Il boss va nella
// stanza piu' profonda (sempre una foglia). Ogni risultato viene validato; se fallisce si
// rigenera con un seed derivato (tentativi limitati, mai loop infiniti).

import {
  CELL_W, CELL_H, GRID_W, GRID_H, ROOM_COUNT, MIN_BOSS_DEPTH, TILE,
  TILE_VOID, TILE_FLOOR, TILE_WALL, TILE_DOOR,
} from './constants.js';
import { Rng, subSeed } from './rng.js';

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

// Ostacoli predefiniti (rettangoli [x, y, w, h] in coordinate di cella). L'interno della
// stanza va da (1,1) a (22,13); le porte stanno a meta' dei lati, quindi i bordi restano liberi.
const LAYOUTS = [
  [],
  [[6, 4, 2, 2], [16, 4, 2, 2], [6, 9, 2, 2], [16, 9, 2, 2]],
  [[10, 6, 4, 3]],
  [[7, 4, 2, 7], [15, 4, 2, 7]],
  [[5, 3, 3, 1], [16, 3, 3, 1], [5, 11, 3, 1], [16, 11, 3, 1], [11, 7, 2, 1]],
  'scatter',
];
const BOSS_LAYOUT = [[5, 3, 2, 2], [17, 3, 2, 2], [5, 10, 2, 2], [17, 10, 2, 2]];

const MAX_ATTEMPTS = 64;

export function generateDungeon(seed, { roomCount = ROOM_COUNT } = {}) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = new Rng(subSeed(seed, `layout:${attempt}`));
    const d = tryGenerate(rng, roomCount);
    if (d && validateDungeon(d).ok) {
      d.seed = seed >>> 0;
      d.attempt = attempt;
      return d;
    }
  }
  throw new Error(`generateDungeon: nessun dungeon valido per il seed ${seed}`);
}

function tryGenerate(rng, roomCount) {
  // 1) albero di stanze
  const slot = new Map(); // "gx,gy" -> room id
  const rooms = [];
  const sx = Math.floor(GRID_W / 2);
  const sy = Math.floor(GRID_H / 2);
  const addRoom = (gx, gy, parent) => {
    const room = {
      id: rooms.length,
      gx, gy,
      ox: gx * CELL_W,
      oy: gy * CELL_H,
      parent,
      depth: parent === null ? 0 : rooms[parent].depth + 1,
      kind: 'normal',
      doors: [],
      spawns: [],
    };
    rooms.push(room);
    slot.set(`${gx},${gy}`, room.id);
    return room;
  };
  addRoom(sx, sy, null);

  let guard = 0;
  while (rooms.length < roomCount && guard++ < 500) {
    // Preferisci estendere le stanze piu' recenti: dungeon piu' "lunghi", meno a stella.
    const from = rng.chance(0.6) ? rooms[rooms.length - 1] : rng.pick(rooms);
    const dir = rng.pick(DIRS);
    const gx = from.gx + dir.dx;
    const gy = from.gy + dir.dy;
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) continue;
    if (slot.has(`${gx},${gy}`)) continue;
    addRoom(gx, gy, from.id);
  }
  if (rooms.length < roomCount) return null;

  // 2) stanza del boss = la piu' profonda (a parita', id minore: deterministico)
  let boss = rooms[0];
  for (const r of rooms) if (r.depth > boss.depth) boss = r;
  if (boss.depth < MIN_BOSS_DEPTH) return null;
  rooms[0].kind = 'start';
  boss.kind = 'boss';

  // 3) griglia di tile
  const width = GRID_W * CELL_W;
  const height = GRID_H * CELL_H;
  const tiles = new Array(width * height).fill(TILE_VOID);
  const doorAt = new Array(width * height).fill(-1);
  const set = (x, y, t) => { tiles[y * width + x] = t; };

  for (const r of rooms) {
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const edge = x === 0 || y === 0 || x === CELL_W - 1 || y === CELL_H - 1;
        set(r.ox + x, r.oy + y, edge ? TILE_WALL : TILE_FLOOR);
      }
    }
  }

  // 4) porte: una per ogni arco dell'albero
  const doors = [];
  for (const r of rooms) {
    if (r.parent === null) continue;
    const p = rooms[r.parent];
    const door = { id: doors.length, rooms: [p.id, r.id], tiles: [], open: true };
    if (p.gy === r.gy) {
      // vicini in orizzontale: passaggio di 2 colonne x 3 righe
      const left = p.gx < r.gx ? p : r;
      const x1 = left.ox + CELL_W - 1;
      const cy = left.oy + Math.floor(CELL_H / 2);
      for (const x of [x1, x1 + 1]) for (let y = cy - 1; y <= cy + 1; y++) door.tiles.push([x, y]);
      door.axis = 'x';
    } else {
      // vicini in verticale: passaggio di 2 righe x 2 colonne
      const top = p.gy < r.gy ? p : r;
      const y1 = top.oy + CELL_H - 1;
      const cx = top.ox + CELL_W / 2;
      for (const y of [y1, y1 + 1]) for (const x of [cx - 1, cx]) door.tiles.push([x, y]);
      door.axis = 'y';
    }
    for (const [x, y] of door.tiles) {
      set(x, y, TILE_DOOR);
      doorAt[y * width + x] = door.id;
    }
    doors.push(door);
    p.doors.push(door.id);
    r.doors.push(door.id);
  }

  // 5) ostacoli
  for (const r of rooms) {
    let rects;
    if (r.kind === 'start') rects = [];
    else if (r.kind === 'boss') rects = BOSS_LAYOUT;
    else {
      const layout = rng.pick(LAYOUTS);
      rects = layout === 'scatter' ? scatterPillars(rng) : layout;
    }
    for (const [x, y, w, h] of rects) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(r.ox + xx, r.oy + yy, TILE_WALL);
    }
    r.obstacles = rects.length;
  }

  const dungeon = { width, height, tiles, doorAt, rooms, doors, startRoom: 0, bossRoom: boss.id };

  // 6) nemici (posizioni in pixel). Sicurezza: mai vicino alle porte da cui entra il giocatore.
  for (const r of rooms) {
    if (r.kind === 'start') continue;
    if (r.kind === 'boss') {
      r.spawns.push({ type: 'boss', ...tileCenter(r.ox + CELL_W / 2, r.oy + Math.floor(CELL_H / 2)) });
      continue;
    }
    const count = Math.min(2 + r.depth, 6);
    const candidates = spawnCandidates(dungeon, r);
    rng.shuffle(candidates);
    const ranged = Math.min(Math.floor(count / 2), rng.int(r.depth > 1 ? 1 : 0, 2));
    for (let i = 0; i < count && i < candidates.length; i++) {
      const [tx, ty] = candidates[i];
      r.spawns.push({ type: i < ranged ? 'ranged' : 'chaser', ...tileCenter(tx, ty) });
    }
  }
  return dungeon;
}

function scatterPillars(rng) {
  const rects = [];
  const n = rng.int(3, 5);
  let guard = 0;
  while (rects.length < n && guard++ < 100) {
    const x = rng.int(5, 17);
    const y = rng.int(3, 10);
    // almeno una tile di spazio tra pilastri
    const clash = rects.some(([rx, ry]) => Math.abs(rx - x) < 4 && Math.abs(ry - y) < 4);
    if (!clash) rects.push([x, y, 2, 2]);
  }
  return rects;
}

function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function spawnCandidates(d, room) {
  const out = [];
  const doorTiles = room.doors.flatMap((id) => d.doors[id].tiles);
  for (let y = 2; y < CELL_H - 2; y++) {
    for (let x = 2; x < CELL_W - 2; x++) {
      const tx = room.ox + x;
      const ty = room.oy + y;
      if (d.tiles[ty * d.width + tx] !== TILE_FLOOR) continue;
      const near = doorTiles.some(([dx, dy]) => Math.abs(dx - tx) + Math.abs(dy - ty) < 7);
      if (!near) out.push([tx, ty]);
    }
  }
  return out;
}

/** Tile della stanza (in coordinate tile) che contiene il punto in pixel, o -1. */
export function roomAtPixel(d, px, py) {
  const gx = Math.floor(px / (CELL_W * TILE));
  const gy = Math.floor(py / (CELL_H * TILE));
  for (const r of d.rooms) if (r.gx === gx && r.gy === gy) return r.id;
  return -1;
}

/** Rettangolo interno (solo pavimento, senza muri perimetrali) di una stanza, in pixel. */
export function roomInteriorPx(room) {
  return {
    x: (room.ox + 1) * TILE,
    y: (room.oy + 1) * TILE,
    w: (CELL_W - 2) * TILE,
    h: (CELL_H - 2) * TILE,
  };
}

export function roomCenterPx(room) {
  return { x: (room.ox + CELL_W / 2) * TILE, y: (room.oy + CELL_H / 2) * TILE };
}

/** Controlli di accettazione: connettivita', conteggi, spawn sicuri. */
export function validateDungeon(d) {
  const errors = [];
  if (d.rooms.length !== ROOM_COUNT) errors.push(`stanze: ${d.rooms.length}`);
  if (d.rooms.filter((r) => r.kind === 'boss').length !== 1) errors.push('boss mancante');
  if (d.rooms[d.bossRoom].depth < MIN_BOSS_DEPTH) errors.push('boss troppo vicino');
  if (d.rooms[d.startRoom].spawns.length) errors.push('nemici nella stanza iniziale');

  // flood fill da centro della stanza iniziale attraverso pavimento e porte
  const start = d.rooms[d.startRoom];
  const sx = start.ox + CELL_W / 2;
  const sy = start.oy + Math.floor(CELL_H / 2);
  const seen = new Uint8Array(d.width * d.height);
  const stack = [sy * d.width + sx];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % d.width;
    const y = (i / d.width) | 0;
    for (const { dx, dy } of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) continue;
      const j = ny * d.width + nx;
      if (seen[j]) continue;
      const t = d.tiles[j];
      if (t === TILE_FLOOR || t === TILE_DOOR) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  for (let i = 0; i < d.tiles.length; i++) {
    if (d.tiles[i] === TILE_FLOOR && !seen[i]) {
      errors.push(`pavimento irraggiungibile a ${i % d.width},${(i / d.width) | 0}`);
      break;
    }
  }
  for (const r of d.rooms) {
    if (r.kind === 'normal' && r.spawns.length < 2) errors.push(`stanza ${r.id} con pochi nemici`);
    for (const s of r.spawns) {
      const t = d.tiles[Math.floor(s.y / TILE) * d.width + Math.floor(s.x / TILE)];
      if (t !== TILE_FLOOR) errors.push(`spawn su un muro nella stanza ${r.id}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Impronta compatta del dungeon (per i test di determinismo). */
export function dungeonHash(d) {
  let h = 0x811c9dc5;
  const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 0x01000193); };
  for (const t of d.tiles) mix(t);
  for (const r of d.rooms) for (const s of r.spawns) { mix(s.x); mix(s.y); mix(s.type.length); }
  return (h >>> 0).toString(16);
}
