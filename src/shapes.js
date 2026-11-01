// Builds the outlines used for wall holes AND for the player's morphed body,
// so they always match exactly. Every outline is normalised to fit a 1x1 box.
import * as THREE from 'three';
import coreGlyphs from './data/glyphs.json';

const cache = new Map();

// The digits and day kanji ship with the game; the other ~650 Japanese characters used by the textbook
// categories load on demand (only when a category that needs them is picked).
let moreGlyphs = null;
export const needsMoreGlyphs = words => words.some(w => w.kind === 'glyph' && [...w.text].some(ch => !coreGlyphs[ch]));
export async function loadGlyphs() {
  if (!moreGlyphs) moreGlyphs = (await import('./data/glyphs-ja.json')).default;
}
const glyphOf = ch => coreGlyphs[ch] || moreGlyphs?.[ch];

// ---- primitives -----------------------------------------------------------
function polygon(points) { return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))); }

function circle() { const s = new THREE.Shape(); s.absarc(0, 0, 0.5, 0, Math.PI * 2, false); return s; }

function star() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.52 : 0.22, a = Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([Math.cos(a) * r, Math.sin(a) * r - 0.03]);
  }
  return polygon(pts);
}

function heart() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.35, -0.55, -0.1, -0.5, 0.17);
  s.bezierCurveTo(-0.46, 0.45, -0.1, 0.52, 0, 0.26);
  s.bezierCurveTo(0.1, 0.52, 0.46, 0.45, 0.5, 0.17);
  s.bezierCurveTo(0.55, -0.1, 0.15, -0.35, 0, -0.5);
  return s;
}

function splat() { // friendly paint blob
  const pts = [];
  const n = 72;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.38 + 0.07 * Math.sin(a * 5 + 0.6) + 0.045 * Math.sin(a * 3 + 2.1) + 0.03 * Math.sin(a * 8);
    pts.push([Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2]);
  }
  return polygon(pts);
}

function moon() { // crescent
  const R = 0.5, r = 0.4, d = 0.2;
  const x = (R * R - r * r + d * d) / (2 * d), y = Math.sqrt(R * R - x * x);
  const a = Math.atan2(y, x), b = Math.atan2(y, x - d);
  const s = new THREE.Shape();
  s.absarc(0.09, 0, R, a, Math.PI * 2 - a, false);
  s.absarc(0.09 + d, 0, r, Math.PI * 2 - b, b, true);
  return s;
}

function oval() { const s = new THREE.Shape(); s.absellipse(0, 0, 0.62, 0.4, 0, Math.PI * 2, false, 0); return s; }

function cross() {
  const a = 0.17, b = 0.5;
  return polygon([[-a, b], [a, b], [a, a], [b, a], [b, -a], [a, -a], [a, -b], [-a, -b], [-a, -a], [-b, -a], [-b, a], [-a, a]]);
}

export const FLAG_W = 1.2, FLAG_H = 0.8;    // every flag is cut as the same 3:2 banner
function flagRect() { return polygon([[-FLAG_W / 2, -FLAG_H / 2], [FLAG_W / 2, -FLAG_H / 2], [FLAG_W / 2, FLAG_H / 2], [-FLAG_W / 2, FLAG_H / 2]]); }

