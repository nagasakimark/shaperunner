import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';

import { Game, LEVELS, LEVEL_ORDER } from './game.js';
import { Speech } from './speech.js';
import { Sound } from './audio.js';
import { BOOKS, wordsOf, categoryOf } from './vocab.js';
import { needsMoreGlyphs, loadGlyphs, outlineFor } from './shapes.js';
import { buildWall, disposeWall } from './wall.js';

const $ = s => document.querySelector(s);
const screens = $('#screens'), hud = $('#hud');

// ---------- settings (remembered on this Chromebook only) ----------
const DEFAULTS = { book: 'LT1', cats: ['LT1/colors', 'LT1/shapes'], level: 'clear', walls: 10, hints: true };
const KEY = 'shaperunner.settings3';
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* private mode */ }
  s = { ...DEFAULTS, ...s };
  s.cats = (s.cats || []).filter(c => categoryOf(c));
  if (!s.cats.length) s.cats = [...DEFAULTS.cats];
  if (!BOOKS.some(b => b.id === s.book)) s.book = DEFAULTS.book;
  if (!LEVELS[s.level]) s.level = DEFAULTS.level;
  return s;
}
const settings = loadSettings();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ } };

// ---------- core objects ----------
const sound = new Sound();
const game = new Game($('#stage'), sound);
const speech = new Speech();
const voice = { state: 'loading', progress: 0, error: null };   // state: loading | ready | failed
let micState = 'closed';                                         // closed | open | denied
let pool = [];                                                   // the words of this run
let playing = false;
let lastRun = null;

speech.loadModel(p => { voice.progress = p; updatePlayButton(); })
  .then(() => { voice.state = 'ready'; updatePlayButton(); })
  .catch(err => { console.error(err); voice.state = 'failed'; voice.error = err; updatePlayButton(); });

// ---------- helpers ----------
const show = html => { screens.innerHTML = html; };
const clearScreens = () => { screens.innerHTML = ''; };
const pick = a => a[(Math.random() * a.length) | 0];
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** every word at least once before any repeats, never the same word twice in a row */
function pickSequence(words, count) {
  const seq = [];
  let bag = [];
  while (seq.length < count) {
    if (!bag.length) bag = shuffle(words);
    let i = bag.findIndex(w => w.id !== seq[seq.length - 1]?.id);
    if (i < 0) i = 0;
    seq.push(bag.splice(i, 1)[0]);
  }
  return seq;
}

// ---------- menu ----------
const wordCount = () => wordsOf(settings.cats).length;

function catTile(c) {
  const on = settings.cats.includes(c.id);
  const pic = c.img ? `<img src="${c.img}" alt="" loading="lazy">` : `<span class="emoji">${c.icon}</span>`;
  return `<button class="cat ${on ? 'on' : ''}" data-cat="${c.id}"><span class="pic">${pic}</span><b>${c.ja}</b><span class="en">${esc(c.title)}</span><small>${c.count} たんご</small></button>`;
}

function renderBooks() {
  $('#books').innerHTML = BOOKS.map(b => {
    const n = settings.cats.filter(c => c.startsWith(b.id + '/')).length;
    return `<button class="book ${settings.book === b.id ? 'on' : ''}" data-book="${b.id}" title="${esc(b.title)}">
      ${b.img ? `<img src="${b.img}" alt="${esc(b.title)}">` : `<span class="nocover">${esc(b.title)}</span>`}
      ${n ? `<i class="badge">${n}</i>` : ''}</button>`;
  }).join('');
  const book = BOOKS.find(b => b.id === settings.book);
  $('#book-title').textContent = book.title;
  $('#cats').innerHTML = book.cats.map(catTile).join('');
}

function renderPicked() {
  const n = settings.cats.length, w = wordCount();
  $('#picked').innerHTML = `<b>${n}</b> カテゴリー · <b>${w}</b> たんご${n > 1 ? ' <button class="link" data-act="clearcats">クリア</button>' : ''}`;
  updatePlayButton();
}

