"""
Link each set_members row to its base item (set_members.baseItemId) via d2data setitems, so set
items can be categorised like uniques. Rings and amulets have no base_items row; their slot is
filled instead. Chinese names come from scripts/sync-d2r-world-names.mjs, not from d2data, whose
localestrings-chi carries the older translation.

Usage: python3 scripts/import_set_item_bases.py
"""
import json
import re
import sqlite3

DB_PATH = 'd2r.sqlite'
D2DATA = 'data/d2data/'
JEWELRY_SLOT = {'rin': 'ring', 'amu': 'amulet'}


def norm(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def main():
    eng = json.load(open(D2DATA + 'localestrings-eng.json'))
    # setitems.json keys rows by string id; set_members holds the displayed English name
    sets = {norm(eng.get(r['index'], r['index'])): r for r in json.load(open(D2DATA + 'setitems.json')).values()}
    base_name = {}
    for f in ('weapons.json', 'armor.json'):
        for x in json.load(open(D2DATA + f)).values():
            if x.get('code'):
                base_name[x['code']] = eng.get(x.get('namestr'), x.get('name'))

    db = sqlite3.connect(DB_PATH)
    if 'baseItemId' not in {c[1] for c in db.execute('PRAGMA table_info(set_members)')}:
        db.execute('ALTER TABLE set_members ADD COLUMN baseItemId integer REFERENCES base_items (id)')
    # paladin shields appear twice in base_items; keep the lowest id
    base_id = {n: i for i, n in db.execute('SELECT id, name_en FROM base_items ORDER BY id DESC')}

    missing, no_base = [], []
    with db:
        for id_, en in db.execute('SELECT id, item_name_en FROM set_members').fetchall():
            r = sets.get(norm(en))
            if not r:
                missing.append(en)
                continue
            code = r['item']
            bid = base_id.get(base_name.get(code))
            if bid is None and code not in JEWELRY_SLOT:
                no_base.append((en, code))
            db.execute(
                'UPDATE set_members SET baseItemId = ?, slot = COALESCE(?, slot) WHERE id = ?',
                (bid, JEWELRY_SLOT.get(code), id_),
            )
    print('missing from setitems:', missing)
    print('no base found:', no_base)


if __name__ == '__main__':
    main()
