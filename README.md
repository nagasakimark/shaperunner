# Shape Runner

A pronunciation game for Japanese elementary students learning English. A toy-brick wall with a hole in it
waits across the track. **Say the word** and your mascot morphs into that shape so it fits through the hole.

The hole is cut in the shape of the word's Japanese text (kanji, kana or numerals), so students *see the Japanese and say the
English*. The English word is printed on the wall as a hint (switch it off on the menu to test yourself).

## Menu

1. **Pick your book**: Let's Try! 1, Let's Try! 2, New Horizon 5, New Horizon 6, My Picture Dictionary (the cover images are `src/data/vocab/*.jpg`).
2. **Pick categories** (as many as you like, from any book): Animals, Colors, Months, Jobs, Town, Sports ... 101 category lists
   built from your textbook files (see *Vocabulary* below).
3. **How carefully?** (pronunciation level, see below) and the number of walls.

The game always runs at the same gentle speed. The levels are about *how well you have to say it*, not how fast you run.

## Levels

| Level | What it takes | Tries per wall |
| --- | --- | --- |
| **Starter** | The word is accepted as soon as it is heard, as long as it is close. | 5 |
| **Clear** | The whole word, clearly (listener confidence 60%+). | 4 |
| **Careful** | *Sound-alike* words compete with the right answer: "right" must not sound like "light", "sheep" not like "ship", "three" not like "tree". The listener's confidence has to be 75%+. | 4 |
| **Expert** | Many more sound-alikes compete (confidence 80%+) **and** a second listener with no word list at all has to understand you too. | 3 |

How the sound-alikes work: the recogniser is only given the words of the run, which makes it accurate but also very
forgiving (anything close enough to *some* word counts). In Careful/Expert we add words that sound almost the same
as each target (found with the CMU pronouncing dictionary, weighting the classic Japanese-speaker mix-ups: L/R, B/V, S/TH, F/H,
ship/sheep, ...). Now a muddy "right" is heard as "light" and the game says so: *I heard "light". Try again!*
The student's score for the word also drops when the sounds compete, which is why a confidence limit means something.

## Vocabulary

Source: `src/data/vocab/<book>/*.json` (one entry per word: English, Japanese, picture path). The game does **not** use the
per-word pictures. Each picture path contains a category folder (`categories/Animals/Cat.jpg` is in *Animals*), and that is how every
book is split into categories. `scripts/make_vocab.py` turns it into:

* `src/data/packs.json`: books → categories → words (English label, what to say, Japanese text, sound-alikes)
* `src/data/glyphs-ja.json`: outlines of the ~650 Japanese characters used (loaded only when a category needs them)

Run `npm run vocab` (needs `pip install fonttools cmudict wordfreq`, and `vosk` with `--model <folder>` to re-check which English
words the voice model knows) after changing the word lists. The category choices per book are in the `BOOKS` list at the top of the script.

What's left out, on purpose: verbs in the past tense (ate/eight, went, saw ...), everyday phrases (*brush my teeth*), time phrases, the alphabet
and any word the voice model doesn't know (kendo, gyoza, okonomiyaki, patissier) or whose Japanese is longer than 9 characters.

