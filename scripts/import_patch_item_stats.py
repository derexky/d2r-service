"""
Create item_stats for items that only carry `stats` text (added from d2r-patch-items.json).
Their wording differs from the HTML import ("增強傷害 133–166%"), so instead of parsing
labels, values come from d2data uniqueitems and stat_defs are found by canonical code
(stat_defs.code); each property is placed on the stats line whose numbers it matches.
Base lines (等級需求, 需求力量, ...) are parsed from the text. Safe to re-run: only items
without any item_stats are touched.

Usage: python3 scripts/import_patch_item_stats.py [--dry-run]
"""
import collections
import json
import re
import sqlite3
import sys

from d2props import canonical_codes

DB_PATH = 'd2r.sqlite'
D2DATA = 'data/d2data/'
# proc properties -> (item_stats.proc_trigger, canonical stat_def label)
PROCS = {
    'hit-skill': ('on_striking', '打擊時機率發動技能'),
    'att-skill': ('on_striking', '打擊時機率發動技能'),
    'gethit-skill': ('on_being_hit', '受攻擊時機率發動技能'),
    'kill-skill': ('on_kill', '擊殺時機率發動技能'),
    'death-skill': ('on_death', '死亡時機率發動技能'),
    'levelup-skill': ('on_level_up', '升級時機率發動技能'),
}
SINGLE_SKILL = '個人技能等級'  # canonical stat_def for "+N to <skill>", skill in skill_id
NUM = re.compile(r'-?\d+(?:\.\d+)?')


def nums(text):
    return [float(n) for n in NUM.findall(text)]


