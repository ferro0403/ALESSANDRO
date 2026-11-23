# Dungeon Coop

Dungeon crawler cooperativo 2D con visuale dall'alto, in pixel art, giocabile nel browser.
Phaser 3.90 + Vite. **Fase 1: single player.**

## Comandi

| Tasto | Azione |
|---|---|
| WASD | muovi |
| mouse | mira |
| clic sinistro (tenuto) | attacca |
| K | intensità screen shake (100% / 50% / spento) |
| INVIO / clic | nuova partita (dalla schermata finale) |
| R | riprova lo stesso seed |

Puoi forzare un dungeon con `?seed=12345` nell'URL: lo stesso seed genera sempre lo stesso dungeon.

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # test della logica (Node, senza browser)
npm run build    # build di produzione in dist/
```

Smoke test nel browser (serve Playwright): `npm run build && npx vite preview --port 4173`,
poi `npm run smoke -- http://localhost:4173/?seed=12345`.

## Architettura (pronta per il multiplayer)

```
src/shared/   logica di gioco pura: nessun import di Phaser, gira anche in Node
  rng.js        PRNG deterministico (splitmix32) + sotto-seed per scopo
  dungeon.js    generatore procedurale -> solo dati (griglia + stanze + porte), validato
  grid.js       collisioni con le tile, linea di vista, flow field per l'IA
  entities.js   factory di entità come oggetti piatti serializzabili
  combat.js     danni, knockback, proiettili, eventi
  ai.js         FSM dei nemici (inseguitore, a distanza, boss)
  world.js      createWorld() + step(world, inputs) a passo fisso 60 Hz
src/client/   solo presentazione: legge l'input, chiama step(), disegna lo stato
  scenes/       Boot (texture), Game (render + feedback), Hud, End
  feedback.js   screen shake a "trauma" e hit-stop
  textures.js   pixel art temporanea generata da codice
test/         test con node --test
```

- La simulazione riceve gli input come `{ p1: { mx, my, ax, ay, attack } }` ed è
  deterministica (stesso seed + stessi input = stesso stato), testato.
- Non usa mai `Math.random` né il tempo reale; emette **eventi** (`enemyHit`, `roomLocked`,
  `playerHurt`...) che il client trasforma in shake, flash e particelle.
- Le entità sono oggetti piatti e i giocatori sono già una lista (`playerIds`): per l'online
  `step()` girerà su un server Node autoritativo e i client riceveranno snapshot + eventi.

## Deploy su Netlify

Il file `netlify.toml` è già configurato (`npm run build`, pubblica `dist/`, Node 22).
Su Netlify: *Add new site → Import from Git*, scegli il repository e il branch; le
anteprime dei branch e delle pull request vengono create automaticamente.
