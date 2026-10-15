"""
Replace the `affixes` table with data/affixes/{magic,rare}.merged.json
(built by scripts/join_affix_values.py), one row per d2data magicprefix/magicsuffix row.
mods[].stat is the canonical property key shared with stat_defs.code (see d2props.py).

Usage: python3 scripts/import_affixes.py
"""
import json
import sqlite3

from d2props import canonical_codes

DB_PATH = 'd2r.sqlite'
DIR = 'data/affixes/'
D2DATA = 'data/d2data/'
NEW_COLUMNS = {'item_types': 'text', 'class_specific': 'varchar', 'stats': 'text'}


def main():
    canon = canonical_codes()
    src_rows = {}
    for side, file in (('prefix', 'magicprefix.json'), ('suffix', 'magicsuffix.json')):
        for key, x in json.load(open(D2DATA + file)).items():
            src_rows[f'{side}-{key}'] = x

    affixes, conflicts = {}, []
    for kind in ('magic', 'rare'):
        for page in json.load(open(f'{DIR}{kind}.merged.json')):
            for side in ('prefixes', 'suffixes'):
                for group in page[side]:
                    for r in group:
                        a = affixes.setdefault(r['src'], {
                            'kind': '前綴' if side == 'prefixes' else '後綴',
                            'name_zh': r['name'], 'name_en': r['ename'], 'level': r['alvl'],
                            'mods': r['mods'], 'stats': r['stats'], 'types': [], 'rare': False,
                        })
                        if (a['name_zh'], a['stats']) != (r['name'], r['stats']):
                            conflicts.append((r['src'], page['gid'], a['name_zh'], a['stats'], r['name'], r['stats']))
                        if page['gid'] not in a['types']:
                            a['types'].append(page['gid'])
                        a['rare'] |= kind == 'rare'

    db = sqlite3.connect(DB_PATH)
    cols = {c[1] for c in db.execute('PRAGMA table_info(affixes)')}
    with db:
        for col, typ in NEW_COLUMNS.items():
            if col not in cols:
                db.execute(f'ALTER TABLE affixes ADD COLUMN {col} {typ}')
        db.execute('DELETE FROM affixes')
        for src, a in affixes.items():
            mods = [{**m, 'stat': canon.get(m['code'], m['code'])} for m in a['mods']]
            x = src_rows[src]
            # game data has 'staff' typos for 'staf'
            itypes = ['staf' if t == 'staff' else t for t in (x.get(f'itype{i}') for i in range(1, 8)) if t]
            etypes = [t for t in (x.get(f'etype{i}') for i in range(1, 6)) if t]
            db.execute(
                'INSERT INTO affixes (id, kind, name_zh, name_en, level, required_level, affix_group, rare,'
                ' types, excluded_types, mods, item_types, class_specific, stats)'
                ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (src, a['kind'], a['name_zh'], a['name_en'], a['level'], x.get('levelreq'), x.get('group'),
                 a['rare'], json.dumps(a['types']), json.dumps(etypes, ensure_ascii=False),
                 json.dumps(mods), json.dumps(itypes), x.get('classspecific'),
                 json.dumps(a['stats'], ensure_ascii=False)),
            )
    print(len(affixes), 'affixes imported;', len(conflicts), 'name/text conflicts across pages')
    for c in conflicts[:10]:
        print('  ', c)


if __name__ == '__main__':
    main()