function showMenu() {
  playing = false; lastRun = null;
  game.quit(); hud.hidden = true;
  speech.stop();
  show(`
  <div class="screen"><div class="card wide">
    <h1 class="logo">${[...'Shape Runner'].map(c => `<span>${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</h1>
    <p class="tagline">ことばを いって、かべを ぬけよう！ <span class="en">Say the word to fit through the wall!</span></p>

    <div class="section-title">1. ほんを えらぼう <span class="sub">Pick your book</span></div>
    <div class="books" id="books"></div>

    <div class="section-title">2. なにを れんしゅう する？ <span class="sub">What to practice</span> <span class="book-name" id="book-title"></span></div>
    <div class="cats" id="cats"></div>
    <div class="picked" id="picked"></div>

    <div class="opts">
      <div class="opt"><div class="section-title">3. はつおんの レベル <span class="sub">How carefully?</span></div>
        <div class="seg" data-seg="level">${LEVEL_ORDER.map(k => `<button data-v="${k}" class="${settings.level === k ? 'on' : ''}">${LEVELS[k].ja}<span class="en">${LEVELS[k].label}</span></button>`).join('')}</div>
        <div class="blurb" id="level-blurb">${LEVELS[settings.level].blurbJa}</div></div>
      <div class="opt"><div class="section-title">かべの かず <span class="sub">Walls</span></div>
        <div class="seg" data-seg="walls">${[5, 10, 15, 20].map(n => `<button data-v="${n}" class="${settings.walls === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="opt"><div class="section-title">えいごの ヒント <span class="sub">English word</span></div>
        <label class="toggle compact"><input type="checkbox" data-opt="hints" ${settings.hints ? 'checked' : ''}><span>かべに えいごを だす<small>オフ：にほんごを みて、えいごを いおう！</small></span></label></div>
    </div>

    <div class="msg" id="menu-msg"></div>
    <div class="row">
      <button class="btn big" id="play">あそぶ！ <span class="en">Play!</span></button>
      <button class="btn ghost" id="fs" title="F">⛶ ぜんがめん</button>
    </div>
  </div></div>`);
  renderBooks(); renderPicked();
}

function updatePlayButton() {
  const btn = $('#play'); if (!btn) return;
  const msg = $('#menu-msg');
  if (!settings.cats.length) { btn.disabled = true; btn.innerHTML = 'あそぶ！ <span class="en">Play!</span>'; msg.className = 'msg warn'; msg.textContent = 'カテゴリーを 1つ いじょう えらんでね。'; }
  else if (voice.state === 'ready') { btn.disabled = false; btn.innerHTML = 'あそぶ！ <span class="en">Play!</span>'; msg.className = 'msg'; msg.textContent = ''; }
  else if (voice.state === 'loading') { btn.disabled = true; btn.textContent = `よみこみ中… ${Math.round(voice.progress * 100)}%`; msg.className = 'msg'; msg.textContent = 'はじめては すこし じかんが かかるよ。2かい目からは はやいよ！'; }
  else { btn.disabled = true; btn.textContent = 'こえの よみこみに しっぱい'; msg.className = 'msg warn'; msg.textContent = 'ページを ひらきなおしてね (F5)。それでも ダメなら せんせいに いってね。'; }
}

screens.addEventListener('click', e => {
  const t = e.target.closest('button, input');
  if (!t) return;
  if (t.dataset.book) {
    settings.book = t.dataset.book; sound.play('ui'); save(); renderBooks();
  } else if (t.dataset.cat) {
    const id = t.dataset.cat, on = settings.cats.includes(id);
    settings.cats = on ? settings.cats.filter(c => c !== id) : [...settings.cats, id];
    sound.play('ui'); save(); t.classList.toggle('on', !on); renderPicked();
    const n = settings.cats.filter(c => c.startsWith(settings.book + '/')).length;
    const badge = document.querySelector(`.book[data-book="${settings.book}"]`);
    if (badge) { badge.querySelector('.badge')?.remove(); if (n) badge.insertAdjacentHTML('beforeend', `<i class="badge">${n}</i>`); }
  } else if (t.closest('[data-seg]') && t.dataset.v) {
    const key = t.closest('[data-seg]').dataset.seg;
    settings[key] = key === 'walls' ? +t.dataset.v : t.dataset.v;
    t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t));
    if (key === 'level') $('#level-blurb').textContent = LEVELS[settings.level].blurbJa;
    sound.play('ui'); save();
  } else if (t.dataset.opt) {
    settings[t.dataset.opt] = t.checked; save();
  } else if (t.id === 'play') { sound.play('ui'); startFlow(); }
  else if (t.id === 'fs') toggleFullscreen();
  else if (t.dataset.act) actions[t.dataset.act]?.();
});

const actions = {
  menu: showMenu,
  resume: resumeGame,
  clearcats: () => { settings.cats = []; save(); renderBooks(); renderPicked(); },
  again: () => beginRun(wordsOf(settings.cats)),
  missed: () => {
    const ids = new Set(lastRun.results.filter(r => !r.correct || r.tries > 1).map(r => r.word));
    const missed = pool.filter(w => ids.has(w.id));
    beginRun(missed, Math.max(missed.length, 4));
  },
  skipmic: () => beginRun(wordsOf(settings.cats)),
};

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {});
}

