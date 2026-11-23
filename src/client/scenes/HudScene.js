import Phaser from 'phaser';

const FONT = { fontFamily: 'monospace', fontStyle: 'bold' };

/**
 * HUD a zoom 1 (testo nitido). Guidata da eventi: ascolta le modifiche del registry invece
 * di interrogare il mondo ogni frame. Nessun riferimento alla simulazione.
 */
export default class HudScene extends Phaser.Scene {
  constructor() {
    super('hud');
  }

  create() {
    const { width, height } = this.scale;
    this.ghostHp = 1;

    // barra vita
    this.add.text(16, 8, 'GUERRIERO', { ...FONT, fontSize: '12px', color: '#c9d1e0' }).setShadow(1, 1, '#000', 0);
    this.hpBar = this.add.graphics();
    this.hpText = this.add.text(16 + 104, 38, '', { ...FONT, fontSize: '11px', color: '#ffffff' }).setOrigin(0.5, 0.5);
    this.roomsText = this.add.text(width - 16, 12, '', { ...FONT, fontSize: '12px', color: '#c9d1e0' }).setOrigin(1, 0);
    this.seedText = this.add.text(width - 16, 30, '', { ...FONT, fontSize: '10px', color: '#6f6891' }).setOrigin(1, 0);

    // barra boss
    this.bossBar = this.add.graphics();
    this.bossName = this.add.text(width / 2, height - 44, 'GUARDIANO DELLA CRIPTA', { ...FONT, fontSize: '12px', color: '#ffb0b0' })
      .setOrigin(0.5, 1).setVisible(false);

    // messaggi al centro
    this.msg = this.add.text(width / 2, 70, '', { ...FONT, fontSize: '16px', color: '#ffe35c', align: 'center' })
      .setOrigin(0.5).setAlpha(0).setShadow(2, 2, '#000', 0);

    // aiuto comandi, sparisce dopo qualche secondo
    const help = this.add.text(width / 2, height - 14,
      'WASD muovi  ·  mouse mira  ·  clic sinistro attacca  ·  K intensità scossa',
      { ...FONT, fontSize: '11px', color: '#c9d1e0', backgroundColor: '#0d0b14cc', padding: { x: 8, y: 4 } })
      .setOrigin(0.5, 1);
    this.tweens.add({ targets: help, alpha: 0, delay: 7000, duration: 1200 });

    const onChange = () => this.redraw();
    this.registry.events.on('changedata', onChange);
    const onMessage = (text) => this.showMessage(text);
    this.events.on('message', onMessage);
    // il registry sopravvive alle scene: togli i listener o si accumulano a ogni partita
    this.events.once('shutdown', () => {
      this.registry.events.off('changedata', onChange);
      this.events.off('message', onMessage);
    });

    this.redraw();
    this.showMessage('Ripulisci le stanze e sconfiggi il guardiano!');
  }

  update(_time, delta) {
    // la barra "fantasma" scende lentamente dietro quella vera: si legge quanto hai perso
    const hp = this.hpRatio();
    if (this.ghostHp > hp) {
      this.ghostHp = Math.max(hp, this.ghostHp - (delta / 1000) * 0.6);
      this.drawHp();
    } else if (this.ghostHp < hp) {
      this.ghostHp = hp;
    }
  }

  hpRatio() {
    const max = this.registry.get('maxHp') || 1;
    return Math.max(0, (this.registry.get('hp') ?? max) / max);
  }

  drawHp() {
    const g = this.hpBar;
    const x = 16;
    const y = 30;
    const w = 208;
    const h = 16;
    g.clear();
    g.fillStyle(0x0d0b14, 1).fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle(0x3a1d27, 1).fillRect(x, y, w, h);
    g.fillStyle(0xffffff, 0.85).fillRect(x, y, w * this.ghostHp, h);
    const ratio = this.hpRatio();
    const color = ratio > 0.5 ? 0x5bc45a : ratio > 0.25 ? 0xffb23d : 0xe0484d;
    g.fillStyle(color, 1).fillRect(x, y, w * ratio, h);
    g.fillStyle(0xffffff, 0.25).fillRect(x, y, w * ratio, 4);
  }

  redraw() {
    const r = this.registry;
    this.drawHp();
    this.hpText.setText(`${Math.ceil(r.get('hp') ?? 0)} / ${r.get('maxHp') ?? 0}`);
    this.roomsText.setText(`Stanze ripulite: ${r.get('rooms') ?? 0}/${r.get('roomsTotal') ?? 0}`);
    this.seedText.setText(`seed ${r.get('seed') ?? ''}`);

    const active = !!r.get('bossActive');
    this.bossName.setVisible(active);
    this.bossBar.clear();
    if (active) {
      const { width, height } = this.scale;
      const w = 360;
      const x = (width - w) / 2;
      const y = height - 38;
      this.bossBar.fillStyle(0x0d0b14, 1).fillRect(x - 2, y - 2, w + 4, 14);
      this.bossBar.fillStyle(0x3a1d27, 1).fillRect(x, y, w, 10);
      this.bossBar.fillStyle(0xe0484d, 1).fillRect(x, y, w * Math.max(0, r.get('bossHp') ?? 0), 10);
    }
  }

  showMessage(text) {
    this.tweens.killTweensOf(this.msg);
    this.msg.setText(text).setAlpha(1).setScale(1.25);
    this.tweens.add({ targets: this.msg, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.msg, alpha: 0, delay: 2200, duration: 600 });
  }
}
