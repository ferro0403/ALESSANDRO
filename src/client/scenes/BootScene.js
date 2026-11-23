import Phaser from 'phaser';
import { buildTextures } from '../textures.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    buildTextures(this);
    const params = new URLSearchParams(window.location.search);
    const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : undefined;
    this.scene.start('game', { seed });
  }
}
