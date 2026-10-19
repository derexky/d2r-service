"""
Generate d2r-fe/public/data/ocr-terms.json: the Chinese words that appear on item tooltips
(stat wording, skill names, base types), used by the trade page to snap OCR misreads to real terms.
Only our DB wording is used: it follows D2R, while d2data's localestrings-chi.json carries the
older D2 translation (超大型護身符 for 特大咒符, 和/與 variants) that would pull correct reads
to the wrong word. base_info labels are left out: they hold stale spellings such as 須要等級.
Lines are split into CJK runs since numbers break them apart on screen too.

Usage: python3 scripts/gen_ocr_terms.py
"""
import json
import re
import sqlite3

DB_PATH = 'd2r.sqlite'
OUT = '../d2r-fe/public/data/ocr-terms.json'
CJK_RUN = re.compile(r'[一-鿿]{2,}')


def main():
    db = sqlite3.connect(DB_PATH)
    texts = [r[0] for r in db.execute("SELECT label_zh FROM stat_defs WHERE value_type != 'base_info'")]
    texts += [r[0] for r in db.execute('SELECT name_zh FROM skills')]
    texts += [r[0] for r in db.execute('SELECT name_zh FROM base_items')]
    texts += [r[0] for r in db.execute('SELECT DISTINCT base_type_zh FROM items')]
    for (stats,) in db.execute('SELECT stats FROM affixes WHERE stats IS NOT NULL'):
        texts += json.loads(stats)

    terms = sorted({run for t in texts if t for run in CJK_RUN.findall(t)})
    with open(OUT, 'w') as f:
        json.dump(terms, f, ensure_ascii=False)
    print(f'{len(terms)} terms -> {OUT}')


if __name__ == '__main__':
    main()
