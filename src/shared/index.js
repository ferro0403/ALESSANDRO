// Punto d'ingresso della logica condivisa (client oggi, server domani).
export * from './constants.js';
export { Rng, subSeed, randomSeed } from './rng.js';
export { generateDungeon, validateDungeon, dungeonHash, roomAtPixel, roomInteriorPx, roomCenterPx } from './dungeon.js';
export { createWorld, step, getPlayer, getBoss, sanitizeInput } from './world.js';