// ---------- start-up flow: mic check (first time) -> countdown ----------
async function startFlow() {
  const words = wordsOf(settings.cats);
  if (micState === 'open') return beginRun(words);
  show(`<div class="screen"><div class="card narrow"><h2>マイクを チェックしよう</h2>
    <p>ブラウザに きかれたら <b>「きょか」</b>を おしてね。<span class="en">Please click Allow when the browser asks.</span></p></div></div>`);
  try {
    await speech.openMic();
    micState = 'open';
  } catch (err) {
    console.warn('Mic unavailable', err);
    micState = 'denied';
    show(`<div class="screen"><div class="card narrow"><h2>マイクが つかえないよ 😢</h2>
      <p>マイクが ブロックされているよ。せんせいに きいてね。または アドレスの よこの 🔒 を おして、マイクを「きょか」してね。そのあと もういちど！<span class="en">The microphone is blocked. Ask your teacher, or click the 🔒 next to the address and allow it.</span></p>
      <div class="row"><button class="btn green" data-act="menu">もどる</button></div></div></div>`);
    micState = 'closed';
    return;
  }
  micCheck(words);
}

let micCheckTarget = null;
function micCheck(words) {
  const target = pick(words);
  speech.setVocabulary([target.id]);
  speech.start();
  show(`<div class="screen"><div class="card narrow">
    <h2>マイク チェック <span class="sub">Microphone check</span></h2>
    <div class="mic-big">${'<i></i>'.repeat(9)}</div>
    <p>この ことばを いってね： <span class="sub">Say this word</span></p>
    <div class="say-word" id="say-word">${esc(target.label)}</div>
    <div class="msg" id="mic-msg">きいているよ… いってみよう！</div>
    <div class="row"><button class="btn green big" id="mic-go" data-act="skipmic" hidden>スタート！ <span class="en">Let's go!</span></button>
      <button class="btn ghost" data-act="skipmic">スキップ</button></div>
  </div></div>`);
  micCheckTarget = target.id;
}

// ---------- run ----------
/** Tune the listener to this run: the words on the walls (+ a few others), plus sound-alikes for the stricter levels. */
function configureListener(seq) {
  const lv = LEVELS[settings.level];
  const inSeq = new Map(seq.map(w => [w.id, w]));
  const fillers = shuffle(pool.filter(w => !inSeq.has(w.id))).slice(0, 12);
  const grammar = [...inSeq.values(), ...fillers];
  const decoys = lv.alike === 'none' ? [] : [...new Set(grammar.flatMap(w => lv.alike === 'near' ? w.near : [...w.near, ...w.nearer.slice(0, 3)]))];
  speech.setVocabulary(grammar.map(w => w.id), { decoys, open: lv.open, same: Object.fromEntries(grammar.map(w => [w.id, w.same])) });
  speech.start();
  return grammar;
}

