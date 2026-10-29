"""Turns the textbook word lists in src/data/vocab/ into the compact data the game loads.

Run:  python3 scripts/make_vocab.py [--model path/to/vosk-model-small-en-us-0.15] [--font path/to/NotoSansCJK-Bold.ttc]

Needs:  pip install fonttools cmudict wordfreq   (and `vosk` if you pass --model)

Writes
  src/data/packs.json      books -> categories -> words (English label, what to say, Japanese text for the hole,
                           sound-alike words for the strict levels)
  src/data/glyphs-ja.json  outlines of every Japanese character those words need (the original digits and
                           day kanji stay in glyphs.json)
  scripts/lexicon.json     which English words the speech model does / does not know (cached between runs)

A category is a folder name inside the picture paths of the source files ("categories/Animals/Cat.jpg" -> Animals),
so every textbook is split into the same clean categories as the picture dictionary.
"""
import argparse, collections, glob, json, os, re, sys, tempfile, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB = os.path.join(ROOT, 'src/data/vocab')

# ---------------------------------------------------------------- categories
# key: (title, Japanese, emoji, source folder(s) in the image path, special rendering)
CATS = {
    'colors':       ('Colors', 'いろ', '🎨', ['Colors'], 'color'),
    'numbers':      ('Numbers', 'かず', '🔢', ['Numbers'], 'number'),
    'shapes':       ('Shapes', 'かたち', '⭐', ['Shapes'], 'shape'),
    'days':         ('Days of the Week', 'ようび', '📅', ['Days of the Week'], 'days'),
    'months':       ('Months', 'つき', '🗓️', ['Months'], 'months'),
    'dates':        ('Dates', 'ひづけ', '📆', ['Dates'], 'dates'),
    'animals':      ('Animals', 'どうぶつ', '🐼', ['Animals'], None),
    'sea':          ('Sea Animals', 'うみのいきもの', '🐬', ['Sea Animals'], None),
    'bugs':         ('Bugs', 'むし', '🐞', ['Bugs'], None),
    'body':         ('Body', 'からだ', '🖐️', ['Body'], None),
    'feelings':     ('Feelings', 'きもち', '😊', ['Feelings'], None),
    'family':       ('Family', 'かぞく', '👪', ['Family'], None),
    'people':       ('People', 'ひと', '🧒', ['People'], None),
    'personality':  ('Personalities', 'せいかく', '💪', ['Personality'], None),
    'opinions':     ('Nice Words', 'ほめことば', '👍', ['Thoughts & Appearances'], None),
    'describing':   ('Describing Words', 'ようす', '📏', ['State'], None),
    'fruitveg':     ('Fruits & Vegetables', 'くだもの・やさい', '🍎', ['FruitAndVegetables'], None),
    'food':         ('Food', 'たべもの', '🍔', ['Food'], None),
    'drinks':       ('Drinks', 'のみもの', '🥤', ['Drinks'], None),
    'dessert':      ('Desserts', 'おかし', '🍰', ['Dessert'], None),
    'ingredients':  ('Ingredients', 'ざいりょう', '🥓', ['Ingredients'], None),
    'meals':        ('Meals', 'しょくじ', '🍽️', ['Meals'], None),
    'tastes':       ('Tastes', 'あじ', '😋', ['Tastes'], None),
    'weather':      ('Weather', 'てんき', '☀️', ['Weather'], None),
    'seasons':      ('Seasons', 'きせつ', '🌸', ['Seasons'], None),
    'nature':       ('Nature', 'しぜん', '🏔️', ['Nature'], None),
    'clothes':      ('Clothes', 'ふく', '👕', ['Clothes'], None),
    'stationery':   ('Stationery', 'ぶんぼうぐ', '✏️', ['Stationery', 'Stationary'], None),
    'things':       ('Things Around You', 'みのまわり', '🎒', ['Things Around You'], None),
    'school':       ('School Places', 'がっこう', '🏫', ['School'], None),
    'subjects':     ('School Subjects', 'きょうか', '📚', ['Subjects'], None),
    'schoolevents': ('School Events', 'ぎょうじ', '🎓', ['School Events'], None),
    'clubs':        ('Club Activities', 'ぶかつ', '🏸', ['Club Activities'], None),
    'sports':       ('Sports', 'スポーツ', '⚽', ['Sports'], None),
    'activities':   ('Hobbies', 'しゅみ', '🎣', ['Activities'], None),
    'instruments':  ('Instruments', 'がっき', '🎹', ['Instruments'], None),
    'jobs':         ('Jobs', 'しごと', '👩‍🚀', ['Jobs'], None),
    'town':         ('Town', 'まち', '🏙️', ['Town'], None),
    'world':        ('World', 'せかい', '🌏', ['World'], None),
    'countries':    ('Countries', 'くに', '🗾', ['World'], None),
    'directions':   ('Directions', 'みちあんない', '🧭', ['Directions'], None),
    'location':     ('Location Words', 'いち', '📍', ['Location Words'], None),
    'frequency':    ('How Often?', 'ひんど', '🔁', ['Frequency'], None),
    'events':       ('Annual Events', 'ぎょうじ', '🎄', ['Annual Events'], None),
    'environment':  ('Environment', 'かんきょう', '🌍', ['Problems with living things & what we can do'], None),
    'actions':      ('Action Words', 'うごき', '🏃', ['Present Tense'], None),
}

