// Flag pictures (src/data/flags/*.svg, from the MIT-licensed flag-icons set) drawn once onto a canvas per country.
import * as THREE from 'three';
import { FLAG_W, FLAG_H } from './shapes.js';

const urls = import.meta.glob('./data/flags/*.svg', { eager: true, query: '?url', import: 'default' });
const byCode = new Map(Object.entries(urls).map(([p, u]) => [p.split('/').pop().replace('.svg', ''), u]));
const canvases = new Map();

function flagCanvas(code) {
  if (canvases.has(code)) return canvases.get(code);
  const c = document.createElement('canvas'); c.width = 384; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e8f0'; g.fillRect(0, 0, c.width, c.height);
  const entry = { canvas: c, listeners: new Set() };
  canvases.set(code, entry);
  const url = byCode.get(code);
  if (url) {
    const img = new Image();
    img.onload = () => {
      g.clearRect(0, 0, c.width, c.height);
      const k = Math.max(c.width / img.width, c.height / img.height);           // cover the 3:2 banner
      g.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k);
      entry.listeners.forEach(t => { t.needsUpdate = true; });
    };
    img.src = url;
  }
  return entry;
}

function texture(code, fitShape) {
  const e = flagCanvas(code);
  const t = new THREE.CanvasTexture(e.canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (fitShape) { t.repeat.set(1 / FLAG_W, 1 / FLAG_H); t.offset.set(0.5, 0.5); }   // extruded caps use the shape's own x/y as UVs
  e.listeners.add(t);
  return t;
}
/** for a PlaneGeometry (uv 0..1) */
export const flagPlaneTexture = code => texture(code, false);
/** for the caps of an ExtrudeGeometry of the flag rectangle */
export const flagBodyTexture = code => texture(code, true);