async function beginRun(words, wallCount = settings.walls) {
  pool = words;
  micCheckTarget = null;
  if (needsMoreGlyphs(words)) {
    show(`<div class="screen"><div class="card narrow"><h2>じゅんび中…</h2><div class="bar"><i style="width:60%"></i></div></div></div>`);
    await loadGlyphs();
  }
  clearScreens();
  playing = true;
  lastRun = { results: [] };
  hud.hidden = false;
  $('#btn-hint').hidden = settings.hints;
  $('#progress').innerHTML = '<i></i>'.repeat(wallCount);
  $('#streak').textContent = '';
  setHeard('ことばを いってね！', 'idle');
  const seq = pickSequence(words, wallCount);
  const grammar = configureListener(seq);
  game.start({ seq, allWords: grammar, level: settings.level, labels: settings.hints });
}

function pauseGame() {
  if (!playing || game.mode === 'paused' || game.mode === 'done') return;
  game.pause(); speech.stop();
  show(`<div class="screen dim"><div class="card narrow"><h2>ポーズ <span class="sub">Paused</span></h2>
    <div class="row"><button class="btn green big" data-act="resume">つづける</button><button class="btn ghost" data-act="menu">メニュー</button></div></div></div>`);
}
function resumeGame() {
  clearScreens(); game.resume(); speech.start();
}

// ---------- hearing ----------
let heardTimer = 0;
function setHeard(text, cls) {
  const el = $('#heard'); el.textContent = text; el.className = cls || '';
  clearTimeout(heardTimer);
  if (cls && cls !== 'idle') heardTimer = setTimeout(() => setHeard('ことばを いってね！', 'idle'), 2600);
}

speech.addEventListener('heard', e => {
  const d = e.detail;
  const text = (d.text || '').replace(/\[unk\]/g, '…').trim();
  if (micCheckTarget) {
    if (d.word === micCheckTarget) {
      sound.play('correct');
      $('#say-word').classList.add('ok'); $('#mic-msg').textContent = 'できた！ すごい！';
      $('#mic-go').hidden = false; micCheckTarget = null;
    } else if (d.final && text && text !== '…') $('#mic-msg').textContent = `きこえた: “${text}”。もういちど！`;
    return;
  }
  if (!playing) return;
  const lv = LEVELS[settings.level];
  if (d.word) {
    if (!d.final) { if (lv.partials) { setHeard(`きこえた: “${text}”`, 'hit'); game.say(d.word); } return; }
    if (d.conf >= lv.minConf) { setHeard(`きこえた: “${text}”`, 'hit'); game.say(d.word); }
    else { setHeard(`おしい！“${d.word}” を もっと はっきり！`, 'miss'); }
  } else if (d.final) {
    if (d.unclear || (d.decoy && d.conf >= 0.6)) {      // a sound-alike heard with confidence (room noise lands on a decoy now and then: ignore that)
      setHeard(d.unclear && d.openText ? `“${d.openText}” に きこえたよ。もういちど！` : `“${d.decoy}” に きこえたよ。もういちど！`, 'miss');
      game.mishear();
    } else if (d.decoy) { /* probably noise */ } else if (text && text !== '…') setHeard(`きこえた: “${text}”`, 'miss');
  } else if (text && lv.partials) setHeard(`きこえた: “${text}”`, 'miss');
});

// ---------- HUD events ----------
$('#btn-hint').addEventListener('click', () => game.peek(3));

game.addEventListener('progress', e => {
  const { streak } = e.detail;
  $('#streak').textContent = streak >= 2 ? `🔥${streak}` : '';
});

