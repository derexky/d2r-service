"""
Fill runewords.item_types with the itemtypes.txt codes a runeword can be made in
(runes.txt itype1-6, e.g. ["swor"] for Spirit's weapon version), matched by name_en
against d2data runes. A base takes the runeword when its own item_types share a code.
Also fixes slot when every code points to one other slot: the guide's 1.11 page lists
body armor runewords (Bone, Myth, ...) that parseRunewords files under helm.

Usage: python3 scripts/import_runeword_item_types.py
"""
import json
import re
import sqlite3

DB_PATH = 'd2r.sqlite'
D2DATA = 'data/d2data/'

# itemtypes.txt ancestor code → runewords.slot
SLOTS = {'weap': 'weapon', 'tors': 'armor', 'shld': 'shield', 'helm': 'helm'}

# names that differ between the guide and runes.txt
ALIASES = {'hysteria': 'hustle'}


def key(name):
    # "Call         \n To Arms" / "Hustle (armor)" / "Ancients' Pledge" → "calltoarms" / "hustle" / "ancientspledge"
    k = re.sub(r'[^a-z]', '', re.sub(r'\(.*\)', '', name or '').lower())
    return ALIASES.get(k, k)


def main():
    types = {t['Code']: t for t in json.load(open(D2DATA + 'itemtypes.json')).values() if t.get('Code')}

    def slot_of(code):
        if code in SLOTS or code not in types:
            return SLOTS.get(code)
        return next(filter(None, (slot_of(types[code].get(k)) for k in ('Equiv1', 'Equiv2'))), None)

    itypes = {}
    for x in json.load(open(D2DATA + 'runes.json')).values():
        if x.get('complete') == 1:
            # Hustle has one row per slot; slot is checked separately, so merging is safe
            codes = itypes.setdefault(key(x.get('*Rune Name')), [])
            codes += [x[f'itype{i}'] for i in range(1, 7) if x.get(f'itype{i}') and x[f'itype{i}'] not in codes]

    db = sqlite3.connect(DB_PATH)
    if 'item_types' not in {c[1] for c in db.execute('PRAGMA table_info(runewords)')}:
        db.execute('ALTER TABLE runewords ADD COLUMN item_types text')
    missing = []
    with db:
        for id_, name_en, slot in db.execute('SELECT id, name_en, slot FROM runewords').fetchall():
            codes = itypes.get(key(name_en))
            if not codes:
                missing.append(name_en)
                continue
            slots = {slot_of(c) for c in codes}
            if len(slots) == 1 and None not in slots and slot not in slots:
                slot = slots.pop()
                print('slot fixed:', ' '.join(name_en.split()), '→', slot)
            db.execute('UPDATE runewords SET item_types = ?, slot = ? WHERE id = ?', (json.dumps(codes), slot, id_))
    print('missing:', missing)


if __name__ == '__main__':
    main()
