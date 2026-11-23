// Costanti di gioco condivise. Nessun import di Phaser: questo modulo gira anche in Node
// (test oggi, server autoritativo domani).

export const TILE = 16;

// Ogni stanza occupa una "cella" della griglia del dungeon, grande quanto una schermata.
export const CELL_W = 24; // tile
export const CELL_H = 15; // tile
export const GRID_W = 5; // celle
export const GRID_H = 5;
export const ROOM_COUNT = 6; // stanza iniziale + 4 normali + boss
export const MIN_BOSS_DEPTH = 3; // il boss e' almeno a 3 porte dalla partenza

export const TILE_VOID = 0;
export const TILE_FLOOR = 1;
export const TILE_WALL = 2;
export const TILE_DOOR = 3;

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export const PLAYER = {
  radius: 5,
  speed: 95,
  maxHp: 100,
  attackCooldown: 0.38,
  attackRange: 26, // dal centro del giocatore al bordo del nemico
  attackArc: Math.PI * 0.65, // ampiezza totale del fendente
  attackDamage: 20,
  swingTime: 0.14, // solo per la grafica del fendente
  invulnTime: 0.8,
  hurtKnockback: 190,
  hurtStun: 0.15,
};

export const ENEMIES = {
  chaser: {
    radius: 6,
    maxHp: 40,
    speed: 52,
    contactDamage: 10,
    knockbackTaken: 230,
    reaction: [0.35, 0.8], // ritardo prima di reagire (non onnisciente)
  },
  ranged: {
    radius: 6,
    maxHp: 30,
    speed: 42,
    contactDamage: 6,
    knockbackTaken: 260,
    reaction: [0.5, 1.0],
    nearEnter: 64, // troppo vicino: scappa
    nearExit: 84, // isteresi
    farEnter: 140, // troppo lontano: si avvicina
    farExit: 115,
    fireCooldown: [1.6, 2.4],
    windup: 0.5, // telegrafo prima dello sparo
    projectileSpeed: 120,
    projectileDamage: 12,
  },
  boss: {
    radius: 13,
    maxHp: 520,
    speed: 38,
    speedEnraged: 52,
    contactDamage: 18,
    knockbackTaken: 70,
    reaction: [0.8, 0.8],
    chaseTime: 2.2,
    windup: 0.7,
    projectileSpeed: 105,
    projectileDamage: 14,
  },
};

export const KNOCKBACK_DAMPING = 11; // per secondo (decadimento esponenziale)
export const HIT_STUN = 0.16;
export const FLASH_TIME = 0.09;