**Category pictures:** put one picture per category in `src/data/vocab/categories/`, named after the category: `Animals.jpg`, `Colors.jpg`,
`FruitAndVegetables.jpg`, `Things Around You.jpg` ... (capitals, spaces and `&` don't matter; jpg/png/webp). Anything without a picture shows its emoji.
Keep them small (about 300×300): they're bundled into the page.

**Picture shapes:** most words are cut as a picture, not as Japanese text: `scripts/emoji_map.py` maps ~500 English words to a Noto Emoji outline
(cat, pizza, bus, soccer ball ...). `make_vocab.py` fills each outline into a solid silhouette (balls, panda and a few boxed icons keep their dark details as
holes), and arrows are hand-drawn. Words with no good picture (feelings, grammar words, countries ...) still use their Japanese text. Add a word by adding
`label emoji` to `emoji_map.py` and running `npm run vocab`. (Outlines: `@fontsource/noto-emoji`, SIL OFL.)

**Drawn shapes** (scripts/make_vocab.py, `custom_arrows`): arrows, a U-turn, big/small circles, long/short bars, high/low triangles (these keep their drawn size,
so "Small" really is small) and twelve feelings as a face with the eyes and mouth cut out. Family and people use the emoji faces with their hair and features cut out.

**Flags:** countries (Countries / World categories) are cut as a 3:2 banner. The real flag (`src/data/flags/*.svg`, from the MIT-licensed flag-icons set, see
`LICENSE-flag-icons.txt`) hangs in the opening, see-through, so you can see which flag to match; the mascot turns into that flag. The country-to-flag table is `FLAGS` in `scripts/emoji_map.py`.

**Spaces and capitals never matter:** what the listener hears is compared with spaces, capitals and punctuation removed, so "text book" = "textbook",
"tv" = "TV" = "t v", "t shirt" = "tshirt". This also applies to Expert's second listener.

Special categories: **Colors** (a paint splat in that colour), **Shapes** (real outlines: circle, star, heart, diamond, moon, oval, cross ...),
**Numbers** (the digits 0, 1, 2 ... 100), **Days** (one kanji: 月 → Monday), **Months** (1月 → January), **Dates** (1日 → first).

## Privacy

Speech recognition runs **entirely inside the browser** (Vosk compiled to WebAssembly). The model is a static
file served with the game; no audio is ever uploaded and the game makes no network requests to anyone else.
The only thing stored is the teacher's settings, in `localStorage` on that Chromebook. First load downloads the ~40 MB voice
model once; it is cached (Cache Storage) so later visits start quickly.

## How the game works

The layout follows the TikTok original: walls stand across a track and your mascot runs along it, seen from the side.
When the mascot reaches a wall the game checks **once** whether its current shape matches the hole:

* **Fits** → it slides through the hole (you can still see it as a ghost behind the wall).
* **Doesn't fit** → **bonk**: it bounces back, sees stars, and you get another go. You can change your answer while it's bouncing.
* **Out of tries** → the wall tips over and the run carries on.

There is no physics: a wall is just an `x` position compared with the player's `x`, so nothing can pass through a wall
or get stuck in one. Movement is in units per second, so it plays the same on every Chromebook, and the render
resolution lowers itself automatically on slow machines.

Each run the listener is tuned to the words actually on the walls plus about 12 others from the chosen categories
(a small word list is what keeps it accurate). Words that share a spoken form or a hole shape are only used once per run.

| File | What it does |
| --- | --- |
| `src/main.js` | Menu, mic check, HUD, results, wires everything together |
| `src/game.js` | Scene, camera, run state machine (run → bonk → dizzy → retry / fall), level table |
| `src/speech.js` | Offline Vosk recogniser (phrases, sound-alikes, Expert's second listener), microphone via AudioWorklet, model cache |
| `src/vocab.js` | Loads `packs.json`; textbook covers and category pictures |
| `src/shapes.js` | Outlines for holes and the player's body (primitives + kanji/kana/digit glyphs, multi-character layout) |
| `src/wall.js`, `src/player.js`, `src/world.js`, `src/fx.js` | The 3D pieces |
| `scripts/make_vocab.py` | Builds `packs.json` and `glyphs-ja.json` from the textbook files |
| `scripts/make_glyphs.py` | Builds `glyphs.json` (digits + day kanji). Fonts: Noto Sans CJK JP Bold (SIL OFL) |
| `public/model/model.tar.gz` | `vosk-model-small-en-us-0.15` (Apache 2.0) |

Keys: `Esc`/`P` pause, `H` hint (shows the English word for a few seconds), `F` full screen.

## Develop

```
npm install
npm run dev        # http://localhost:3000
npm run build      # -> dist/
npm run deploy     # publishes dist/ to GitHub Pages (gh-pages branch), or push to main and let the workflow do it
```
