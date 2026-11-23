import Phaser from 'phaser';
import { randomSeed } from '../../shared/index.js';

const FONT = { fontFamily: 'monospace', fontStyle: 'bold' };

/** Schermata di vittoria / game over sopra la partita congelata. */
export default class EndScene extends Phaser.Scene {
  constructor() {
    super('end');
  }

  create(data) {
    const { width, height } = this.scale;
    this.leaving = false; // l'istanza della scena viene riusata: azzera lo stato
    const won = !!data.won;

    this.add.rectangle(0, 0, width, height, 0x0d0b14, 0.78).setOrigin(0);

    const title = this.add.text(width / 2, height / 2 - 90, won ? 'VITTORIA!' : 'GAME OVER', {
      ...FONT, fontSize: '48px', color: won ? '#ffe35c' : '#e0484d',
    }).setOrigin(0.5).setShadow(4, 4, '#000', 0).setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });

    const sub = won ? 'Il Guardiano della Cripta è caduto.' : 'Il dungeon ha avuto la meglio... per ora.';
    this.add.text(width / 2, height / 2 - 38, sub, { ...FONT, fontSize: '14px', color: '#c9d1e0' }).setOrigin(0.5);

    const mins = Math.floor(data.time / 60);
    const secs = String(Math.floor(data.time % 60)).padStart(2, '0');
    const stats = [
      `Stanze ripulite   ${data.rooms}/${data.roomsTotal}`,
      `Nemici sconfitti  ${data.kills}`,
      `Tempo             ${mins}:${secs}`,
      `Seed              ${data.seed}`,
    ].join('\n');
    this.add.text(width / 2, height / 2 + 30, stats, { ...FONT, fontSize: '13px', color: '#ffffff', lineSpacing: 6 }).setOrigin(0.5);

    const hint = this.add.text(width / 2, height - 60,
      'CLIC o INVIO: nuovo dungeon   ·   R: riprova lo stesso seed',
      { ...FONT, fontSize: '13px', color: '#ffe35c' }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });

    // piccola attesa: un clic d'attacco in corso non deve saltare la schermata
    this.time.delayedCall(600, () => {
      this.input.once('pointerdown', () => this.restart(randomSeed()));
      this.input.keyboard.once('keydown-ENTER', () => this.restart(randomSeed()));
      this.input.keyboard.once('keydown-R', () => this.restart(data.seed));
    });
  }

  restart(seed) {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('game', { seed });
  }
}