const PRAISE = ['いいね！', 'すごい！', 'やったね！', 'さいこう！', 'ナイス！', 'パーフェクト！'];
function popup(html, bad = false) {
  const p = $('#popup'); p.hidden = false; p.className = bad ? 'bad' : ''; p.innerHTML = html;
  p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
}
game.addEventListener('result', e => {
  const { ok, word, tries, streak } = e.detail;
  const dots = $('#progress').children, i = game.results.length - 1;
  if (dots[i]) dots[i].classList.add(ok ? (tries === 1 ? 'ok' : 'retry') : 'bad');
  if (ok) popup(tries > 1 ? 'ふう！ できたね！' : streak >= 3 ? `🔥 ${streak}れんぞく！` : pick(PRAISE));
  else popup(`かべが たおれた！<small>こたえは “${esc(word.label)}”</small>`, true);
});
game.addEventListener('bonk', e => {
  const { attempts, max, said, word } = e.detail;
  const left = max - attempts;
  popup(`ゴツン！<small>${left > 0 ? (left === 1 ? 'ラストチャンス！' : 'もういちど！') : ''}${said ? ` (きみの こえ: “${esc(said)}”)` : ''}</small>`, true);
  setHeard(`いってね: “${esc(word.label)}”`, 'miss');
});
game.addEventListener('countdown', e => {
  const c = $('#countdown');
  if (e.detail === null) { c.hidden = true; return; }
  c.hidden = false; c.innerHTML = `<b>${e.detail === 0 ? 'GO!' : e.detail}</b>`;
});
game.addEventListener('finish', e => {
  const r = e.detail; playing = false; speech.stop();
  lastRun.results = r.results; hud.hidden = true;
  const missed = r.results.filter(x => !x.correct || x.tries > 1);
  const title = r.stars === 3 ? 'すばらしい！' : r.stars === 2 ? 'よくできました！' : 'ナイス トライ！';
  const stars = `<div class="stars">${[1, 2, 3].map(n => `<span class="${n <= r.stars ? 'on' : ''}">⭐</span>`).join('')}</div>`;
  const byWord = new Map();
  r.results.forEach(x => { const prev = byWord.get(x.word); byWord.set(x.word, { ...x, correct: prev ? prev.correct && x.correct : x.correct, tries: Math.max(prev?.tries || 0, x.tries) }); });
  show(`<div class="screen dim"><div class="card narrow">
    <h2 style="margin:.2rem 0 .4rem">${title}</h2>${stars}
    <div class="score">${r.correct} / ${r.total} <span class="sub">せいかい</span>${r.bestStreak >= 3 ? ` &nbsp;🔥 ${r.bestStreak}` : ''}</div>
    <div class="msg">1かいで せいかい: ${r.firstTry}こ</div>
    <div class="words">${[...byWord.values()].map(x => `<span class="wchip ${x.correct ? '' : 'bad'}">${x.correct ? '✓' : '✗'} ${esc(x.label)}${x.correct && x.tries > 1 ? ` <small>(${x.tries}かい)</small>` : ''}${!x.correct && x.said ? ` <small>(きみの こえ: ${esc(x.said)})</small>` : ''}</span>`).join('')}</div>
    <div class="row">
      <button class="btn green" data-act="again">もういちど</button>
      ${missed.length ? '<button class="btn blue" data-act="missed">まちがえた ことばを れんしゅう</button>' : ''}
      <button class="btn ghost" data-act="menu">メニュー</button>
    </div></div></div>`);
});

// ---------- meter ----------
const bars = [...document.querySelectorAll('#mic-meter i')];
(function meterLoop() {
  const lvl = speech.level;
  const big = document.querySelectorAll('.mic-big i');
  bars.forEach((b, i) => { b.style.height = `${12 + Math.min(88, lvl * 100 * (0.55 + 0.45 * Math.sin(performance.now() / 90 + i * 1.7) ** 2))}%`; });
  big.forEach((b, i) => { b.style.height = `${14 + Math.min(86, lvl * 120 * (0.5 + 0.5 * Math.sin(performance.now() / 110 + i * 1.3) ** 2))}%`; });
  requestAnimationFrame(meterLoop);
})();

// ---------- keyboard & visibility ----------
addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFullscreen();
  if (!playing) return;
  if (k === 'escape' || k === 'p') (game.mode === 'paused' ? resumeGame : pauseGame)();
  else if (k === 'h') $('#btn-hint').click();
});
$('#btn-pause').addEventListener('click', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

window.__shaperunner = { game, speech, settings, voice, wordsOf, beginRun, pickSequence, outlineFor, loadGlyphs, BOOKS, buildWall, disposeWall };
showMenu();
