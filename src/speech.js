// Offline speech recognition (Vosk, running in a Web Worker as WebAssembly).
// Nothing is uploaded: the model is a static file served with the game and the audio never leaves the page.
// The recogniser is given a tiny grammar (just the words in the chosen packs + "[unk]"),
// which is what makes it far more accurate than general dictation.

const MODEL_URL = `${import.meta.env.BASE_URL}model/model.tar.gz`;
const CACHE_NAME = 'shaperunner-model-v1';

async function fetchModelBlobUrl(onProgress) {
  let cache = null;
  try { cache = await caches.open(CACHE_NAME); } catch { /* not available (e.g. insecure context) */ }
  if (cache) {
    const hit = await cache.match(MODEL_URL);
    if (hit) { onProgress?.(1); return URL.createObjectURL(await hit.blob()); }
  }
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed (${res.status})`);
  const total = +res.headers.get('Content-Length') || 41205354;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress?.(Math.min(1, got / total));
  }
  const blob = new Blob(chunks, { type: 'application/gzip' });
  if (cache) { try { await cache.put(MODEL_URL, new Response(blob)); } catch { /* quota: fine, just re-download next time */ } }
  return URL.createObjectURL(blob);
}

/** letters and digits only, lower case: the safety net for spaces / capitals / punctuation */
export const squash = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const WORKLET = `
class MicTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; this.sum = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      this.buf[this.n++] = v; this.sum += v * v;
      if (this.n === this.buf.length) {
        this.port.postMessage({ pcm: this.buf, rms: Math.sqrt(this.sum / this.n) }, [this.buf.buffer]);
        this.buf = new Float32Array(2048); this.n = 0; this.sum = 0;
      }
    }
    return true;
  }
}
registerProcessor('mic-tap', MicTap);`;

export class Speech extends EventTarget {
  constructor() {
    super();
    this.model = null; this.rec = null; this.ctx = null; this.stream = null; this.node = null;
    this.level = 0;        // 0..1 smoothed mic loudness, for the meter
    this.listening = false;
    this.words = [];
    this.openWaiters = [];
  }

  async loadModel(onProgress) {
    if (this.model) return;
    const [url, { createModel }] = await Promise.all([fetchModelBlobUrl(onProgress), import('vosk-browser')]);
    this.model = await createModel(url, -1);
    URL.revokeObjectURL(url);
  }

  async openMic() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const feed = (pcm, rms) => {
      this.level = Math.max(Math.min(1, rms * 9), this.level * 0.85);
      if (this.listening && this.rec) {
        this.rec.acceptWaveformFloat(pcm, this.ctx.sampleRate);
        this.open?.acceptWaveformFloat(pcm, this.ctx.sampleRate);
      }
    };
    const mute = this.ctx.createGain(); mute.gain.value = 0;   // keep the graph alive without any sound output
    mute.connect(this.ctx.destination);
    try {
      // AudioWorklet runs on the audio thread, so a busy game frame can never make us drop microphone audio.
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.node = new AudioWorkletNode(this.ctx, 'mic-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.node.port.onmessage = e => feed(e.data.pcm, e.data.rms);
    } catch (err) {
      console.warn('AudioWorklet unavailable, falling back to ScriptProcessor', err);
      this.node = this.ctx.createScriptProcessor(4096, 1, 1);
      this.node.onaudioprocess = e => {
        const data = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        feed(new Float32Array(data), Math.sqrt(sum / data.length));
      };
    }
    src.connect(this.node);
    this.node.connect(mute);
  }

  /**
   * Listen for exactly these words (single words or short phrases such as "rice ball").
   * @param {string[]} words    what the student may be asked to say
   * @param {object}   o
   * @param {string[]} o.decoys sound-alike words added to the grammar: if the student's sound is closer to one of them,
   *                            we hear THAT word instead (and its probability share is taken from the right answer)
   * @param {boolean}  o.open   also run an unrestricted listener and require it to agree (Expert)
   * @param {Object<string,string[]>} o.same  words that sound exactly the same ("two" = "to"), accepted by the unrestricted listener
   */
  setVocabulary(words, { decoys = [], open = false, same = {} } = {}) {
    this.words = [...words];
    this.wordSet = new Set(words);
    this.decoySet = new Set(decoys.filter(d => !this.wordSet.has(d)));
    this.same = same;
    this.squashed = new Map(words.map(w => [squash(w), w]));
    this.rec?.remove(); this.open?.remove(); this.open = null;
    this.lastOpen = null; this.openWaiters = [];
    const rate = this.ctx?.sampleRate || 48000;
    this.rec = new this.model.KaldiRecognizer(rate, JSON.stringify([...this.words, ...this.decoySet, '[unk]']));
    this.rec.setWords(true);
    this.rec.on('partialresult', m => {
      const text = (m.result.partial || '').trim();
      const hit = this.match(text.split(/\s+/).filter(Boolean), true);
      this.dispatchEvent(new CustomEvent('heard', { detail: { text, word: hit.word, decoy: hit.decoy, final: false, conf: 0 } }));
    });
    this.rec.on('result', m => {
      const items = (m.result.result || []).filter(i => i.word !== '[unk]');
      const hit = this.match(items.map(i => i.word), false, items);
      const detail = { text: m.result.text || '', word: hit.word, decoy: hit.decoy, final: true, conf: hit.conf };
      if (open && hit.word) this.confirmWithOpen(detail); else this.dispatchEvent(new CustomEvent('heard', { detail }));
    });
    if (open) {
      this.open = new this.model.KaldiRecognizer(rate);
      this.open.setWords(true);
      this.open.on('result', m => { if (m.result.text) { this.lastOpen = { text: m.result.text, t: performance.now() }; this.openWaiters.splice(0).forEach(f => f()); } });
    }
  }

  /** The last spoken tokens that form a known phrase (preferring the longest), else the last sound-alike.
   *  Spaces, capitals and punctuation never matter: "text book" = "textbook", "t v" = "tv" = "TV". */
  match(tokens, partial, items = []) {
    for (let i = 0; i < tokens.length; i++) {
      const phrase = tokens.slice(i).join(' ');
      const word = this.wordSet.has(phrase) ? phrase : this.squashed.get(squash(phrase));
      if (word) {
        // while the student is still talking "rice" must not count if "rice ball" could still follow
        if (partial && this.words.some(w => w !== word && w.startsWith(phrase + ' '))) return { word: null, decoy: null, conf: 0 };
        const conf = items.length ? Math.min(...items.slice(i).map(x => x.conf)) : 0;
        return { word, decoy: null, conf };
      }
    }
    let at = -1;
    tokens.forEach((t, i) => { if (this.decoySet.has(t)) at = i; });
    return { word: null, decoy: at >= 0 ? tokens[at] : null, conf: at >= 0 && items[at] ? items[at].conf : 0 };
  }

  /** Expert: wait briefly for the unrestricted listener, which must have heard the same word with no help. */
  confirmWithOpen(detail) {
    const gt = performance.now();
    new Promise(res => { this.openWaiters.push(res); setTimeout(res, 700); }).then(() => {
      const o = this.lastOpen;
      const heard = o && Math.abs(o.t - gt) < 1000 ? o.text : '';
      const ok = !!heard && this.openAgrees(heard, detail.word);
      this.dispatchEvent(new CustomEvent('heard', {
        detail: { ...detail, word: ok ? detail.word : null, text: ok ? detail.text : (heard || detail.text), unclear: !ok, openText: heard },
      }));
    });
  }

  /** Does the unrestricted listener's text contain the word (or an identical-sounding one), ignoring spaces and case? */
  openAgrees(heard, word) {
    const toks = heard.toLowerCase().split(/\s+/).filter(Boolean);
    const want = new Set([word, ...(this.same[word] || [])].map(squash));
    for (let i = 0; i < toks.length; i++) {
      let acc = '';
      for (let j = i; j < toks.length && acc.length <= 40; j++) { acc += squash(toks[j]); if (want.has(acc)) return true; }
    }
    return false;
  }

  pick(tokens) { return [...tokens].reverse().find(t => this.words.includes(t)) || null; }

  start() { this.listening = true; this.ctx?.resume(); }
  stop() { this.listening = false; }

  close() {
    this.listening = false;
    this.rec?.remove(); this.rec = null; this.open?.remove(); this.open = null;
    this.node?.disconnect(); this.node = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.ctx?.close(); this.ctx = null;
  }
}
