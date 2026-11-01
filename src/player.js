// The mascot. It is a flat toy-block-style sign cut into the shape of the word, so that kanji and digits
// stay perfectly readable. It faces back toward the camera and runs along +X.
import * as THREE from 'three';
import { outlineFor } from './shapes.js';
import { toon } from './world.js';
import { flagBodyTexture } from './flags.js';

export const PLAYER_SIZE = 1.55;                 // shape height in world units
export const PLAYER_Y = 2.1;                     // centre height (same as the wall holes)
export const PLAYER_DEPTH = 0.34;                // thickness along the track
const UNIT_DEPTH = PLAYER_DEPTH / PLAYER_SIZE;
const BODY = 0xffd23f;
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x3a2a63, side: THREE.BackSide });

const opts = { depth: UNIT_DEPTH, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 1, curveSegments: 16 };

// neutral "not a word yet" form: a mint gumdrop that matches none of the packs
function gumdrop() {
  const s = new THREE.Shape();
  const w = 0.3, h = 0.5, r = 0.3;
  s.moveTo(-w, -h + r); s.absarc(0, -h + r, r, Math.PI, Math.PI * 2, false); s.lineTo(w, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-w, -h + r);
  return s;
}

function bodyMesh(word) {
  const shapes = word ? outlineFor(word).body : [gumdrop()];
  const color = word ? (word.kind === 'color' ? word.color : BODY) : 0x9be8d0;
  const geo = new THREE.ExtrudeGeometry(shapes, opts);
  geo.translate(0, 0, -UNIT_DEPTH / 2);
  const g = new THREE.Group();
  const side = new THREE.Color(color).multiplyScalar(0.62);
  const flag = word && word.kind === 'flag';
  const front = flag ? new THREE.MeshBasicMaterial({ map: flagBodyTexture(word.text) }) : toon(color);
  g.add(new THREE.Mesh(geo, [front, toon(flag ? 0x6a5a9a : side)]));
  // x-ray ghost: when the player is behind a wall (sliding through the hole) you still see where it is
  const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthFunc: THREE.GreaterDepth, depthWrite: false }));
  ghost.renderOrder = 10;
  g.add(ghost);
  if (!word || word.kind !== 'glyph') {   // (flags too)            // outline looks great on simple shapes, but muddies thin kanji strokes
    const out = new THREE.Mesh(geo, OUTLINE);
    out.scale.set(1.075, 1.075, 1);
    g.add(out);
  }
  return g;
}

export class Player {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.position.set(0, PLAYER_Y, 0);
    this.pivot = new THREE.Group();
    this.pivot.rotation.y = -Math.PI / 2;           // shape's front (+z) now points back along -X, toward the camera
    this.root.add(this.pivot);
    this.holder = new THREE.Group();
    this.pivot.add(this.holder);
    this.pivot.scale.setScalar(PLAYER_SIZE);

    this.face = this.makeFace();
    this.holder.add(this.face.group);

    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24),
      new THREE.MeshBasicMaterial({ color: 0x3a2a63, transparent: true, opacity: 0.22, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.shadow);

    // little stars that spin round the head after a bonk
    this.dizzy = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.07 : 0.17, a = Math.PI / 2 + i * Math.PI / 5; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.ShapeGeometry(star), starMat); m.userData.a = (i / 3) * Math.PI * 2; this.dizzy.add(m); }
    this.dizzy.visible = false;
    this.root.add(this.dizzy);

    scene.add(this.root);
    this.word = null; this.t = 0; this.pop = 0; this.mood = 'happy'; this.moodT = 0; this.lean = 0;
    this.setWord(null, true);
  }

  makeFace() {
    const group = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dark = new THREE.MeshBasicMaterial({ color: 0x2a1f4a });
    const pink = new THREE.MeshBasicMaterial({ color: 0xff8fb1, transparent: true, opacity: 0.85 });
    const eyes = [], pupils = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), white);
      eye.scale.set(1, 1.25, 0.4);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), dark);
      pupil.position.set(0, -0.005, 0.03); pupil.scale.z = 0.5;
      eye.add(pupil);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), pink);
      cheek.position.set(s * 0.2, -0.1, 0);
      eye.position.set(s * 0.15, 0.1, 0);
      group.add(eye, cheek);
      eyes.push(eye); pupils.push(pupil);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 20, Math.PI), dark);
    smile.rotation.z = Math.PI; smile.position.set(0, -0.02, 0);
    const open = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), dark);
    open.scale.set(1, 1.15, 0.4); open.position.set(0, -0.08, 0);
    group.add(smile, open);
    return { group, eyes, pupils, smile, open };
  }

  setWord(word, instant = false) {
    this.word = word;
    this.holder.children.filter(c => c !== this.face.group).forEach(c => this.holder.remove(c));
    this.holder.add(bodyMesh(word));
    // Kanji and digits stay clean (no face on top of the strokes); simple shapes get the cute face.
    const glyph = word && (word.kind === 'glyph' || word.kind === 'flag');
    this.face.group.visible = !glyph;
    this.face.group.position.set(0, 0, UNIT_DEPTH / 2 + 0.03);
    if (!instant) this.pop = 1;
  }

  setMood(mood, seconds = 1) { this.mood = mood; this.moodT = seconds; }

  update(dt, { worry = 0, running = 0 } = {}) {
    this.t += dt;
    if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0) this.mood = 'happy'; }
    const f = this.face;
    const mood = this.mood === 'happy' && worry > 0.6 ? 'worried' : this.mood;
    f.smile.visible = mood === 'happy' || mood === 'cheer';
    f.open.visible = !f.smile.visible;
    f.open.scale.set(mood === 'cheer' ? 1.6 : 1, mood === 'worried' ? 0.8 : 1.15, 0.4);
    const blink = (this.t % 3.2) > 3.08 ? 0.15 : 1;
    f.eyes.forEach((e, i) => {
      e.scale.y = 1.25 * (mood === 'dizzy' ? 1 : blink) * (mood === 'cheer' ? 0.7 : 1);
      f.pupils[i].position.x = mood === 'dizzy' ? Math.sin(this.t * 14) * 0.03 : 0;
    });

    const bob = Math.sin(this.t * 7) * 0.05 * (0.4 + running) + (mood === 'cheer' ? Math.abs(Math.sin(this.t * 12)) * 0.3 : 0);
    this.root.position.y = PLAYER_Y + bob;
    this.shadow.position.y = 0.03 - this.root.position.y;
    this.shadow.scale.setScalar(1 - bob * 0.2);

    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 3.2);
    const wob = Math.sin((1 - this.pop) * 16) * this.pop;
    this.pivot.scale.set(PLAYER_SIZE, PLAYER_SIZE * (1 - 0.2 * wob), PLAYER_SIZE * (1 + 0.2 * wob));

    // lean forward when running, rock back when bonked
    const targetLean = mood === 'dizzy' ? 0.35 : -0.05 * running;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 10);
    this.root.rotation.z = this.lean;

    this.dizzy.visible = mood === 'dizzy';
    if (this.dizzy.visible) {
      this.dizzy.position.y = 1.2;
      this.dizzy.children.forEach(m => {
        const a = m.userData.a + this.t * 7;
        m.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
        m.rotation.y = -Math.PI / 2; m.rotation.z = this.t * 5;
      });
    }
  }
}
