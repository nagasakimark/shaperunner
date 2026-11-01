// Toy-brick walls that span the whole track, with a hole shaped like the word.
// A wall is a plain object with a fixed x position; the game decides pass / bonk when the player reaches it.
import * as THREE from 'three';
import { outlineFor, FLAG_W, FLAG_H } from './shapes.js';
import { flagPlaneTexture } from './flags.js';
import { toon, TRACK_W } from './world.js';
import { PLAYER_SIZE, PLAYER_Y } from './player.js';

export const WALL_W = TRACK_W, WALL_H = 4.9, WALL_DEPTH = 0.42;
export const HOLE_SIZE = PLAYER_SIZE * 1.34;
const PALETTE = [0xff7eb6, 0x4dc3ff, 0x7ddc6f, 0xffb347, 0xb583ff, 0xffd93d, 0x3fd6c6];

let studTex;
function studTexture() {
  if (studTex) return studTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
  g.fillStyle = 'rgba(0,0,0,0.09)'; g.beginPath(); g.arc(64, 68, 26, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(64, 64, 24, 0, 7); g.fill();
  studTex = new THREE.CanvasTexture(c);
  studTex.colorSpace = THREE.SRGBColorSpace;
  studTex.wrapS = studTex.wrapT = THREE.RepeatWrapping;
  studTex.repeat.set(1 / 0.95, 1 / 0.95);
  studTex.anisotropy = 8;
  return studTex;
}

function labelTexture(text) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 192;
  const g = c.getContext('2d');
  let size = 140;
  g.font = `700 ${size}px Fredoka, "Hiragino Maru Gothic ProN", system-ui, sans-serif`;
  while (size > 50 && g.measureText(text).width > 690) { size -= 6; g.font = `700 ${size}px Fredoka, "Hiragino Maru Gothic ProN", system-ui, sans-serif`; }   // long words shrink to fit
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = size * 0.19; g.strokeStyle = '#3a2a63';
  g.strokeText(text, 384, 100); g.fillStyle = '#ffffff'; g.fillText(text, 384, 100);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const opts = { depth: WALL_DEPTH, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 1, curveSegments: 14 };

function place(shape, scale) { // unit outline -> wall coordinates (x across the track, y up)
  return shape.getPoints(24).map(p => new THREE.Vector2(p.x * scale, p.y * scale + PLAYER_Y));
}

let holderFlag = null;
/** @returns {{ holder: THREE.Group, word, state, x, attempts }} */
export function buildWall(word, index, x, showLabel) {
  const o = outlineFor(word);
  const panel = new THREE.Shape([
    new THREE.Vector2(-WALL_W / 2, 0), new THREE.Vector2(WALL_W / 2, 0),
    new THREE.Vector2(WALL_W / 2, WALL_H), new THREE.Vector2(-WALL_W / 2, WALL_H),
  ]);
  for (const h of o.hole) panel.holes.push(new THREE.Path(place(h, HOLE_SIZE)));

  const base = word.kind === 'color' ? 0xdcd2ff : PALETTE[index % PALETTE.length];
  const face = toon(base, { map: studTexture() });
  const edge = toon(new THREE.Color(base).multiplyScalar(0.5));   // dark inside edge makes the hole shape pop
  const geo = new THREE.ExtrudeGeometry(panel, opts);
  geo.translate(0, 0, -WALL_DEPTH / 2);

  const wall = new THREE.Group();           // local +z = the face the player sees
  wall.rotation.y = -Math.PI / 2;           // ...which now points back along -X
  wall.add(new THREE.Mesh(geo, [face, edge]));

  for (const isl of o.islands) {            // counters of 日, 0, 8 ... stay as solid bits floating in the opening
    const ig = new THREE.ExtrudeGeometry(new THREE.Shape(place(isl, HOLE_SIZE)), { ...opts, bevelSize: 0.01 });
    ig.translate(0, 0, -WALL_DEPTH / 2);
    wall.add(new THREE.Mesh(ig, [face, edge]));
  }

  // Flat "portal" fills the hole while the player is far away so the shape reads clearly against any background.
  // It dissolves as the player gets close, revealing the real opening to slide through.
  const sheetMat = new THREE.MeshBasicMaterial({ color: word.kind === 'color' ? word.color : 0x3b2d7a, transparent: true, fog: false, depthWrite: false });
  const sheet = new THREE.Group();
  for (const h of o.hole) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(place(h, HOLE_SIZE + 0.05))), sheetMat);
    m.position.z = WALL_DEPTH / 2 - 0.02;
    sheet.add(m);
  }
  wall.add(sheet);

  // flags: the picture of the flag hangs, see-through, in the opening, so you can see which flag to match
  if (word.kind === 'flag') {
    const fm = new THREE.MeshBasicMaterial({ map: flagPlaneTexture(word.text), transparent: true, opacity: 0.55, fog: false, depthWrite: false });
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(FLAG_W * HOLE_SIZE, FLAG_H * HOLE_SIZE), fm);
    fp.position.set(0, PLAYER_Y, WALL_DEPTH / 2 - 0.005);
    fp.renderOrder = 5;
    wall.add(fp);
    holderFlag = fm;
  }

  // the word printed on the wall, like the original
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture(word.label), transparent: true, fog: false, depthWrite: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W * 0.86, WALL_W * 0.86 / 4), labelMat);
  label.position.set(0, WALL_H - 0.62, WALL_DEPTH / 2 + 0.035);
  label.visible = showLabel;
  wall.add(label);

  const holder = new THREE.Group();          // the holder is what topples over (hinged on the ground)
  holder.add(wall);
  holder.position.set(x, 0, 0);
  holder.userData = { face, edge, sheetMat, labelMat, flagMat: word.kind === 'flag' ? holderFlag : null };
  return { holder, wall, label, sheetMat, word, x, state: 'ahead', attempts: 0, fallT: 0, shake: 0, index };
}

/** Fade the portal sheet out as the player nears. */
export function updateWallLook(w, playerX) {
  const d = w.x - playerX;
  const fade = THREE.MathUtils.clamp((d - 2.6) / 2.2, 0, 1);
  w.sheetMat.opacity = fade;
  w.sheetMat.visible = fade > 0.01;
}

export function disposeWall(w) {
  w.holder.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  const u = w.holder.userData;
  u.flagMat?.map?.dispose(); u.flagMat?.dispose(); u.face?.dispose(); u.edge?.dispose(); u.sheetMat?.dispose(); u.labelMat?.map?.dispose(); u.labelMat?.dispose();
}
