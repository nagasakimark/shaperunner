// Tiny sound effects manager (short mp3s). There is no music: it would leak into the microphone.
const base = import.meta.env.BASE_URL + 'sounds/';
const files = { correct: 'correct', incorrect: 'incorrect', win: 'win', gameover: 'gameover', ui: 'ui' };

export class Sound {
  constructor() {
    this.sfx = {};
    for (const [k, f] of Object.entries(files)) {
      const a = new Audio(`${base}${f}.mp3`); a.preload = 'auto'; this.sfx[k] = a;
    }
    this.sfxOn = true;
  }
  play(name) {
    const a = this.sfx[name];
    if (!a || !this.sfxOn) return;
    a.currentTime = 0; a.play().catch(() => {});
  }
}
