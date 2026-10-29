// Game engine: owns the 3D scene and the run state machine.
//   idle -> countdown -> playing -> (paused) -> done
//
// Layout (like the TikTok original): the walls stand still across a track and the player runs along it,
// seen from the side. Each time the player reaches a wall the game checks ONCE whether the shape fits.
//   fits      -> the player slides through the hole
//   doesn't   -> BONK: bounce back, dizzy, and the student gets another go at it
//   too many  -> the wall tips over and the run goes on
// There is no physics, just a position compared against a position, so nothing can tunnel through a wall.
import * as THREE from 'three';
import { World } from './world.js';
import { Player, PLAYER_DEPTH } from './player.js';
import { buildWall, disposeWall, updateWallLook, WALL_DEPTH } from './wall.js';
import { Burst } from './fx.js';

// The pace is the same for every level: the levels are about how well you have to PRONOUNCE the word, not how fast you run.
export const SPEED = 4.0, SPACING = 16;

/**
 * partials : accept a word as soon as it is heard (before the student has stopped talking)
 * minConf  : how sure the listener must be (0..1). With sound-alike words in the grammar this really measures clarity:
 *            if "light" competes with "right", a muddy L/R gets a low score.
 * alike    : which sound-alike words compete with the target ('near' = classic learner mix-ups, 'all' = anything close)
 * open     : a second, unrestricted listener must ALSO hear the word, with no hint of what was expected
 */
export const LEVELS = {
  starter: { label: 'Starter', ja: 'はじめて', blurbJa: 'だいたい あっていれば OK。はじめての ひとに おすすめ！', blurb: 'Close enough counts.',               tries: 5, partials: true,  minConf: 0,    alike: 'none', open: false },
  clear:   { label: 'Clear',   ja: 'はっきり', blurbJa: 'ことばを はっきり いおう。', blurb: 'Say the word clearly.',                                       tries: 4, partials: false, minConf: 0.6,  alike: 'none', open: false },
  careful: { label: 'Careful', ja: 'ていねい', blurbJa: 'にている ことばも きいているよ。right が light に きこえたら ダメ！', blurb: 'Sound-alikes listen too.', tries: 4, partials: false, minConf: 0.75, alike: 'near', open: false },
  expert:  { label: 'Expert',  ja: 'めいじん', blurbJa: 'にている ことばが もっと ふえる！ ヒントなしの もうひとつの みみも ききとれたら OK。', blurb: 'More sound-alikes, plus a hint-free second listener.', tries: 3, partials: false, minConf: 0.8, alike: 'all', open: true },
};
export const LEVEL_ORDER = ['starter', 'clear', 'careful', 'expert'];

const FIRST_WALL_X = 15;
const BOUNCE_DIST = 3.0, BOUNCE_T = 0.5, DIZZY_T = 0.6, FALL_T = 0.75;
const CONFETTI = [0xff7eb6, 0x4dc3ff, 0x7ddc6f, 0xffd93d, 0xb583ff, 0xffb347];
const easeOut = t => 1 - Math.pow(1 - Math.min(1, t), 3);
const easeIn = t => Math.min(1, t) ** 2.2;