const PRIMITIVES = {
  circle, moon, oval, cross,
  diamond: () => polygon([[0, 0.58], [0.44, 0], [0, -0.58], [-0.44, 0]]),
  triangle: () => polygon([[0, 0.5], [-0.55, -0.42], [0.55, -0.42]]),
  square: () => polygon([[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]),
  rectangle: () => polygon([[-0.6, -0.34], [0.6, -0.34], [0.6, 0.34], [-0.6, 0.34]]),
  heart, star, splat,
};

// ---- glyph outlines -------------------------------------------------------
function flatten(cmds, offsetX, offsetY = 0) {
  const loops = [];
  let cur = null;
  let last = [0, 0];
  for (const [op, p] of cmds) {
    if (op === 'M') { cur = [[p[0][0] + offsetX, p[0][1] + offsetY]]; last = p[0]; loops.push(cur); }
    else if (op === 'L') { cur.push([p[0][0] + offsetX, p[0][1] + offsetY]); last = p[0]; }
    else if (op === 'C') {
      const [a, b, c] = p;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10, u = 1 - t;
        cur.push([
          u * u * u * last[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * c[0] + offsetX,
          u * u * u * last[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * c[1] + offsetY,
        ]);
      }
      last = c;
    }
  }
  return loops.filter(l => l.length > 2);
}

const area = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const MAX_W = 1.5, MAX_H = 1.5;    // biggest a word may be, in units where one single character is 1 tall

/** Text (kanji, kana, digits...) -> [{ outer: pts, holes: [pts] }].
 *  One character fills a 1x1 box. Longer words keep natural spacing, wrap into rows (2x2, 3+3, 3x3 ...)
 *  and shrink just enough to fit through the wall. */
function glyphLoops(text) {
  const chars = [...text];
  const n = chars.length;
  const perRow = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = [];
  for (let i = 0; i < n; i += perRow) rows.push(chars.slice(i, i + perRow));
  const pitch = 1.08;
  let loops = [];
  const widths = rows.map(r => r.reduce((a, ch) => a + (glyphOf(ch) ? glyphOf(ch).adv : 1), 0));
  rows.forEach((row, ri) => {
    let x = -widths[ri] / 2;
    for (const ch of row) {
      const g = glyphOf(ch);
      if (!g) throw new Error('No glyph for ' + ch);
      const oy = ((rows.length - 1) / 2 - ri) * pitch;
      for (const l of flatten(g.cmds, x, oy)) loops.push(l);
      x += g.adv;
    }
  });
  const big = loops.reduce((a, b) => (Math.abs(area(a)) > Math.abs(area(b)) ? a : b));
  const outerSign = Math.sign(area(big));
  const outers = loops.filter(l => Math.sign(area(l)) === outerSign).map(l => ({ outer: l, holes: [] }));
  for (const l of loops.filter(l => Math.sign(area(l)) !== outerSign)) {
    const host = outers.find(o => inside(l[0], o.outer));
    if (host) host.holes.push(l);
  }
  const all = outers.flatMap(o => o.outer);
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY;
  // one character: fill the box exactly; several: same scale for every character so they read as one word
  const k = n === 1 ? 1 / Math.max(w, h) : Math.min(MAX_W / w, MAX_H / h, 1 / Math.max(h / rows.length, 0.6));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const norm = l => l.map(([px, py]) => [(px - cx) * k, (py - cy) * k]);
  return outers.map(o => ({ outer: norm(o.outer), holes: o.holes.map(norm) }));
}

const toShape = pts => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
const toPath = pts => new THREE.Path(pts.map(([x, y]) => new THREE.Vector2(x, y)));

/**
 * @returns {{ body: THREE.Shape[], hole: THREE.Shape[], islands: THREE.Shape[], aspect: number }}
 *  body    - the object itself (with its own counters), used for the player
 *  hole    - plain outer outlines, cut out of the wall
 *  islands - the counters (e.g. inside 日 or 0) that stay as solid bits floating in the hole
 */
export function outlineFor(word) {
  if (cache.has(word.key)) return cache.get(word.key);
  let result;
  if (word.kind === 'glyph') {
    const parts = glyphLoops(word.text);
    result = {
      body: parts.map(p => { const s = toShape(p.outer); p.holes.forEach(h => s.holes.push(toPath(h))); return s; }),
      hole: parts.map(p => toShape(p.outer)),
      islands: parts.flatMap(p => p.holes.map(toShape)),
    };
  } else if (word.kind === 'flag') {
    const r = flagRect();
    result = { body: [r], hole: [flagRect()], islands: [] };
  } else {
    const make = word.kind === 'color' ? PRIMITIVES.splat : PRIMITIVES[word.id];
    result = { body: [make()], hole: [make()], islands: [] };
  }
  cache.set(word.key, result);
  return result;
}