# Per-book list of (category key, options).  Options:  also=[words from anywhere in the book],
# only=[keep only these], skip=[drop these], folders=[override source folders]
BOOKS = [
    ('LT1', "Let's Try! 1", [
        ('colors', {}), ('numbers', {}), ('shapes', {}), ('animals', {}), ('body', {}),
        ('feelings', {'also': ['excited', 'surprised']}), ('fruitveg', {}), ('sports', {}), ('countries', {}),
    ]),
    ('LT2', "Let's Try! 2", [
        ('colors', {}), ('days', {}),
        ('weather', {'folders': ['Weather', 'Tastes'], 'only': ['sunny', 'cloudy', 'rainy', 'snowy', 'hot', 'cold']}),
        ('clothes', {'also': ['shorts']}), ('stationery', {}), ('fruitveg', {}),
        ('school', {'also': ['science room', 'school office', 'lunch room', 'cooking room', 'arts and crafts room']}),
        ('directions', {'only': ['go', 'straight', 'turn', 'left', 'right']}),
        ('countries', {}),
    ]),
    ('NH5', 'New Horizon 5', [
        ('subjects', {}), ('sports', {}), ('months', {}), ('dates', {}), ('numbers', {}), ('jobs', {}), ('town', {}),
        ('food', {}), ('drinks', {}), ('instruments', {}), ('people', {}), ('personality', {}),
        ('directions', {}), ('location', {}), ('things', {}), ('describing', {}), ('opinions', {}),
        ('seasons', {}), ('activities', {}), ('sea', {'folders': ['Sea Animals'],
                                                       'also': ['whale', 'dolphin', 'penguin', 'sea turtle', 'fish', 'shark', 'crab', 'jellyfish']}),
        ('actions', {}),
    ]),
    ('NH6', 'New Horizon 6', [
        ('world', {}), ('activities', {}), ('sports', {}), ('things', {}), ('town', {}), ('opinions', {}),
        ('weather', {}), ('actions', {}), ('clothes', {}), ('ingredients', {}), ('nature', {}), ('sea', {}),
        ('animals', {}), ('environment', {}), ('schoolevents', {}), ('jobs', {}), ('frequency', {}),
    ]),
    ('PD', 'My Picture Dictionary', [
        ('animals', {}), ('sea', {}), ('bugs', {}), ('body', {}), ('feelings', {}), ('family', {}), ('people', {}),
        ('personality', {}), ('fruitveg', {}), ('food', {}), ('drinks', {}), ('dessert', {}), ('ingredients', {}),
        ('meals', {}), ('tastes', {}), ('weather', {}), ('seasons', {}), ('nature', {}), ('clothes', {}),
        ('stationery', {}), ('things', {}), ('school', {}), ('subjects', {}), ('schoolevents', {}), ('clubs', {}),
        ('sports', {}), ('activities', {}), ('instruments', {}), ('jobs', {}), ('town', {}), ('world', {}),
        ('directions', {}), ('location', {}), ('frequency', {}), ('events', {}), ('describing', {}), ('opinions', {}),
        ('numbers', {}), ('dates', {}), ('months', {}), ('days', {}), ('colors', {}), ('shapes', {}),
        ('actions', {}), ('environment', {}),
    ]),
]