export class Game extends EventTarget {
  constructor(container, sound) {
    super();
    this.sound = sound;
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.world = new World(this.scene);
    this.player = new Player(this.scene);
    this.burst = new Burst(this.scene);

    this.mode = 'idle';
    this.walls = [];
    this.px = 0; this.vx = 0;
    this.shake = 0; this.t = 0;
    this.labelsOn = true;
    this.frameTimes = [];
    this.lastTime = performance.now();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    // keep the horizontal field of view roughly constant so wide TVs and narrow windows both frame the action
    const hfov = THREE.MathUtils.degToRad(64);
    this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect)), 36, 90);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // ---- run control -------------------------------------------------------
  /** @param seq the words for the walls, in order (the caller picks them so it can tune the listener to exactly these) */
  start({ seq, allWords, level, labels }) {
    this.clearWalls();
    this.cfg = { ...LEVELS[level], speed: SPEED, spacing: SPACING, lives: Infinity };
    this.vocab = new Map(allWords.map(w => [w.id, w]));
    this.seq = seq; this.total = seq.length;
    this.labelsOn = labels;
    this.built = 0; this.resolved = 0;
    this.results = []; this.streak = 0; this.bestStreak = 0; this.lives = this.cfg.lives;
    this.pending = null; this.finishSent = false; this.failed = false;
    this.px = 0; this.vx = 0; this.phase = 'run'; this.phaseT = 0; this.currentId = undefined;
    this.player.setWord(null); this.player.setMood('happy', 0);
    this.mode = 'countdown'; this.countdown = 3.4; this.lastCount = 4;
    this.emit('progress', { done: 0, total: this.total, lives: this.lives, streak: 0 });
    this.emit('wall', null);
    return this.seq;
  }

  pause() { if (this.mode === 'playing' || this.mode === 'countdown') { this.prevMode = this.mode; this.mode = 'paused'; this.emit('paused', true); } }
  resume() { if (this.mode === 'paused') { this.mode = this.prevMode; this.emit('paused', false); } }
  quit() { this.clearWalls(); this.mode = 'idle'; this.px = 0; this.player.setWord(null); this.player.setMood('happy', 0); this.emit('wall', null); }

  clearWalls() { for (const w of this.walls) { this.scene.remove(w.holder); disposeWall(w); } this.walls = []; }

  setLabels(on) { this.labelsOn = on; for (const w of this.walls) w.label.visible = on; }
  /** Hint button: show the printed word on the current wall for a few seconds. */
  peek(seconds = 3) {
    const w = this.currentWall(); if (!w) return;
    w.label.visible = true;
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => { w.label.visible = this.labelsOn; }, seconds * 1000);
  }

  /** The student said a word. Returns true if it changed the player's shape. */
  say(wordId) {
    const cur = this.currentWall();
    // two words can share a spoken form (orange the colour / orange the fruit): take the shape of the wall in front of you
    const word = cur && cur.word.id === wordId ? cur.word : this.vocab?.get(wordId);
    if (!word || (this.mode !== 'playing' && this.mode !== 'countdown')) return false;
    if (this.formLocked()) { this.pending = word; return false; }
    return this.applyForm(word);
  }

  applyForm(word) {
    if (this.player.word?.id === word.id) return false;
    this.player.setWord(word);
    this.burst.emit(this.player.root.position, 10, [0xffffff, 0xffe27a, 0xffb3d6], { speed: 3, up: 2.5, gravity: 5, size: 0.7 });
    this.sound.play('ui');
    this.emit('form', { word });
    return true;
  }

  /** The listener heard a different (sound-alike) word: the player goes back to a blank gumdrop so the mix-up is visible. */
  mishear() {
    if ((this.mode !== 'playing' && this.mode !== 'countdown') || this.formLocked()) return;
    if (this.player.word) { this.player.setWord(null); this.emit('form', { word: null }); }
  }

  formLocked() { return this.walls.some(w => w.state === 'passing'); }
  currentWall() { return this.walls.find(w => w.state === 'ahead') || null; }
  wallX(k) { return FIRST_WALL_X + k * this.cfg.spacing; }

  // ---- per-frame ---------------------------------------------------------
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Advance the simulation by dt seconds (separate from drawing so tests can single-step). */
  step(dt) {
    this.t += dt;
    this.adaptQuality(dt);

    if (this.mode === 'idle' || this.mode === 'done') {
      this.vx = 3; this.px += this.vx * dt;
    } else if (this.mode === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.4);
      if (n !== this.lastCount) { this.lastCount = n; this.emit('countdown', n > 0 ? n : 0); if (n <= 0) this.sound.play('correct'); }
      if (this.countdown <= 0) { this.mode = 'playing'; this.emit('countdown', null); }
      this.ensureWalls();
    } else if (this.mode === 'playing') {
      this.updatePlaying(dt);
    }

    if (this.mode !== 'paused') {
      const cur = this.currentWall();
      const wrong = cur && this.player.word?.id !== cur.word.id;
      const gap = cur ? cur.x - this.px : 99;
      this.player.root.position.x = this.px;
      this.player.update(dt, { worry: wrong ? THREE.MathUtils.clamp(1 - gap / 9, 0, 1) : 0, running: THREE.MathUtils.clamp(this.vx / 6, 0, 1) });
      this.burst.update(dt);
      for (const w of this.walls) if (w.shake > 0) {
        w.shake = Math.max(0, w.shake - dt * 2.2);
        w.holder.rotation.x = Math.sin(this.t * 55) * 0.05 * w.shake;
      }
      if (this.mode === 'done' && (this.finishT -= dt) <= 0 && !this.finishSent) { this.finishSent = true; this.finish(); }
    }
    this.updateCamera(dt);
    this.world.update(this.t, this.camera.position.x, this.camera.position.z);
  }

  updateCamera(dt) {
    // 3/4 side view from behind-left of the player: the track runs off diagonally and wall faces are visible, as in the original
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const s = this.shake * this.shake * 0.45;
    const x = this.px - 5.6, y = 3.9, z = 7.4;
    this.camera.position.set(x + (Math.random() - 0.5) * s, y + (Math.random() - 0.5) * s, z);
    this.camera.lookAt(this.px + 4.4, 1.7, -0.5);
  }

  ensureWalls() {
    while (this.built < this.total && this.wallX(this.built) < this.px + 110) {
      const w = buildWall(this.seq[this.built], this.built, this.wallX(this.built), this.labelsOn);
      w.contactX = w.x - WALL_DEPTH / 2 - PLAYER_DEPTH / 2 - 0.05;
      this.scene.add(w.holder); this.walls.push(w); this.built++;
    }
    for (const w of [...this.walls]) {
      if ((w.state === 'passed' || w.state === 'fallen') && w.x < this.px - 22) { this.scene.remove(w.holder); disposeWall(w); this.walls = this.walls.filter(v => v !== w); }
    }
  }

  updatePlaying(dt) {
    this.ensureWalls();
    const cfg = this.cfg, cur = this.currentWall();
    this.phaseT += dt;

    if (this.phase === 'run') {
      const target = cfg.speed;
      this.vx += (target - this.vx) * Math.min(1, dt * 4);
      this.px += this.vx * dt;
      if (cur && this.px >= cur.contactX) { this.px = cur.contactX; this.contact(cur); }
    } else if (this.phase === 'bonk') {
      this.px = cur.contactX - BOUNCE_DIST * easeOut(this.phaseT / BOUNCE_T);
      if (this.phaseT >= BOUNCE_T) this.setPhase('dizzy');
    } else if (this.phase === 'dizzy') {
      if (this.phaseT >= DIZZY_T) {
        if (cur.attempts >= cfg.tries) this.failWall(cur); else { this.vx = 0; this.setPhase('run'); }
      }
    } else if (this.phase === 'fall') {
      const w = this.walls.find(v => v.state === 'falling');
      w.holder.rotation.z = -Math.PI / 2 * easeIn(this.phaseT / FALL_T);
      if (this.phaseT >= FALL_T) {
        w.state = 'fallen'; w.holder.rotation.z = -Math.PI / 2;
        this.burst.emit(new THREE.Vector3(w.x + 2.2, 0.4, 0), 24, [0xffffff, 0xd9d9ff], { speed: 7, up: 2, gravity: 8, size: 1.2 });
        this.shake = 0.6;
        this.vx = 0; this.setPhase('run');
        this.afterWall();
      }
    }

    for (const w of this.walls) {
      if (w.state === 'ahead') updateWallLook(w, this.px);
      if (w.state === 'passing' && this.px > w.x + 1.5) { w.state = 'passed'; updateWallLook(w, this.px); }
    }
    if (this.pending && !this.formLocked()) { const p = this.pending; this.pending = null; this.applyForm(p); }

    const id = this.currentWall()?.word.id ?? null;
    if (id !== this.currentId) { this.currentId = id; this.emit('wall', this.currentWall()?.word ?? null); }
  }

  setPhase(p) { this.phase = p; this.phaseT = 0; }

  contact(w) {
    const said = this.player.word?.id ?? null;
    if (said === w.word.id) {                       // fits: slide on through
      w.state = 'passing'; this.resolved++;
      const tries = w.attempts + 1;
      this.results.push({ word: w.word.id, label: w.word.label, correct: true, tries, said });
      this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.player.setMood('cheer', 1.2);
      this.burst.emit(new THREE.Vector3(w.x + 0.8, 2.1, 0), 36, CONFETTI, { speed: 9, up: 7, spread: 1.2 });
      this.sound.play('correct');
      this.emit('result', { ok: true, word: w.word, said, tries, streak: this.streak });
      this.afterWall();
    } else {                                        // BONK
      w.attempts++; w.shake = 1; this.shake = 0.8; this.vx = 0;
      this.player.setMood('dizzy', BOUNCE_T + DIZZY_T);
      this.burst.emit(new THREE.Vector3(w.x - 0.4, 2.1, 0), 14, [0xffffff, 0xffe27a], { speed: 5, up: 3, gravity: 9, size: 0.9 });
      this.sound.play('incorrect');
      this.streak = 0;
      this.emit('bonk', { word: w.word, said, attempts: w.attempts, max: this.cfg.tries });
      this.emit('progress', { done: this.resolved, total: this.total, lives: this.lives, streak: 0 });
      this.setPhase('bonk');
    }
  }

  failWall(w) {                                     // out of chances: the wall tips over so the run can go on
    w.state = 'falling'; this.resolved++;
    this.results.push({ word: w.word.id, label: w.word.label, correct: false, tries: w.attempts, said: this.player.word?.id ?? null });
    if (this.lives !== Infinity) this.lives--;
    this.player.setMood('happy', 0);
    this.sound.play('incorrect');
    this.emit('result', { ok: false, word: w.word, said: this.player.word?.id ?? null, tries: w.attempts, streak: 0 });
    this.setPhase('fall');
  }

  afterWall() {
    this.emit('progress', { done: this.resolved, total: this.total, lives: this.lives, streak: this.streak });
    if (this.lives <= 0) this.endRun(true);
    else if (this.resolved >= this.total) this.endRun(false);
  }

  endRun(failed) {
    if (this.mode === 'done') return;
    this.failed = failed; this.mode = 'done'; this.finishSent = false;
    this.finishT = failed ? 1.4 : 2.0;
    if (!failed) this.player.setMood('cheer', 2.5);
  }

  finish() {
    const correct = this.results.filter(r => r.correct).length;
    const firstTry = this.results.filter(r => r.correct && r.tries === 1).length;
    const score = (firstTry + (correct - firstTry) * 0.5) / this.total;
    const stars = this.failed ? 0 : score >= 0.85 ? 3 : score >= 0.6 ? 2 : 1;
    this.sound.play(this.failed ? 'gameover' : 'win');
    this.emit('finish', { results: this.results, correct, firstTry, total: this.total, stars, failed: this.failed, bestStreak: this.bestStreak });
  }

  // Lower the render resolution on slow machines (Chromebooks) rather than stuttering.
  adaptQuality(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 38 && this.pixelRatio > 0.7 && this.mode === 'playing') {
      this.pixelRatio = Math.max(0.7, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }
}
