// Grafica temporanea: pixel art generata da codice al boot (nessun file esterno).
// Quando arriveranno gli sprite veri bastera' caricarli in BootScene con le stesse chiavi.

const PALETTE = {
  k: '#1b1626', // contorno
  s: '#c9d1e0', S: '#7f88a3', // acciaio
  r: '#e0484d', // pennacchio
  b: '#3f6fd1', B: '#2a4a91', // tunica
  w: '#7a5233', // cuoio / legno
  g: '#5bc45a', G: '#2f7d3b', l: '#b6f2a0', m: '#1f4f28', // slime
  p: '#8a4fc9', P: '#5a2f8f', y: '#ffe35c', o: '#9ff3ff', O: '#3fb8d6', // mago
};

const SPRITES = {
  player: [
    '.......rr.......',
    '......rrkk......',
    '.....kssssk.....',
    '....ksssssSk....',
    '....kskkkkSk....',
    '....kssyysSk....',
    '....kssssSSk....',
    '.....kkkkkk.....',
    '....kbbbbbBk....',
    '...ksbbbbbBSk...',
    '...kskbbbbkSk...',
    '....kbBbbBBk....',
    '....kwwwwwwk....',
    '....kBk..kBk....',
    '....kSk..kSk....',
    '....kkk..kkk....',
  ],
  chaser: [
    '................',
    '................',
    '................',
    '................',
    '......kkkk......',
    '....kkggggkk....',
    '...kgggggglgk...',
    '..kggggggggllk..',
    '..kggkggggkggk..',
    '.kgggkggggkgggk.',
    '.kggggggggggggk.',
    '.kgggggmmggggGk.',
    '.kGgggggggggGGk.',
    '..kGGGGGGGGGGk..',
    '...kkkkkkkkkk...',
    '................',
  ],
  ranged: [
    '................',
    '.......kk.......',
    '......kppk......',
    '.....kpppPk.....',
    '....kppppPPk....',
    '....kpkkkkPk....',
    '....kkykkykk..o.',
    '....kpkkkkPk.oOo',
    '...kppppppPPk.w.',
    '...kpPppppPPk.w.',
    '..kppPppppPPPkw.',
    '..kpppppppPPPkw.',
    '..kPPppppPPPPkw.',
    '...kPPPPPPPPk.w.',
    '....kkkkkkkk..w.',
    '..............w.',
  ],
  sword: [
    '..............',
    'kwwkssssssssk.',
    'kwwksssssssssk',
    '..............',
  ],
  door: [
    'kkkkkkkkkkkkkkkk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kkkkkkkkkkkkkkkk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kkkkkkkkkkkkkkkk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kSsSkSsSkSsSkSsk',
    'kkkkkkkkkkkkkkkk',
  ],
};

function fromStrings(scene, key, rows) {
  const h = rows.length;
  const w = rows[0].length;
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '.' || c === ' ') continue;
      ctx.fillStyle = PALETTE[c] || '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

// rumore deterministico per le texture (le tile non cambiano tra un avvio e l'altro)
function hash(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const TILE_INDEX = { floorA: 0, floorB: 1, wallTop: 2, wallFront: 3 };

function makeTiles(scene) {
  const tex = scene.textures.createCanvas('tiles', 16 * 4, 16);
  const ctx = tex.getContext();
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };

  // pavimento: lastre 8x8 con fughe e qualche puntino
  for (let v = 0; v < 2; v++) {
    const ox = v * 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = hash(x, y, v + 1);
        let c = n < 0.08 ? '#363247' : n > 0.94 ? '#24212f' : '#2c2939';
        if (x % 8 === 0 || y % 8 === 0) c = '#221f2c';
        px(ox + x, y, c);
      }
    }
    if (v === 1) {
      // crepa
      [[3, 10], [4, 11], [5, 11], [6, 12], [7, 12], [8, 13]].forEach(([x, y]) => px(ox + x, y, '#1a1822'));
    }
  }
  // muro visto dall'alto
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = hash(x, y, 7);
      px(32 + x, y, n < 0.1 ? '#3f3a55' : '#46405e');
    }
  }
  // facciata del muro: mattoni
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 4);
      const off = row % 2 ? 4 : 0;
      const mortar = y % 4 === 3 || (x + off) % 8 === 7;
      const n = hash(x, y, 11);
      let c = mortar ? '#2d2940' : n < 0.15 ? '#625b80' : '#575073';
      if (y === 0) c = '#6f6891'; // bordo illuminato
      if (y >= 14) c = mortar ? '#221f30' : '#3d3854'; // ombra alla base
      px(48 + x, y, c);
    }
  }
  tex.refresh();
}

function makeBoss(scene) {
  const S = 32;
  const tex = scene.textures.createCanvas('boss', S, S);
  const ctx = tex.getContext();
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  const cx = 15.5;
  // corpo: ellisse con ombreggiatura verticale e contorno
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - cx) / 13;
      const dy = (y - 18) / 12.5;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      let c = y < 14 ? '#c2414b' : y < 22 ? '#9e2f3c' : '#74202e';
      if (d > 0.82) c = '#1b1626';
      px(x, y, c);
    }
  }
  // corna
  const horn = (sx, dir) => {
    for (let i = 0; i < 7; i++) {
      for (let t = 0; t < 3 - Math.floor(i / 3); t++) px(sx + dir * (i + t), 8 - i, i > 4 ? '#f1e6c8' : '#d8c9a3');
    }
  };
  horn(6, -1);
  horn(25, 1);
  // occhi
  [[10, 14], [11, 14], [20, 14], [21, 14], [10, 15], [21, 15]].forEach(([x, y]) => px(x, y, '#ffe35c'));
  [[11, 15], [20, 15]].forEach(([x, y]) => px(x, y, '#1b1626'));
  // bocca con denti
  for (let x = 11; x <= 20; x++) px(x, 21, '#1b1626');
  for (let x = 11; x <= 20; x++) px(x, 22, x % 2 ? '#f1e6c8' : '#1b1626');
  for (let x = 12; x <= 19; x++) px(x, 23, '#1b1626');
  tex.refresh();
}

function makeMisc(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // ombra
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(8, 3, 14, 5);
  g.generateTexture('shadow', 16, 6);
  g.clear();

  // proiettile nemico
  g.fillStyle(0x1b1626, 1);
  g.fillCircle(4, 4, 4);
  g.fillStyle(0xff8a3d, 1);
  g.fillCircle(4, 4, 3);
  g.fillStyle(0xffe35c, 1);
  g.fillCircle(4, 4, 1.5);
  g.generateTexture('orb', 8, 8);
  g.clear();

  // fendente: arco bianco (ruotato dal client verso la mira)
  g.lineStyle(3, 0xffffff, 1);
  g.beginPath();
  g.arc(4, 20, 18, -1.0, 1.0, false);
  g.strokePath();
  g.lineStyle(1, 0xbfe6ff, 1);
  g.beginPath();
  g.arc(4, 20, 14, -0.8, 0.8, false);
  g.strokePath();
  g.generateTexture('slash', 26, 40);
  g.clear();

  // particella
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 2, 2);
  g.generateTexture('px', 2, 2);
  g.destroy();
}

export function buildTextures(scene) {
  makeTiles(scene);
  makeBoss(scene);
  makeMisc(scene);
  for (const [key, rows] of Object.entries(SPRITES)) fromStrings(scene, key, rows);
}
