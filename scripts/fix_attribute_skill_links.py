"""
Repair item_stats rows where an attribute was mistaken for a same-named paladin aura
(力量 = Might, 活力 = Vigor), which put "+20 力量" / "+15 精力" under 個人技能等級 with a
skill_id, and made stats_v2 show "活力" for energy. Real skill rows (d2data property
'skill') are left alone. Safe to re-run.

Usage: python3 scripts/fix_attribute_skill_links.py [--dry-run]
"""
import json
import sqlite3
import sys

DB_PATH = 'd2r.sqlite'
D2DATA = 'data/d2data/'
# aura name_en -> (attribute stat_def label_zh, game property code)
COLLISIONS = {'Might': ('力量', 'str'), 'Vigor': ('精力', 'enr')}


def fmt(v):
    return str(int(v)) if v == int(v) else str(v)


def main():
    dry = '--dry-run' in sys.argv
    eng = json.load(open(D2DATA + 'localestrings-eng.json'))
    uniques = {eng.get(x['index'], x['index']).lower(): x
               for x in json.load(open(D2DATA + 'uniqueitems.json')).values() if x.get('index')}

    db = sqlite3.connect(DB_PATH)
    defs = {label: i for i, label in db.execute(
        "SELECT id, label_zh FROM stat_defs WHERE value_type = 'flat' AND label_zh IN (?, ?)",
        [v[0] for v in COLLISIONS.values()])}
    rows = db.execute(
        "SELECT s.id, i.id, i.name_en, k.name_en, k.name_zh, s.value_min, s.value_max"
        " FROM item_stats s JOIN items i ON i.id = s.itemId JOIN skills k ON k.id = s.skill_id"
        " JOIN stat_defs d ON d.id = s.statDefId"
        " WHERE d.label_zh = '個人技能等級' AND k.name_en IN (%s)" % ','.join('?' * len(COLLISIONS)),
        list(COLLISIONS)).fetchall()

    fixes, v2_updates, problems = [], {}, []
    for stat_id, item_id, item, aura, aura_zh, lo, hi in rows:
        label, code = COLLISIONS[aura]
        x = uniques.get((item or '').lower())
        codes = {x[f'prop{i}'] for i in range(1, 13)
                 if x and x.get(f'prop{i}') and {x.get(f'min{i}'), x.get(f'max{i}')} == {lo, hi}}
        if 'skill' in codes and code not in codes:
            continue  # a genuine "+N to <aura>" skill bonus
        if code not in codes:
            problems.append(f'{item}: d2data has no {code} {fmt(lo)} (codes {sorted(codes)}); fixed per original text')
        fixes.append((defs[label], stat_id))

        if aura_zh == label:
            continue  # stats_v2 already reads right (力量 renders as 力量)
        # stats_v2 rendered the aura name; point the matching line back at the attribute
        value = fmt(lo) if lo == hi else f'{fmt(lo)}-{fmt(hi)}'
        v2 = v2_updates.get(item_id) or json.loads(
            db.execute('SELECT stats_v2 FROM items WHERE id = ?', (item_id,)).fetchone()[0] or '[]')
        hits = [s for s in v2 if s.get('label') == f'+{value} {aura_zh}']
        if len(hits) == 1:
            hits[0]['label'] = f'+{value} {label}'
            v2_updates[item_id] = v2
        elif not any(s.get('label') == f'+{value} {label}' for s in v2):
            problems.append(f'{item}: stats_v2 line "+{value} {aura_zh}" found {len(hits)} times, left as is')

    print(f'{len(fixes)} item_stats rows to fix, {len(v2_updates)} items get stats_v2 corrected')
    for p in problems:
        print('  !', p)
    if dry:
        return
    with db:
        db.executemany('UPDATE item_stats SET statDefId = ?, skill_id = NULL WHERE id = ?', fixes)
        db.executemany('UPDATE items SET stats_v2 = ? WHERE id = ?',
                       [(json.dumps(v2, ensure_ascii=False, separators=(',', ':')), i) for i, v2 in v2_updates.items()])


if __name__ == '__main__':
    main()
