"""Extracts outlines for the kanji and digits used as wall holes.
Source font: Noto Sans CJK JP Bold (SIL Open Font License) so we can ship it.
Run:  python3 scripts/make_glyphs.py [path/to/NotoSansCJK-Bold.ttc]
Writes src/data/glyphs.json  (path commands, y-up, units of 1 = font em)."""
import json, sys
from fontTools.ttLib import TTCollection
from fontTools.pens.recordingPen import DecomposingRecordingPen

path = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
chars = "日月火水木金土0123456789"
ttc = TTCollection(path)
font = next(f for f in ttc.fonts if "JP" in f["name"].getDebugName(1))
cmap, gs, upm = font.getBestCmap(), font.getGlyphSet(), font["head"].unitsPerEm
out = {}
for ch in chars:
    pen = DecomposingRecordingPen(gs)
    gs[cmap[ord(ch)]].draw(pen)
    names = {"moveTo": "M", "lineTo": "L", "curveTo": "C", "closePath": "Z"}  # CFF/OTF outlines only
    cmds = [[names[op], [[round(x / upm, 4), round(y / upm, 4)] for x, y in args]] for op, args in pen.value]
    out[ch] = {"adv": round(gs[cmap[ord(ch)]].width / upm, 4), "cmds": cmds}
json.dump(out, open("src/data/glyphs.json", "w"), separators=(",", ":"))
print("glyphs:", len(out), "bytes:", len(json.dumps(out)))
