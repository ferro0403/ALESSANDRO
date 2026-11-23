// Screen shake a "trauma" (skill game-feel): gli eventi AGGIUNGONO trauma, che decade in
// tempo reale; lo spostamento e' trauma^2, quindi i colpi leggeri si sentono appena e quelli
// forti picchiano. Somma di seni a frequenze diverse: niente ronzio casuale per frame.
// Solo grafica: la simulazione non sa nulla dello shake.

const STRENGTHS = [1, 0.5, 0];
const STORAGE_KEY = 'dungeon-shake';

export class Shake {
  constructor({ maxOffset = 6, decay = 1.6 } = {}) {
    this.maxOffset = maxOffset;
    this.decay = decay;
    this.trauma = 0;
    this.t = 0;
    this.level = 0;
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved >= 0 && saved < STRENGTHS.length) this.level = saved;
    } catch { /* storage non disponibile: va bene il default */ }
  }

  get strength() {
    return STRENGTHS[this.level];
  }

  /** Accessibilita': 100% -> 50% -> spento. Ritorna la percentuale. */
  cycle() {
    this.level = (this.level + 1) % STRENGTHS.length;
    try { localStorage.setItem(STORAGE_KEY, String(this.level)); } catch { /* ignora */ }
    return Math.round(this.strength * 100);
  }

  add(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** realDt in secondi. Ritorna l'offset {x,y} in pixel di mondo. */
  update(realDt) {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    this.trauma = Math.max(0, this.trauma - this.decay * realDt);
    this.t += realDt * 30;
    const s = this.trauma * this.trauma * this.strength * this.maxOffset;
    return {
      x: s * (0.6 * Math.sin(this.t * 1.7) + 0.4 * Math.sin(this.t * 3.1 + 1.3)),
      y: s * (0.6 * Math.sin(this.t * 2.3 + 0.7) + 0.4 * Math.sin(this.t * 3.7)),
    };
  }
}

/** Hit-stop: congela la simulazione per qualche ms di tempo reale. Vince la scadenza piu' lontana. */
export class HitStop {
  constructor() {
    this.until = 0;
  }

  trigger(now, ms) {
    this.until = Math.max(this.until, now + ms);
  }

  active(now) {
    return now < this.until;
  }
}
