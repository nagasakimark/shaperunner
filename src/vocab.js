// Textbooks -> categories -> words, built from the files in src/data/vocab by scripts/make_vocab.py.
//
// Pictures: only the textbook covers (src/data/vocab/LT1.jpg ...) and ONE picture per category are used.
// Put a category picture in src/data/vocab/categories/ named after the category, e.g. Animals.jpg, Colors.jpg,
// FruitAndVegetables.jpg, "Things Around You.jpg"  (spaces, capitals and & are ignored when matching).
// A category without a picture just shows its emoji.
import data from './data/packs.json';

const bookPics = import.meta.glob('./data/vocab/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' });
const catPics = import.meta.glob('./data/vocab/categories/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' });

const slug = s => s.toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]/g, '');
const picIndex = pics => new Map(Object.entries(pics).map(([path, url]) => [slug(path.split('/').pop()), url]));
const bookIndex = picIndex(bookPics), catIndex = picIndex(catPics);

export const BOOKS = data.books.map(b => ({
  id: b.id,
  title: b.title,
  img: bookIndex.get(slug(b.id)) || null,
  cats: b.cats.map(key => {
    const c = data.cats[key], pid = `${b.id}/${key}`;
    return {
      id: pid, key, title: c.title, ja: c.ja, icon: c.icon, count: data.packs[pid].length,
      img: c.img.map(n => catIndex.get(slug(n))).find(Boolean) || null,
    };
  }),
}));

const KIND = { s: 'shape', c: 'color', g: 'glyph', f: 'flag' };
const wordCache = new Map();
function toWord(key) {
  if (wordCache.has(key)) return wordCache.get(key);
  const w = data.words[key];
  const word = {
    key, id: w.i, label: w.l, kind: KIND[w.k], text: w.j || '', color: w.c,
    near: w.d || [], nearer: w.x || [], same: w.a || [],   // sound-alikes for the strict levels / words that sound identical
  };
  wordCache.set(key, word);
  return word;
}

/** All words of the chosen category ids, with no two words sharing a spoken form or a hole shape. */
export function wordsOf(packIds) {
  const ids = new Set(), shapes = new Set(), out = [];
  for (const pid of packIds) for (const key of data.packs[pid] || []) {
    const w = toWord(key);
    const shape = w.kind === 'glyph' ? w.text : w.kind === 'flag' ? `f${w.text}` : w.kind === 'color' ? `c${w.color}` : w.id;
    if (ids.has(w.id) || shapes.has(shape)) continue;
    ids.add(w.id); shapes.add(shape); out.push(w);
  }
  return out;
}

export const categoryOf = pid => BOOKS.flatMap(b => b.cats).find(c => c.id === pid);