# words that are a label for the category rather than something to practise
HEADERS = {'days', 'one week', 'date', 'numbers', 'months', 'colors', 'shapes', 'subjects', 'seasons', 'nature',
           'sea animals', 'animals', 'jobs', 'school events', 'meals', 'weather', 'sports', 'food', 'drinks',
           'club activities', 'clothes', 'family', 'world', 'dessert', 'country', 'culture', 'now', 'future'}

JA_FIX = {'ruler': 'ものさし', 'restroom': 'トイレ'}                       # typos / nicer wording in the source data
JA_FIX_CAT = {('jobs', 'cook'): 'コック', ('drinks', 'water'): '水'}

COLOR_HEX = {'red': 0xf0383c, 'blue': 0x2f7bff, 'green': 0x31c24a, 'yellow': 0xffd62e, 'purple': 0x9b4dff,
             'orange': 0xff8a1f, 'pink': 0xff7ab8, 'brown': 0x8a5a36, 'black': 0x2b2b3a, 'white': 0xfafafa,
             'gray': 0x9aa3b2, 'silver': 0xc9d0dc, 'gold': 0xe9b824, 'light blue': 0x62c8ff, 'yellow green': 0xa6d72c}
SHAPE_KINDS = {'circle', 'triangle', 'square', 'rectangle', 'heart', 'star', 'diamond', 'moon', 'oval', 'cross'}
NUMBERS = {w: i for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split())}
NUMBERS.update({'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'one hundred': 100})
DAYS = {'sunday': '日', 'monday': '月', 'tuesday': '火', 'wednesday': '水', 'thursday': '木', 'friday': '金', 'saturday': '土'}
MONTHS = {m: i + 1 for i, m in enumerate('january february march april may june july august september october november december'.split())}
ORD = {w: i + 1 for i, w in enumerate('first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth'.split())}
for i, w in enumerate('twenty-first twenty-second twenty-third twenty-fourth twenty-fifth twenty-sixth twenty-seventh twenty-eighth twenty-ninth'.split()):
    ORD[w] = 21 + i
ORD['thirtieth'] = 30; ORD['thirty-first'] = 31

MAX_CHARS = 9


def norm_id(english):
    """what the speech recogniser must hear"""
    s = english.strip().lower()
    s = s.replace('p.e.', 'p e').replace('t-shirt', 't shirt').replace('the u.k.', 'the u k').replace('tv', 't v')
    s = re.sub(r"[-]", ' ', s)
    s = re.sub(r"[^a-z' ]", '', s)
    return re.sub(r'\s+', ' ', s).strip()


def label_of(english):
    e = english.strip()
    return e[0].upper() + e[1:] if e and e[0].islower() else e


# ---------------------------------------------------------------- load the source files
def load_groups():
    groups = collections.defaultdict(lambda: collections.OrderedDict())     # (book, folder) -> english -> item
    everything = collections.defaultdict(dict)                              # book -> english -> item
    for book in ('LT1', 'LT2', 'NH5', 'NH6', 'PD'):
        for f in sorted(glob.glob(f'{VOCAB}/{book}/*.json')):
            s = open(f, encoding='utf-8').read()
            if not s.strip():
                continue
            d = json.loads(s)
            d = d.get('items', d) if isinstance(d, dict) else d
            for x in d:
                img = urllib.parse.unquote(x.get('image', ''))
                m = re.search(r'categories/([^/]+)', img)
                folder = m.group(1) if m else '?'
                item = {'en': x['english'], 'ja': x['japanese']['kanji'], 'bonus': bool(x.get('bonus')), 'folder': folder}
                groups[(book, folder)].setdefault(x['english'], item)
                everything[book].setdefault(x['english'], item)
    return groups, everything


def build_categories(groups, everything):
    books = []
    words = {}                       # id -> word dict (shared by every pack that uses it)
    packs = {}
    conflicts = []
    for book, title, cats in BOOKS:
        keys = []
        for ckey, opt in cats:
            ctitle, cja, icon, folders, special = CATS[ckey]
            folders = opt.get('folders', folders)
            items = collections.OrderedDict()
            for fo in folders:
                for (b, f), group in groups.items():
                    if b == book and f == fo:
                        for en, it in group.items():
                            if book != 'PD' and it['bonus']:
                                continue
                            items.setdefault(en, it)
            for en in opt.get('also', []):
                if en in everything[book]:
                    items.setdefault(en, everything[book][en])
            if 'only' in opt:
                items = collections.OrderedDict((e, v) for e, v in items.items() if e in opt['only'])
            out, seen_ja = [], set()
            for en, it in items.items():
                if en.lower() in HEADERS:
                    continue
                w = make_word(ckey, special, en, it)
                if not w:
                    continue
                key = w.get('j') or w['i']
                if key in seen_ja:        # two words with the same Japanese would be the same hole: keep the first
                    continue
                seen_ja.add(key)
                wkey = w['i']             # same English but a different picture (orange the colour / the fruit) gets its own entry
                while wkey in words and (words[wkey].get('j') != w.get('j') or words[wkey]['k'] != w['k']):
                    wkey += '~'
                words.setdefault(wkey, w)
                out.append(wkey)
            if len(out) >= 3:
                pid = f'{book}/{ckey}'
                packs[pid] = out
                keys.append(ckey)
        books.append({'id': book, 'title': title, 'cats': keys})
    return books, words, packs, conflicts


def make_word(ckey, special, en, it):
    wid = norm_id(en)
    if not wid:
        return None
    w = {'i': wid, 'l': label_of(en)}
    if special == 'color':
        if wid not in COLOR_HEX:
            return None
        w.update(k='c', c=COLOR_HEX[wid])
    elif special == 'shape':
        if wid not in SHAPE_KINDS:
            return None
        w.update(k='s')
    elif special == 'number':
        if wid not in NUMBERS:
            return None
        w.update(k='g', j=str(NUMBERS[wid]))
    elif special == 'days':
        if wid not in DAYS:
            return None
        w.update(k='g', j=DAYS[wid])
    elif special == 'months':
        if wid not in MONTHS:
            return None
        w.update(k='g', j=f'{MONTHS[wid]}月')
    elif special == 'dates':
        key = en.lower()
        if key not in ORD:
            return None
        w.update(k='g', j=f'{ORD[key]}日')
    else:
        ja = JA_FIX_CAT.get((ckey, en.lower())) or JA_FIX.get(en.lower(), it['ja'])
        ja = re.sub(r'[\s　]+', '', ja)
        if not ja or len(ja) > MAX_CHARS or not re.fullmatch(r'[぀-ヿ㐀-鿿ー・A-Za-z0-9]+', ja):
            return None
        w.update(k='g', j=ja)
    return w


# ---------------------------------------------------------------- speech lexicon check (optional)
def vosk_unknown(candidates, model_path):
    """Return the subset of single tokens the Vosk model does not know."""
    from vosk import Model, KaldiRecognizer, SetLogLevel
    SetLogLevel(0)
    model = Model(model_path)
    unknown = set()
    toks = sorted(candidates)
    for n in range(0, len(toks), 1500):
        chunk = toks[n:n + 1500]
        tmp = tempfile.TemporaryFile(mode='w+b')
        saved = os.dup(2)
        os.dup2(tmp.fileno(), 2)
        try:
            KaldiRecognizer(model, 16000, json.dumps(chunk + ['[unk]']))
        finally:
            os.dup2(saved, 2); os.close(saved)
        tmp.seek(0)
        for line in tmp.read().decode('utf-8', 'ignore').splitlines():
            m = re.search(r"missing in vocabulary: '(.*)'", line)
            if m:
                unknown.add(m.group(1))
    return unknown


# ---------------------------------------------------------------- sound-alike words
LEARNER_PAIRS = {frozenset(p): c for p, c in [
    (('L', 'R'), 0.4), (('B', 'V'), 0.4), (('S', 'TH'), 0.4), (('Z', 'DH'), 0.4), (('S', 'SH'), 0.45),
    (('F', 'HH'), 0.45), (('CH', 'SH'), 0.45), (('T', 'TH'), 0.5), (('D', 'DH'), 0.5), (('JH', 'Z'), 0.5),
    (('IH', 'IY'), 0.45), (('UH', 'UW'), 0.45), (('AE', 'AH'), 0.5), (('EH', 'AE'), 0.5), (('AO', 'AA'), 0.45),
    (('AH', 'AA'), 0.5), (('ER', 'AA'), 0.6), (('OW', 'AO'), 0.5), (('N', 'NG'), 0.5), (('W', 'UW'), 0.6),
]}
VOWELS = {'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'}


def sub_cost(a, b):
    if a == b:
        return 0.0
    return LEARNER_PAIRS.get(frozenset((a, b)), 1.0)


def phone_dist(a, b, cap=1.01):
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return 9.0
    prev = [j * 1.0 for j in range(lb + 1)]
    for i in range(1, la + 1):
        cur = [float(i)] + [0.0] * lb
        best = cur[0]
        for j in range(1, lb + 1):
            c = min(prev[j] + 1.0, cur[j - 1] + 1.0, prev[j - 1] + sub_cost(a[i - 1], b[j - 1]))
            cur[j] = c
            if c < best:
                best = c
        if best > cap:
            return 9.0
        prev = cur
    return prev[lb]


BLOCK = set('''whore shit fuck fucking bitch bitches ass asses damn hell sex sexy porn rape raped kill killed killer
dick cock pussy slut nazi nigger fag gay hitler jesus christ god gods devil satan suicide drug drugs weed cocaine
gun guns bomb bombs terror terrorist die died dies dead death dying murder crap piss pee poop butt boob boobs nude naked
sin sins stripper strip lust kiss kissed'''.split())
NAMES = set('''john david michael james mary bob tom jack mark paul peter george henry jim joe tim ben dan sam max kim lee
wright rite lite fore beth juan jose carlos maria anna lou lucy mandy sri wan kat tu tue sie si sci bleu wight whyte hyundai dundee devon evan'''.split())


def compute_alikes(targets, known_ok, vocab_tokens=()):
    import cmudict
    from wordfreq import zipf_frequency, top_n_list
    common = set(top_n_list('en', 9000)) | set(vocab_tokens)
    cmu = cmudict.dict()
    strip = lambda p: [re.sub(r'\d', '', x) for x in p]
    prons = {w: [strip(p) for p in v] for w, v in cmu.items()}
    zip_ = {}
    pool = []
    for w in prons:
        if not (w.isalpha() and len(w) >= 2 and known_ok(w)):
            continue
        z = zipf_frequency(w, 'en')
        if z >= 3.5 and w not in BLOCK and w not in NAMES:
            zip_[w] = z; pool.append(w)
    by_len = collections.defaultdict(list)
    homo = collections.defaultdict(set)
    for w in pool:
        for p in prons[w]:
            by_len[len(p)].append((w, tuple(p)))
            homo[tuple(p)].add(w)
    result = {}
    for t in targets:
        if t not in prons:
            continue
        mine = [tuple(p) for p in prons[t]]
        homophones, cands = set(), {}
        for p in mine:
            for ln in (len(p) - 1, len(p), len(p) + 1):
                for w, q in by_len.get(ln, []):
                    if w == t:
                        continue
                    d = phone_dist(p, q)
                    if d > 1.0:
                        continue
                    if d == 0.0:
                        homophones.add(w); continue
                    if len(w) < 3 or w not in common:
                        continue
                    if w.startswith(t) or t.startswith(w):        # cat / cats, rice / price are not mix-ups to punish
                        continue
                    if d < cands.get(w, 9):
                        cands[w] = d
        for h in list(homophones):
            cands.pop(h, None)
        ranked = sorted(cands.items(), key=lambda kv: (kv[1] > 0.5, -zip_[kv[0]]))
        careful = [w for w, d in ranked if d <= 0.5][:4]
        expert = [w for w, d in ranked if w not in careful][:6]
        result[t] = {'d': careful, 'x': expert, 'a': sorted(homophones, key=lambda w: -zipf_frequency(w, 'en'))[:4]}
    return result


# ---------------------------------------------------------------- glyph outlines
def extract_glyphs(chars, font_path, existing):
    from fontTools.ttLib import TTCollection
    from fontTools.pens.recordingPen import DecomposingRecordingPen
    ttc = TTCollection(font_path)
    font = next(f for f in ttc.fonts if 'JP' in f['name'].getDebugName(1))
    cmap, gs, upm = font.getBestCmap(), font.getGlyphSet(), font['head'].unitsPerEm
    names = {'moveTo': 'M', 'lineTo': 'L', 'curveTo': 'C', 'closePath': 'Z'}
    out, missing = {}, []
    for ch in sorted(chars):
        if ch in existing:
            continue
        if ord(ch) not in cmap:
            missing.append(ch); continue
        pen = DecomposingRecordingPen(gs)
        gs[cmap[ord(ch)]].draw(pen)
        cmds = [[names[op], [[round(x / upm, 3), round(y / upm, 3)] for x, y in args]] for op, args in pen.value if op in names]
        out[ch] = {'adv': round(gs[cmap[ord(ch)]].width / upm, 3), 'cmds': cmds}
    return out, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model')
    ap.add_argument('--font', default='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc')
    args = ap.parse_args()

    groups, everything = load_groups()
    books, words, packs, conflicts = build_categories(groups, everything)
    print('words', len(words), 'packs', len(packs))

    # which English tokens does the speech model know?
    lex_path = os.path.join(ROOT, 'scripts/lexicon.json')
    lex = json.load(open(lex_path)) if os.path.exists(lex_path) else {'unknown': [], 'known': []}
    toks = {t for w in words.values() for t in w['i'].split()}
    if args.model:
        unk = vosk_unknown(toks, args.model)
        lex['unknown'] = sorted(set(lex['unknown']) | unk)
    unknown = set(lex['unknown'])
    dropped = [k for k, w in words.items() if any(t in unknown for t in w['i'].split())]
    print('dropped (speech model does not know them):', sorted({words[k]['i'] for k in dropped}))
    for k in dropped:
        del words[k]
    packs = {p: [i for i in ids if i in words] for p, ids in packs.items()}
    packs = {p: ids for p, ids in packs.items() if len(ids) >= 3}
    for b in books:
        b['cats'] = [c for c in b['cats'] if f"{b['id']}/{c}" in packs]

    # sound-alikes for single English words
    singles = sorted({w['i'] for w in words.values() if ' ' not in w['i']})
    pool_ok = (lambda w: w not in unknown)
    alikes = compute_alikes(singles, pool_ok, {t for w in words.values() for t in w['i'].split()})
    if args.model:   # also drop alike words the model does not know
        cand = {x for v in alikes.values() for key in ('d', 'x', 'a') for x in v[key]}
        unk2 = vosk_unknown(cand, args.model)
        lex['unknown'] = sorted(set(lex['unknown']) | unk2)
        for v in alikes.values():
            for key in ('d', 'x', 'a'):
                v[key] = [x for x in v[key] if x not in unk2]
    json.dump(lex, open(lex_path, 'w'), indent=1)
    for w in words.values():
        v = alikes.get(w['i'])
        if v:
            w.update({k: v[k] for k in ('d', 'x', 'a') if v[k]})

    # glyphs
    core = json.load(open(os.path.join(ROOT, 'src/data/glyphs.json')))
    chars = {ch for w in words.values() if w['k'] == 'g' for ch in w['j']}
    gl, missing = extract_glyphs(chars, args.font, core)
    if missing:
        print('NO GLYPH for', missing, '-> dropping those words')
        for k in [k for k, w in words.items() if w['k'] == 'g' and any(c in missing for c in w['j'])]:
            del words[k]
        packs = {p: [i for i in ids if i in words] for p, ids in packs.items()}
    json.dump(gl, open(os.path.join(ROOT, 'src/data/glyphs-ja.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

    cats = {k: {'title': v[0], 'ja': v[1], 'icon': v[2], 'img': [v[3][0], v[0]]} for k, v in CATS.items()}
    used = {c for b in books for c in b['cats']}
    data = {'books': books, 'cats': {k: v for k, v in cats.items() if k in used}, 'packs': packs, 'words': words}
    json.dump(data, open(os.path.join(ROOT, 'src/data/packs.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('packs.json', os.path.getsize(os.path.join(ROOT, 'src/data/packs.json')) // 1024, 'KB;',
          'glyphs-ja.json', os.path.getsize(os.path.join(ROOT, 'src/data/glyphs-ja.json')) // 1024, 'KB;', len(gl), 'new characters')
    for b in books:
        print(b['id'], len(b['cats']), 'categories,', len({i for c in b['cats'] for i in packs[f"{b['id']}/{c}"]}), 'words')


if __name__ == '__main__':
    main()
