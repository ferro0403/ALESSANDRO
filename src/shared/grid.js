// Query sulla griglia: solidita' (con le porte chiuse), movimento con collisione,
// linea di vista e flow field per l'IA. Tutto su dati puri.

import { TILE, TILE_FLOOR, TILE_DOOR, CELL_W, CELL_H } from './constants.js';

export function isSolidTile(world, tx, ty) {
  const d = world.dungeon;
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return true;
  const i = ty * d.width + tx;
  const t = d.tiles[i];
  if (t === TILE_FLOOR) return false;
  if (t === TILE_DOOR) return !world.doors[d.doorAt[i]].open;
  return true;
}

export function isSolidAt(world, px, py) {
  return isSolidTile(world, Math.floor(px / TILE), Math.floor(py / TILE));
}

function boxHitsSolid(world, x, y, r) {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolidTile(world, tx, ty)) return true;
  return false;
}

const EPS = 0.001;

/**
 * Muove un'entita' (box di semilato e.r) asse per asse, fermandola contro le tile solide.
 * Ritorna true se ha urtato qualcosa. Richiede |dx|,|dy| < TILE per passo (vero a 60 Hz).
 */
export function moveWithCollision(world, e, dx, dy) {
  let bumped = false;
  if (dx !== 0) {
    e.x += dx;
    if (boxHitsSolid(world, e.x, e.y, e.r)) {
      bumped = true;
      if (dx > 0) e.x = Math.floor((e.x + e.r) / TILE) * TILE - e.r - EPS;
      else e.x = (Math.floor((e.x - e.r) / TILE) + 1) * TILE + e.r + EPS;
    }
  }
  if (dy !== 0) {
    e.y += dy;
    if (boxHitsSolid(world, e.x, e.y, e.r)) {
      bumped = true;
      if (dy > 0) e.y = Math.floor((e.y + e.r) / TILE) * TILE - e.r - EPS;
      else e.y = (Math.floor((e.y - e.r) / TILE) + 1) * TILE + e.r + EPS;
    }
  }
  return bumped;
}

/** Linea di vista campionata ogni mezza tile (sufficiente per tile da 16 px). */
export function hasLineOfSight(world, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / (TILE / 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolidAt(world, ax + dx * t, ay + dy * t)) return false;
  }
  return true;
}

/**
 * Flow field (BFS dal bersaglio) limitato a una stanza: un solo calcolo serve tutti i nemici
 * che inseguono lo stesso giocatore. Diagonali solo se entrambe le ortogonali sono libere
 * (niente tagli di spigolo). Distanze in "passi" (1 ortogonale, 1.4 diagonale -> Dijkstra
 * semplificato con due code va bene; qui usiamo una BFS a 8 vicini con costo uniforme che
 * e' piu' che sufficiente per stanze 22x13).
 */
export function buildFlowField(world, room, targetX, targetY) {
  const w = CELL_W;
  const h = CELL_H;
  const dist = new Int16Array(w * h).fill(-1);
  const ttx = Math.floor(targetX / TILE) - room.ox;
  const tty = Math.floor(targetY / TILE) - room.oy;
  if (ttx < 0 || tty < 0 || ttx >= w || tty >= h) return { room: room.id, tx: ttx, ty: tty, dist };
  const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !isSolidTile(world, room.ox + x, room.oy + y);
  const queue = [tty * w + ttx];
  dist[queue[0]] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!free(nx, ny)) continue;
        if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
        const j = ny * w + nx;
        if (dist[j] !== -1) continue;
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  return { room: room.id, tx: ttx, ty: tty, dist };
}

/** Direzione (unitaria) suggerita dal flow field per chi si trova in (px,py), o null. */
export function flowDirection(world, room, field, px, py) {
  const w = CELL_W;
  const h = CELL_H;
  const x = Math.floor(px / TILE) - room.ox;
  const y = Math.floor(py / TILE) - room.oy;
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const here = field.dist[y * w + x];
  let best = here === -1 ? 32767 : here;
  let bx = 0;
  let by = 0;
  const free = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && field.dist[yy * w + xx] !== -1;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!free(x + dx, y + dy)) continue;
      if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
      const v = field.dist[(y + dy) * w + (x + dx)];
      if (v < best) {
        best = v;
        bx = dx;
        by = dy;
      }
    }
  }
  if (!bx && !by) return null;
  // punta al centro della tile scelta: evita di strisciare contro gli spigoli
  const cx = (room.ox + x + bx) * TILE + TILE / 2;
  const cy = (room.oy + y + by) * TILE + TILE / 2;
  const vx = cx - px;
  const vy = cy - py;
  const len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len };
}
