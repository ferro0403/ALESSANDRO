import { TILE, CELL_W, CELL_H } from '../src/shared/constants.js';
import { isSolidTile } from '../src/shared/grid.js';

/** Tile libera piu' vicina al centro della stanza (in pixel), con margine attorno. */
export function freeSpotInRoom(world, room) {
  const cx = room.ox + CELL_W / 2;
  const cy = room.oy + Math.floor(CELL_H / 2);
  for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        let ok = true;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (isSolidTile(world, tx + xx, ty + yy)) ok = false;
        if (ok) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      }
    }
  }
  throw new Error('nessun punto libero');
}

export function stateHash(world) {
  let h = 0x811c9dc5;
  const mix = (v) => {
    const n = Math.round(v * 1000) | 0;
    for (let s = 0; s < 32; s += 8) { h ^= (n >>> s) & 0xff; h = Math.imul(h, 0x01000193); }
  };
  for (const e of world.entities) { mix(e.id); mix(e.x); mix(e.y); mix(e.hp); }
  for (const p of world.projectiles) { mix(p.x); mix(p.y); }
  mix(world.rng.state);
  return (h >>> 0).toString(16);
}