def main():
    dry = '--dry-run' in sys.argv
    canon = canonical_codes()
    eng = json.load(open(D2DATA + 'localestrings-eng.json'))
    skill_name = {str(v.get('*Id', k)): v.get('skill') for k, v in json.load(open(D2DATA + 'skills.json')).items()}
    uniques = collections.defaultdict(list)
    for x in json.load(open(D2DATA + 'uniqueitems.json')).values():
        if x.get('index'):
            uniques[eng.get(x['index'], x['index']).lower()].append(
                [(x[f'prop{i}'], x.get(f'par{i}'), x.get(f'min{i}'), x.get(f'max{i}'))
                 for i in range(1, 13) if x.get(f'prop{i}')])

    db = sqlite3.connect(DB_PATH)
    skills = {n.lower(): i for i, n in db.execute('SELECT id, name_en FROM skills')}
    # per code, the stat_def most used by existing item/runeword stats
    by_code = {}
    for code, def_id, _ in db.execute(
            'SELECT d.code, d.id, (SELECT count(*) FROM item_stats WHERE statDefId = d.id)'
            ' + (SELECT count(*) FROM runeword_stats WHERE statDefId = d.id) n'
            ' FROM stat_defs d WHERE d.code IS NOT NULL ORDER BY n'):
        by_code[code] = def_id
    defs = {(label, vtype): i for i, label, vtype in db.execute('SELECT id, label_zh, value_type FROM stat_defs')}

    created = []

    def stat_def(label, vtype, code=None):
        key = (label, vtype)
        if key in defs and code and not dry:
            db.execute('UPDATE stat_defs SET code = ? WHERE id = ? AND code IS NULL', (code, defs[key]))
        if key not in defs:
            created.append((label, vtype, code))
            defs[key] = None if dry else db.execute(
                'INSERT INTO stat_defs (label_zh, value_type, code) VALUES (?, ?, ?)', (label, vtype, code)).lastrowid
        return defs[key]

    items = db.execute('SELECT id, name_en, stats FROM items i'
                       ' WHERE NOT EXISTS (SELECT 1 FROM item_stats s WHERE s.itemId = i.id)').fetchall()
    rows, problems = [], []
    for item_id, name, stats in items:
        lines = json.loads(stats or '[]')
        key = re.sub(r'^Renewed ', 'Crafted ', name).lower()  # d2data names the upgraded sunder charms "Crafted"
        line_nums = [set(abs(n) for n in nums(l['label'])) for l in lines]
        # several d2data rows share a name (Rainbow Facet): take the one whose numbers best fit the text
        props = max(uniques.get(key, []), default=[], key=lambda ps: sum(
            any({abs(v) for v in (lo, hi) if v is not None} <= ns for ns in line_nums) for _, _, lo, hi in ps))
        # "-AffixN" entries are the pool behind "以下隨機出現一項附加屬性", not stats of their own
        props = [p for p in props if not re.search(r'-Affix\d', p[0])]
        if not props:
            problems.append(f'{name}: not in d2data')

        # place each property on the first free line containing its numbers, the rest in order
        free = [i for i, l in enumerate(lines) if not (l['color'] == '#FFFFFF' and nums(l['label']))]
        placed = {}
        for p in props:
            want = {abs(v) for v in p[2:] if v is not None}
            hit = next((i for i in free if want and want <= line_nums[i]), None)
            if hit is not None:
                placed[hit] = p
                free.remove(hit)
        for p in [p for p in props if p not in placed.values()]:
            if free:
                placed[free.pop(0)] = p
            else:
                problems.append(f'{name}: no line left for {p}')

        for i, line in enumerate(lines):
            text, color = line['label'], line['color']
            row = {'sort_order': i, 'itemId': item_id, 'color': color, 'value_min': None, 'value_max': None,
                   'skill_id': None, 'proc_trigger': None, 'proc_chance': None, 'proc_level_min': None,
                   'proc_level_max': None}
            p = placed.get(i)
            if p is None:  # base info (white "label: n") or a plain text line
                label = re.sub(r'[:：]?\s*[-\d.]+.*$', '', text).strip() or text
                n = nums(text)
                vtype = 'base_info' if color == '#FFFFFF' else 'boolean'
                row.update(statDefId=stat_def(label, vtype), value_min=n[0] if n else None,
                           value_max=n[-1] if n else None)
            else:
                code, par, lo, hi = p
                c = code.lower()
                skill = skill_name.get(str(par), par)
                if c in PROCS:
                    trigger, label = PROCS[c]
                    row.update(statDefId=stat_def(label, 'boolean'), proc_trigger=trigger, proc_chance=lo,
                               proc_level_min=hi, proc_level_max=hi, skill_id=skills.get(str(skill).lower()))
                elif c == 'skill':
                    row.update(statDefId=stat_def(SINGLE_SKILL, 'flat'), value_min=lo, value_max=hi,
                               skill_id=skills.get(str(skill).lower()))
                else:
                    stat = canon.get(c, c)
                    n = nums(re.sub(r'[（(][^）)]*[）)]', '', text))  # "毒素傷害 95（1 秒）": skip the duration
                    # display values: d2data's when the text shows them, else the text's (frames, /256 units)
                    lo, hi = (lo, hi) if {abs(lo), abs(hi)} <= line_nums[i] else (n[0] if n else None, n[-1] if n else None)
                    def_id = by_code.get(stat) or stat_def(
                        re.sub(r'[\s+\-\d.%–]+', ' ', re.sub(r'[（(][^）)]*[）)]', '', text)).strip(),
                        'percentage' if '%' in text else 'flat', stat)
                    row.update(statDefId=def_id, value_min=lo, value_max=hi)
                if (c in PROCS or c == 'skill') and row['skill_id'] is None:
                    problems.append(f'{name}: skill {skill!r} not in skills table')
            row['is_variable'] = int(row['value_min'] != row['value_max'] and placed.get(i) is not None)
            rows.append(row)

    print(f'{len(items)} items, {len(rows)} item_stats rows, {len(created)} new stat_defs')
    for c in created:
        print('  new stat_def', c)
    for p in problems:
        print('  !', p)
    if not rows:
        return
    if dry:
        for r in rows:
            print('   ', r['itemId'], r['sort_order'], r['statDefId'], r['value_min'], r['value_max'],
                  r['proc_trigger'] or '', r['skill_id'] or '')
        return
    with db:
        cols = list(rows[0])
        db.executemany(f'INSERT INTO item_stats ({", ".join(cols)}) VALUES ({", ".join("?" * len(cols))})',
                       [tuple(r[c] for c in cols) for r in rows])
        # the patch text is already display-ready
        db.execute('UPDATE items SET stats_v2 = stats WHERE id IN (%s)' % ','.join(str(i) for i, _, _ in items))


if __name__ == '__main__':
    main()
