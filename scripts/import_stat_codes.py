"""
Fill stat_defs.code with the canonical game property code (see d2props.py), learned by
pairing our unique/runeword stats with d2data uniqueitems/runes on equal min/max values.
affixes.mods[].stat uses the same canonical code, so the two can be joined.

Usage: python3 scripts/import_stat_codes.py [--dry-run]
"""
import collections
import json
import sqlite3
import sys

from d2props import canonical_codes

DB_PATH = 'd2r.sqlite'
D2DATA = 'data/d2data/'
MIN_VOTES = 2     # need at least this many agreeing pairings
MIN_SHARE = 0.6   # and the top code must win this share of a stat_def's votes


def d2_props(x, code, lo, hi, n):
    return [(x[f'{code}{i}'], x.get(f'{lo}{i}'), x.get(f'{hi}{i}')) for i in range(1, n + 1) if x.get(f'{code}{i}')]


def main():
    dry = '--dry-run' in sys.argv
    eng = json.load(open(D2DATA + 'localestrings-eng.json'))
    canon = canonical_codes()

    source = {}
    for x in json.load(open(D2DATA + 'uniqueitems.json')).values():
        if x.get('index'):
            source[('item', eng.get(x['index'], x['index']))] = d2_props(x, 'prop', 'min', 'max', 12)
    for x in json.load(open(D2DATA + 'runes.json')).values():
        if x.get('*Rune Name'):
            source[('runeword', x['*Rune Name'])] = d2_props(x, 'T1Code', 'T1Min', 'T1Max', 7)

    db = sqlite3.connect(DB_PATH)
    ours = collections.defaultdict(list)
    for kind, sql in (
        ('item', 'SELECT i.name_en, s.statDefId, s.value_min, s.value_max FROM item_stats s'
                 ' JOIN items i ON i.id = s.itemId'),
        ('runeword', 'SELECT r.name_en, s.statDefId, s.value_min, s.value_max FROM runeword_stats s'
                     ' JOIN runewords r ON r.id = s.runewordId'),
    ):
        for name, stat_def, lo, hi in db.execute(sql):
            ours[(kind, name)].append((stat_def, lo, hi))

    votes = collections.defaultdict(collections.Counter)
    for key, stats in ours.items():
        props = source.get(key)
        if not props:
            continue
        for stat_def, lo, hi in stats:
            if lo is None or stat_def is None:
                continue
            # a pairing only counts when exactly one game property has these values
            codes = {canon.get(c, c) for c, a, b in props if a is not None and {a, b} == {lo, hi}}
            if len(codes) == 1:
                votes[stat_def][codes.pop()] += 1

    labels = {i: (label, vtype) for i, label, vtype in db.execute('SELECT id, label_zh, value_type FROM stat_defs')}
    assigned, rejected, contested = {}, [], []
    for stat_def, c in votes.items():
        if labels[stat_def][1] == 'base_info':
            continue
        code, n = c.most_common(1)[0]
        if n >= MIN_VOTES and n / sum(c.values()) >= MIN_SHARE:
            assigned[stat_def] = code
        else:
            rejected.append((labels[stat_def], dict(c)))
            if n / sum(c.values()) < MIN_SHARE:
                contested.append(stat_def)

    print(f'{len(assigned)} stat_defs get a code; {len(rejected)} rejected as ambiguous/too few votes')
    if dry:
        for stat_def, code in sorted(assigned.items(), key=lambda kv: kv[1]):
            print('  ', code, labels[stat_def])
        for r in rejected:
            print('  rejected', r)
        return

    if 'code' not in {c[1] for c in db.execute('PRAGMA table_info(stat_defs)')}:
        db.execute('ALTER TABLE stat_defs ADD COLUMN code varchar')
    with db:
        # clear only codes the votes contradict; too-few-but-agreeing votes keep codes set elsewhere
        # (import_patch_item_stats.py)
        db.executemany('UPDATE stat_defs SET code = NULL WHERE id = ?', [(i,) for i in contested])
        db.executemany('UPDATE stat_defs SET code = ? WHERE id = ?', [(c, i) for i, c in assigned.items()])


if __name__ == '__main__':
    main()
