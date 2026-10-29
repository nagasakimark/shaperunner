// The candy-coloured world. The track runs along +X; everything is anchored to world position,
// so as the player runs forward the scenery slides past naturally.
import * as THREE from 'three';

export const TRACK_W = 3.8;
export const SKY_TOP = '#6ec6ff', SKY_BOTTOM = '#ffe3f1';
export const FOG_COLOR = 0xfbe4f3;

export function toonGradient(steps = [100, 175, 255]) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
export const GRADIENT = toonGradient();
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...extra });

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

const skyTexture = () => canvasTex(2, 256, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, SKY_TOP); grad.addColorStop(0.6, '#b9e5ff'); grad.addColorStop(1, SKY_BOTTOM);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
});

const hillsTexture = () => canvasTex(1024, 256, (g, w, h) => {
  // integer wave counts so the texture tiles seamlessly around the cylinder
  const layers = [['#c8ecc4', 150, 3, 0.0, 5], ['#a6e0a0', 190, 4, 1.7, 7], ['#82d27f', 225, 6, 4.1, 11]];
  for (const [col, base, k, ph, k2] of layers) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, base - 34 * Math.sin((x / w) * k * 6.2832 + ph) - 16 * Math.sin((x / w) * k2 * 6.2832 + ph * 2));
    g.lineTo(w, h); g.closePath(); g.fill();
  }
});

const cloudTexture = () => canvasTex(256, 128, g => {
  g.fillStyle = 'rgba(255,255,255,0.96)';
  for (const [x, y, r] of [[64, 78, 38], [112, 58, 46], [160, 70, 40], [200, 86, 30], [96, 90, 34], [150, 94, 34]]) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});

// one tile = 6 units long (u) x track width (v)
const TILE = 6;
const trackTexture = len => canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#8f93e6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9a9eef'; g.fillRect(0, 0, w / 2, h);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, 7); g.fillRect(0, h - 7, w, 7);                 // edge lines
  g.fillStyle = '#ffffffcc'; g.fillRect(w * 0.08, h / 2 - 3, w * 0.34, 6);   // dashed centre line
}, [len / TILE, 1]);

const curbTexture = len => canvasTex(64, 16, (g, w, h) => {
  g.fillStyle = '#ff4d5e'; g.fillRect(0, 0, w / 2, h);
  g.fillStyle = '#ffffff'; g.fillRect(w / 2, 0, w / 2, h);
}, [len / 1.4, 1]);

const grassTexture = len => canvasTex(64, 8, (g, w, h) => {
  g.fillStyle = '#9be49a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8fdc8e'; g.fillRect(0, 0, w / 2, h);
}, [len / 10, 1]);

export class World {
  constructor(scene) {
    this.scene = scene;
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(FOG_COLOR, 50, 150);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xffc9e6, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-4, 9, 7);
    scene.add(sun);

    // hills wrap all the way round (the camera looks diagonally down the track)
    const htex = hillsTexture(); htex.wrapS = THREE.RepeatWrapping; htex.repeat.set(3, 1);
    this.hills = new THREE.Mesh(new THREE.CylinderGeometry(190, 190, 80, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: htex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.hills.position.y = 33;
    scene.add(this.hills);

    this.L = 240; // length of the moving ground meshes
    this.trackTex = trackTexture(this.L);
    this.track = new THREE.Mesh(new THREE.PlaneGeometry(this.L, TRACK_W), new THREE.MeshLambertMaterial({ map: this.trackTex }));
    this.track.rotation.x = -Math.PI / 2;
    scene.add(this.track);

    this.grassTex = grassTexture(this.L);
    this.grass = new THREE.Mesh(new THREE.PlaneGeometry(this.L, 160), new THREE.MeshLambertMaterial({ map: this.grassTex }));
    this.grass.rotation.x = -Math.PI / 2; this.grass.position.y = -0.03;
    scene.add(this.grass);

    this.curbTex = curbTexture(this.L);
    const curbMat = new THREE.MeshLambertMaterial({ map: this.curbTex });
    this.curbs = [-1, 1].map(s => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(this.L, 0.22, 0.36), curbMat);
      m.position.set(0, 0.11, s * (TRACK_W / 2 + 0.18));
      scene.add(m); return m;
    });

    // clouds
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, fog: false, depthWrite: false });
    this.clouds = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(cloudMat);
      const sc = 14 + Math.random() * 14;
      s.scale.set(sc, sc / 2, 1);
      s.userData = { ox: Math.random() * 320 - 160, z: -70 - Math.random() * 60, y: 16 + Math.random() * 20, drift: 0.5 + Math.random() * 0.8 };
      scene.add(s); this.clouds.push(s);
    }

    // lollipop trees on the far side of the track only (the camera lives on the near side)
    this.trees = [];
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.9, 8);
    const topGeo = new THREE.SphereGeometry(0.95, 14, 10);
    const trunkMat = toon(0xfff3d6);
    const tops = [0xff7eb6, 0xffd93d, 0x7ddc6f, 0x4dc3ff, 0xb583ff].map(c => toon(c));
    this.treeSpan = 10 * 22;
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 0.95;
      const top = new THREE.Mesh(topGeo, tops[i % tops.length]); top.position.y = 2.6;
      g.add(trunk, top);
      g.position.set(-20 + i * 10 + Math.random() * 3, 0, -(8.5 + Math.random() * 4));
      g.scale.setScalar(0.9 + Math.random() * 0.5);
      scene.add(g); this.trees.push(g);
    }
  }

  update(t, camX, camZ) {
    // moving ground meshes stay under the camera; textures are offset so patterns stay fixed in the world
    const cx = camX + 70, xmin = cx - this.L / 2;
    this.track.position.set(cx, 0.001, 0);
    this.trackTex.offset.x = xmin / TILE;
    this.grass.position.x = cx; this.grassTex.offset.x = xmin / 10;
    for (const c of this.curbs) c.position.x = cx;
    this.curbTex.offset.x = xmin / 1.4;
    this.hills.position.x = camX; this.hills.position.z = camZ;
    for (const tr of this.trees) {
      if (tr.position.x < camX - 24) tr.position.x += this.treeSpan;
    }
    for (const c of this.clouds) {
      const u = c.userData;
      let x = ((u.ox + t * u.drift - camX * 0.08) % 320 + 480) % 320 - 160;
      c.position.set(camX + x + 40, u.y, u.z);
    }
  }
}
