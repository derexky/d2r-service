"""
d2r.world hides numbers as Private Use Area chars (U+F100…) rendered by an
obfuscated font where each glyph draws a whole number out of digit outlines.
This decodes the font into data/affixes/font-map.json: {"\\uf106": "5", ...}.

Usage: pip install fonttools
       curl -sO https://d2r.world/font/RobotoCD771579d53e26ece5454b585a7dfc1d.ttf
       python3 scripts/decode_d2rworld_font.py RobotoCD....ttf
Re-run when the site's font URL changes; if it raises KeyError, the digit
outlines changed and DIGITS needs relabelling.
"""
import collections
import hashlib
import json
import sys

from fontTools.ttLib import TTFont

ADVANCE = 1011  # each digit occupies one advance width inside a glyph
# md5 of a single digit's normalised contours -> digit (labelled by eye from rendered outlines)
DIGITS = {
    '5ab76d519c7c': '0', '3e03e12d6e28': '1', 'a81fe545274f': '2', 'cfbec5a2e584': '3',
    '88774e28f9f5': '4', 'c3baf0e6993a': '5', 'e167ab545cb3': '6', 'b07bdbab5ee0': '7',
    '6f583e1be683': '8', '38406ff8125a': '9',
}


def glyph_number(glyf, name):
    g = glyf[name]
    coords, ends = g.getCoordinates(glyf)[0], g.endPtsOfContours
    by_slot, start = collections.defaultdict(list), 0
    for end in ends:
        pts = list(coords[start:end + 1])
        start = end + 1
        slot = min(x for x, _ in pts) // ADVANCE
        by_slot[slot].append(tuple((x - slot * ADVANCE, y) for x, y in pts))
    return ''.join(DIGITS[hashlib.md5(repr(sorted(by_slot[s])).encode()).hexdigest()[:12]] for s in sorted(by_slot))


def main():
    font = TTFont(sys.argv[1])
    glyf = font['glyf']
    mapping = {chr(cp): glyph_number(glyf, name) for cp, name in sorted(font.getBestCmap().items()) if cp >= 0xF100}
    json.dump(mapping, open('data/affixes/font-map.json', 'w'), ensure_ascii=False, indent=0)
    print(len(mapping), 'glyphs')


if __name__ == '__main__':
    main()
