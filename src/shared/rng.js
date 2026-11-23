// PRNG deterministico con sequenza "nostra" (splitmix32): stesso seed -> stessi numeri su
// ogni browser, su Node e in futuro sul server. Lo stato e' un solo intero, quindi si
// serializza in uno snapshot di rete senza fatica. Mai usare Math.random nella simulazione.

export class Rng {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  nextU32() {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  }

  /** [0, 1) */
  float() {
    return this.nextU32() / 4294967296;
  }

  /** intero in [min, max] inclusi */
  int(min, max) {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  range(min, max) {
    return min + this.float() * (max - min);
  }

  chance(p) {
    return this.float() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.float() * arr.length)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Deriva un sotto-seed stabile per uno scopo ("layout", "combat"...). FNV-1a sul nome. */
export function subSeed(seed, purpose) {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < purpose.length; i++) {
    h ^= purpose.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // un giro di mixing per separare bene seed vicini
  return new Rng(h >>> 0).nextU32();
}

export function randomSeed() {
  // Unico punto non deterministico: sceglie il seed di una nuova partita (lato client/server).
  return (Math.random() * 4294967296) >>> 0;
}
