import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import GameScene from './scenes/GameScene.js';
import HudScene from './scenes/HudScene.js';
import EndScene from './scenes/EndScene.js';

// Il canvas e' 768x480; la GameScene usa zoom 2 (una stanza = 384x240 px di mondo),
// la HUD resta a zoom 1 cosi' il testo e' nitido.
export const VIEW_W = 768;
export const VIEW_H = 480;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#0d0b14',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, GameScene, HudScene, EndScene], // l'ordine e' l'ordine di disegno
});

Object.assign(window, { game }); // per lo smoke test e il debug da console
