import Phaser from 'phaser';
import {
  createWorld, step, getPlayer, getBoss, randomSeed, roomAtPixel, roomCenterPx,
  SIM_DT, TILE, TILE_WALL, TILE_FLOOR, TILE_DOOR, ROOM_COUNT, PLAYER,
} from '../../shared/index.js';
import { TILE_INDEX } from '../textures.js';
import { Shake, HitStop } from '../feedback.js';

const LOCAL_PLAYER = 'p1';
const ZOOM = 2;
const MAX_STEPS_PER_FRAME = 5; // evita la "spirale della morte" se il tab rallenta

const PARTICLE_COLORS = {
  chaser: [0x5bc45a, 0xb6f2a0],
  ranged: [0x8a4fc9, 0xffe35c],
  boss: [0xe0484d, 0xffe35c],
  player: [0xe0484d, 0xffffff],
  wall: [0xff8a3d, 0xffe35c],
};

/**
 * La scena di gioco e' solo un renderer + raccolta input:
 *  - legge l'input locale e lo passa a step() a passo fisso (60 Hz)
 *  - disegna lo stato del mondo interpolando tra due passi
 *  - trasforma gli eventi della simulazione in feedback (shake, flash, particelle)
 * Con il multiplayer, step() girera' sul server e qui arriveranno snapshot + eventi.
 */
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    // stato della run: si azzera a ogni (ri)avvio della scena
    this.seed = data && Number.isFinite(data.seed) ? data.seed >>> 0 : randomSeed();
    this.world = createWorld({ seed: this.seed, playerIds: [LOCAL_PLAYER] });
    this.acc = 0;
    this.views = new Map(); // id entita' -> { sprite, shadow, extra }
    this.projViews = new Map();
    this.shake = new Shake();
    this.hitStop = new HitStop();
    this.endQueued = false;
    this.startTime = 0;
  }

  create() {
    const w = this.world;
    this.startTime = this.time.now;
    this.buildMap();
    this.buildDoors();

    this.fx = {};
    for (const [k, colors] of Object.entries(PARTICLE_COLORS)) {
      this.fx[k] = this.add.particles(0, 0, 'px', {
        speed: { min: 40, max: 150 },
        lifespan: { min: 200, max: 420 },
        scale: { start: 1.4, end: 0 },
        tint: colors,
        emitting: false,
      }).setDepth(9000);
    }
    this.hpBars = this.add.graphics().setDepth(9500);

    // input
    this.keys = this.input.keyboard.addKeys('W,A,S,D,K');
    this.input.mouse?.disableContextMenu();
    this.keys.K.on('down', () => this.hud('message', `Scossa schermo: ${this.shake.cycle()}%`));

    // camera: una stanza per schermata, scorrimento morbido tra le stanze
    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBackgroundColor('#0d0b14');
    const p = getPlayer(w, LOCAL_PLAYER);
    const c = roomCenterPx(w.dungeon.rooms[p.roomId]);
    this.camPos = { x: c.x, y: c.y };
    cam.centerOn(c.x, c.y);

    // HUD
    this.registry.set('hp', p.hp);
    this.registry.set('maxHp', p.maxHp);
    this.registry.set('rooms', 0);
    this.registry.set('roomsTotal', ROOM_COUNT - 1);
    this.registry.set('bossActive', false);
    this.registry.set('bossHp', 1);
    this.registry.set('seed', this.seed);
    if (!this.scene.isActive('hud')) this.scene.launch('hud');
    else this.scene.get('hud').scene.restart();
    this.scene.bringToTop('hud');

    this.syncViews(0);
  }

  hud(type, payload) {
    this.scene.get('hud')?.events.emit(type, payload);
  }

  // ------------------------------------------------------------------------ mappa e porte
  buildMap() {
    const d = this.world.dungeon;
    const data = [];
    for (let y = 0; y < d.height; y++) {
      const row = [];
      for (let x = 0; x < d.width; x++) {
        const t = d.tiles[y * d.width + x];
        if (t === TILE_FLOOR || t === TILE_DOOR) {
          row.push((x * 7 + y * 13) % 11 === 0 ? TILE_INDEX.floorB : TILE_INDEX.floorA);
        } else if (t === TILE_WALL) {
          const below = y + 1 < d.height ? d.tiles[(y + 1) * d.width + x] : 0;
          row.push(below === TILE_FLOOR || below === TILE_DOOR ? TILE_INDEX.wallFront : TILE_INDEX.wallTop);
        } else {
          row.push(-1);
        }
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    map.createLayer(0, tileset, 0, 0).setDepth(-10);
  }

  buildDoors() {
    this.doorViews = this.world.dungeon.doors.map((door) =>
      door.tiles.map(([tx, ty]) =>
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE, 'door')
          .setOrigin(0.5, 1)
          .setDepth(ty * TILE + TILE)
          .setVisible(false),
      ),
    );
  }

  setDoorVisual(doorId, closed) {
    for (const img of this.doorViews[doorId]) {
      this.tweens.killTweensOf(img);
      if (closed) {
        img.setVisible(true).setScale(1, 0);
        this.tweens.add({ targets: img, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
      } else {
        this.tweens.add({ targets: img, scaleY: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => img.setVisible(false) });
      }
    }
  }

  // ----------------------------------------------------------------------------- input
  readInput() {
    const k = this.keys;
    const mx = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    const my = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    const ptr = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    return { mx, my, ax: wp.x, ay: wp.y, attack: ptr.leftButtonDown() };
  }

  // ------------------------------------------------------------------------------ loop
  update(time, delta) {
    const realDt = Math.min(delta, 100) / 1000;

    // Hit-stop: in single player congeliamo la simulazione locale. Online diventera' solo
    // un effetto visivo lato client (il server non si ferma per un colpo).
    if (!this.hitStop.active(time) && this.world.status === 'playing') {
      this.acc += realDt;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
        step(this.world, { [LOCAL_PLAYER]: this.readInput() });
        this.handleEvents(this.world.events, time);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }

    const alpha = this.hitStop.active(time) ? 1 : Math.min(this.acc / SIM_DT, 1);
    this.syncViews(alpha, time);
    this.updateCamera(realDt);

    if (this.world.status !== 'playing' && !this.endQueued) {
      this.endQueued = true;
      const won = this.world.status === 'won';
      this.time.delayedCall(won ? 1400 : 1100, () => this.showEnd(won));
    }
  }

  updateCamera(realDt) {
    const p = getPlayer(this.world, LOCAL_PLAYER);
    const rid = roomAtPixel(this.world.dungeon, p.x, p.y);
    if (rid !== -1) {
      const c = roomCenterPx(this.world.dungeon.rooms[rid]);
      const k = 1 - Math.exp(-realDt * 9);
      this.camPos.x += (c.x - this.camPos.x) * k;
      this.camPos.y += (c.y - this.camPos.y) * k;
    }
    const off = this.shake.update(realDt);
    this.cameras.main.centerOn(this.camPos.x + off.x, this.camPos.y + off.y);
  }

  showEnd(won) {
    const s = this.world.stats;
    this.scene.stop('hud');
    this.scene.launch('end', {
      won,
      seed: this.seed,
      rooms: s.roomsCleared,
      roomsTotal: ROOM_COUNT - 1,
      kills: s.kills,
      time: (this.time.now - this.startTime) / 1000,
    });
    this.scene.pause();
  }

  // --------------------------------------------------------------------- eventi -> feedback
  handleEvents(events, now) {
    for (const ev of events) {
      switch (ev.type) {
        case 'swing': {
          const s = this.add.image(ev.x, ev.y, 'slash')
            .setOrigin(4 / 26, 0.5)
            .setRotation(ev.angle)
            .setDepth(ev.y + 20)
            .setScale(0.7)
            .setAlpha(0.95);
          this.tweens.add({ targets: s, scale: 1.05, alpha: 0, duration: 160, ease: 'Cubic.easeOut', onComplete: () => s.destroy() });
          break;
        }
        case 'enemyHit':
          this.shake.add(ev.kind === 'boss' ? 0.14 : 0.2);
          this.fx[ev.kind].explode(ev.kind === 'boss' ? 6 : 8, ev.x, ev.y);
          this.hitStop.trigger(now, ev.kind === 'boss' ? 25 : 40);
          this.popView(ev.id, ev.dirX, ev.dirY);
          break;
        case 'enemyDied':
          this.shake.add(ev.kind === 'boss' ? 1 : 0.3);
          this.fx[ev.kind].explode(ev.kind === 'boss' ? 48 : 16, ev.x, ev.y);
          this.hitStop.trigger(now, ev.kind === 'boss' ? 160 : 60);
          this.deathPuff(ev.id);
          if (ev.kind === 'boss') this.cameras.main.flash(250, 255, 240, 200);
          break;
        case 'playerHurt':
          this.shake.add(0.45);
          this.fx.player.explode(10, ev.x, ev.y);
          this.hitStop.trigger(now, 70);
          this.cameras.main.flash(120, 120, 0, 0);
          if (ev.playerId === LOCAL_PLAYER) this.registry.set('hp', ev.hp);
          break;
        case 'playerDied':
          this.shake.add(0.8);
          this.fx.player.explode(30, ev.x, ev.y);
          this.hitStop.trigger(now, 160);
          this.deathPuff(ev.id);
          break;
        case 'bossPhase':
          this.shake.add(0.7);
          this.hitStop.trigger(now, 150);
          this.cameras.main.flash(200, 160, 20, 30);
          this.hud('message', 'Il guardiano è furioso!');
          break;
        case 'enemyShoot':
          if (ev.kind === 'boss') this.shake.add(ev.radial ? 0.25 : 0.12);
          break;
        case 'projectileWall':
          this.fx.wall.explode(3, ev.x, ev.y);
          break;
        case 'doorClosed':
          this.setDoorVisual(ev.doorId, true);
          break;
        case 'doorOpened':
          this.setDoorVisual(ev.doorId, false);
          break;
        case 'roomLocked':
          this.shake.add(0.25);
          this.wakeRoom(ev.roomId);
          if (ev.boss) {
            this.registry.set('bossActive', true);
            this.hud('message', 'Il Guardiano della Cripta si risveglia!');
          }
          break;
        case 'roomCleared':
          this.registry.set('rooms', this.world.stats.roomsCleared);
          if (!ev.boss) this.hud('message', 'Stanza ripulita! Le porte si aprono.');
          break;
        case 'victory':
          this.registry.set('bossActive', false);
          break;
      }
    }
    const boss = getBoss(this.world);
    if (boss) this.registry.set('bossHp', boss.hp / boss.maxHp);
    else if (this.registry.get('bossActive')) this.registry.set('bossHp', 0);
  }

  popView(id, dx, dy) {
    const v = this.views.get(id);
    if (!v) return;
    // squash nella direzione del colpo, poi ritorno esatto a 1
    v.sprite.setScale(1 + Math.abs(dx) * 0.35 - Math.abs(dy) * 0.2, 1 + Math.abs(dy) * 0.35 - Math.abs(dx) * 0.2);
    this.tweens.add({ targets: v.sprite, scaleX: 1, scaleY: 1, duration: 140, ease: 'Back.easeOut' });
  }

  deathPuff(id) {
    const v = this.views.get(id);
    if (!v) return;
    const ghost = this.add.image(v.sprite.x, v.sprite.y, v.sprite.texture.key)
      .setOrigin(0.5, 1)
      .setTintFill(0xffffff)
      .setDepth(v.sprite.depth)
      .setFlipX(v.sprite.flipX);
    this.tweens.add({ targets: ghost, scaleX: 1.6, scaleY: 0.2, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => ghost.destroy() });
  }

  wakeRoom(roomId) {
    for (const e of this.world.entities) {
      if (e.team !== 'enemies' || e.roomId !== roomId) continue;
      const v = this.views.get(e.id);
      if (!v) continue;
      v.sprite.setScale(1.3, 0.7);
      this.tweens.add({ targets: v.sprite, scaleX: 1, scaleY: 1, duration: 300, ease: 'Back.easeOut', delay: (e.id % 5) * 40 });
    }
  }

  // ---------------------------------------------------------------------------- rendering
  makeView(e) {
    const tex = e.kind === 'player' ? 'player' : e.kind;
    const shadow = this.add.image(e.x, e.y, 'shadow').setScale(e.kind === 'boss' ? 2.2 : 1);
    const sprite = this.add.image(e.x, e.y, tex).setOrigin(0.5, 1);
    const view = { sprite, shadow, extra: null };
    if (e.kind === 'player') view.extra = this.add.image(e.x, e.y, 'sword').setOrigin(2 / 14, 0.5);
    this.views.set(e.id, view);
    return view;
  }

  syncViews(alpha, time = 0) {
    const w = this.world;
    const seen = new Set();
    this.hpBars.clear();

    for (const e of w.entities) {
      seen.add(e.id);
      const v = this.views.get(e.id) || this.makeView(e);
      if (!e.alive) {
        v.sprite.setVisible(false);
        v.shadow.setVisible(false);
        v.extra?.setVisible(false);
        continue;
      }
      const x = e.prevX + (e.x - e.prevX) * alpha;
      const y = e.prevY + (e.y - e.prevY) * alpha;
      const foot = y + e.r; // i piedi stanno sul bordo basso del corpo
      let bob = 0;
      if (e.kind === 'player' && e.moving) bob = Math.abs(Math.sin(time * 0.018)) * -1.5;
      else if (e.kind === 'chaser') bob = Math.sin(time * 0.012 + e.id) * 0.8;
      v.sprite.setPosition(x, foot + bob).setDepth(foot);
      v.shadow.setPosition(x, foot - 1).setDepth(foot - 0.5);

      // tinta: flash bianco su colpo > telegrafo > normale
      if (e.flash > 0) v.sprite.setTintFill(0xffffff);
      else if (e.charging > 0) {
        const blink = Math.floor(time / 70) % 2 === 0;
        if (e.kind === 'boss') v.sprite.setTint(blink ? 0xff3030 : 0xffb0b0);
        else v.sprite.setTint(blink ? 0xffe35c : 0xffffff);
      } else if (e.kind === 'boss' && e.enraged) v.sprite.setTint(0xffa0a0);
      else v.sprite.clearTint();

      if (e.kind === 'player') {
        const left = Math.cos(e.facing) < 0;
        v.sprite.setFlipX(left);
        v.sprite.setAlpha(e.invuln > 0 && Math.floor(time / 60) % 2 === 0 ? 0.35 : 1);
        let angle = e.facing + (left ? -1.1 : 1.1);
        if (e.swing > 0) {
          const t = 1 - e.swing / PLAYER.swingTime;
          angle = e.facing - PLAYER.attackArc / 2 + PLAYER.attackArc * t;
        }
        v.extra.setPosition(x, y - 2).setRotation(angle).setDepth(foot + (Math.sin(angle) > 0 ? 1 : -1));
        v.extra.setAlpha(v.sprite.alpha);
        if (e.playerId === LOCAL_PLAYER) this.registry.set('hp', e.hp);
      } else {
        v.sprite.setFlipX(Math.cos(e.facing) < 0);
        if (e.kind !== 'boss' && e.hp < e.maxHp) {
          const bw = 12;
          this.hpBars.fillStyle(0x1b1626, 1).fillRect(x - bw / 2 - 1, foot - 19, bw + 2, 3);
          this.hpBars.fillStyle(0xe0484d, 1).fillRect(x - bw / 2, foot - 18, bw * (e.hp / e.maxHp), 1);
        }
      }
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      v.sprite.destroy();
      v.shadow.destroy();
      v.extra?.destroy();
      this.views.delete(id);
    }

    // proiettili
    const seenP = new Set();
    for (const p of w.projectiles) {
      seenP.add(p.id);
      let img = this.projViews.get(p.id);
      if (!img) {
        img = this.add.image(p.x, p.y, 'orb');
        this.projViews.set(p.id, img);
      }
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      img.setPosition(x, y).setDepth(y + 8).setRotation(time * 0.02);
    }
    for (const [id, img] of this.projViews) {
      if (seenP.has(id)) continue;
      img.destroy();
      this.projViews.delete(id);
    }
  }
}
