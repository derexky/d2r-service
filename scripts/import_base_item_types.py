"""
Fill base_items.item_types with the item's itemtypes.txt code plus all its ancestors
(e.g. ["helm", "armo", "any"]), matched by name_en against d2data weapons/armor.
Used to find which affixes (affixes.item_types / excluded_types) can roll on a base.

Usage: python3 scripts/import_base_item_types.py
"""
import json
import sqlite3

DB_PATH = 'd2r.sqlite'
D2DATA = 'data/d2data/'


def main():
    eng = json.load(open(D2DATA + 'localestrings-eng.json'))
    types = {t['Code']: t for t in json.load(open(D2DATA + 'itemtypes.json')).values() if t.get('Code')}

    def ancestors(code, out):
        if code in types and code not in out:
            out.append(code)
            for k in ('Equiv1', 'Equiv2'):
                ancestors(types[code].get(k), out)
        return out

    by_name = {}
    for f in ('weapons.json', 'armor.json'):
        for x in json.load(open(D2DATA + f)).values():
            if x.get('name') and x.get('type'):
                by_name[eng.get(x.get('namestr'), x['name'])] = x['type']

    db = sqlite3.connect(DB_PATH)
    if 'item_types' not in {c[1] for c in db.execute('PRAGMA table_info(base_items)')}:
        db.execute('ALTER TABLE base_items ADD COLUMN item_types text')
    missing = []
    with db:
        for id_, name_en in db.execute('SELECT id, name_en FROM base_items').fetchall():
            t = by_name.get(name_en)
            if not t:
                missing.append(name_en)
                continue
            db.execute('UPDATE base_items SET item_types = ? WHERE id = ?', (json.dumps(ancestors(t, [])), id_))
    print('missing:', missing)


if __name__ == '__main__':
    main()
