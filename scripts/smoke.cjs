// Smoke test nel browser headless (skill phaser-core). Uso:
//   npm run build && npx vite preview --port 4173 &   poi   node scripts/smoke.cjs http://localhost:4173
// Richiede playwright + chromium. Fallisce su qualsiasi errore in console, salva screenshot.
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'http://localhost:4173/?seed=12345';
  const out = process.argv[3] || '.';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1152, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(url);
  await page.waitForFunction(() => window.game?.isRunning && window.game.scene.isActive('game'), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({
    renderer: window.game.config.renderType === 2 ? 'webgl' : 'canvas',
    scenes: window.game.scene.getScenes(true).map((s) => s.sys.settings.key),
  }));
  await page.screenshot({ path: `${out}/smoke-1-start.png` });

  // cammina verso destra/il basso tenendo premuto D e attaccando, per provare input reali
  await page.mouse.move(900, 360);
  await page.keyboard.down('D');
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.keyboard.up('D');

  // teletrasporta il giocatore in una stanza normale per vedere il combattimento
  await page.evaluate(() => {
    const s = window.game.scene.getScene('game');
    const w = s.world;
    const room = w.dungeon.rooms.find((r) => r.kind === 'normal');
    const p = w.entities.find((e) => e.kind === 'player');
    p.x = (room.ox + 12) * 16 + 8; p.y = (room.oy + 12) * 16 + 8; p.prevX = p.x; p.prevY = p.y;
    p.invuln = 1e9;
  });
  await page.waitForTimeout(1500);
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await page.screenshot({ path: `${out}/smoke-2-fight.png` });

  // stanza del boss
  await page.evaluate(() => {
    const w = window.game.scene.getScene('game').world;
    const room = w.dungeon.rooms[w.dungeon.bossRoom];
    const p = w.entities.find((e) => e.kind === 'player');
    p.x = (room.ox + 12) * 16; p.y = (room.oy + 11) * 16 + 8; p.prevX = p.x; p.prevY = p.y;
  });
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${out}/smoke-3-boss.png` });

  // vittoria
  await page.evaluate(() => {
    const w = window.game.scene.getScene('game').world;
    const boss = w.entities.find((e) => e.kind === 'boss');
    boss.hp = 1;
    const p = w.entities.find((e) => e.kind === 'player');
    p.x = boss.x; p.y = boss.y + 22; p.prevX = p.x; p.prevY = p.y;
  });
  const bossScreen = await page.evaluate(() => {
    const s = window.game.scene.getScene('game');
    const w = s.world;
    const boss = w.entities.find((e) => e.kind === 'boss');
    const cam = s.cameras.main;
    // coordinate schermo del boss (canvas 768x480 scalato a 1152x720 -> x1.5)
    return { x: (boss.x - cam.worldView.x) * 2 * 1.5, y: (boss.y - cam.worldView.y) * 2 * 1.5 };
  });
  await page.mouse.move(bossScreen.x, bossScreen.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForFunction(() => window.game.scene.isActive('end'), null, { timeout: 5000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/smoke-4-victory.png` });

  // nuova partita e sconfitta
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.scene.isActive('game') && !window.game.scene.isActive('end'), null, { timeout: 5000 });
  await page.evaluate(() => {
    const w = window.game.scene.getScene('game').world;
    const p = w.entities.find((e) => e.kind === 'player');
    p.hp = 0; p.alive = false;
  });
  await page.waitForFunction(() => window.game.scene.isActive('end'), null, { timeout: 5000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/smoke-5-gameover.png` });

  await browser.close();
  console.log(JSON.stringify({ ...info, errors }, null, 2));
  process.exit(errors.length ? 1 : 0);
})();
