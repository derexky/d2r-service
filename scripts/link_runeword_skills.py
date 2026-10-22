"""
Fill runeword_stats.skill_id (and proc_* for chance-to-cast lines) from d2data runes.json, the way
item_stats carries them. Labels and stat_defs stay as they are; only the skill link is added.

Each skill property of a runeword is placed on the stat rows of the same kind (chance to cast, aura,
charges, +N to a skill) that name the skill (old or new Chinese name) or show the same chance/level.
Duplicate rows of one property (a runeword listed once per base) all get the link; a row two
properties both fit is listed and left alone. Safe to re-run: only empty skill_id is filled.

Usage: python3 scripts/link_runeword_skills.py [--dry-run]
"""
import json
import re
import sqlite3
import sys

DB_PATH = 'd2r.sqlite'
D2DATA = 'data/d2data/'
PROCS = {
    'hit-skill': 'on_striking',
    'att-skill': 'on_striking',
    'gethit-skill': 'on_being_hit',
    'kill-skill': 'on_kill',
    'death-skill': 'on_death',
    'levelup-skill': 'on_level_up',
}
# words that tell the trigger apart; on_striking is a proc line with none of them
TRIGGER_WORDS = {'on_being_hit': ('被擊中', '被攻擊', '受攻擊', '被打'), 'on_level_up': ('升級',),
                 'on_kill': ('殺',), 'on_death': ('死亡',)}
PROC_WORDS = ('施展', '發動', '產生')
# d2data spellings that differ from skills.name_en
ALIASES = {'wearbear': 'werebear', 'shapeshifting': 'lycanthropy'}
# runeword translations matching neither skills.name_zh nor name_zh_old
EXTRA_ZH = {'skeletonmastery': '支配骷髏', 'corpseexplosion': '屍體爆炸'}


def squash(s):
    return re.sub(r'\s+', '', s or '').lower()


def chance_level(label):
    chance = re.search(r'(\d+)\s*%', label)
    level = re.search(r'等級\s*(\d+)', label) or re.search(r'(\d+)\s*[級等]', label)
    return (float(chance[1]) if chance else None), (float(level[1]) if level else None)


def trigger_of(label):
    return next((t for t, ws in TRIGGER_WORDS.items() if any(w in label for w in ws)), 'on_striking')


def fits(code, row, names, lo, hi):
    """Whether a stat row can be the line of this runes.json property."""
    label, vtype = row['label'], row['vtype']
    named = any(n and n in squash(label) for n in names)
    if code in PROCS:
        if not any(w in label for w in PROC_WORDS) or trigger_of(label) != PROCS[code]:
            return False
        chance, level = chance_level(label)
        return named or (level == hi and chance in (None, lo))
    if code == 'aura':
        if vtype != 'skill_grant' and not any(w in label for w in ('靈氣', '光環')):
            return False
        return named or chance_level(label)[1] == hi
    if code == 'charged':
        if vtype != 'skill_charge' and not any(w in label for w in ('聚氣', '充能')):
            return False
        return named or {row['lo'], row['hi']} == {lo, hi}
    # skill / oskill: "+N to <skill>"
    return named and (row['lo'], row['hi']) == (lo, hi)


def main():
    dry = '--dry-run' in sys.argv
    skill_name = {str(v.get('*Id', k)): v.get('skill') for k, v in json.load(open(D2DATA + 'skills.json')).items()}
    runes = {squash(v['*Rune Name']): v for v in json.load(open(D2DATA + 'runes.json')).values() if v.get('*Rune Name')}

    db = sqlite3.connect(DB_PATH)
    skills = {squash(en): (i, {squash(zh), squash(old), EXTRA_ZH.get(squash(en), '')} - {''})
              for i, en, zh, old in db.execute('SELECT id, name_en, name_zh, name_zh_old FROM skills') if en}
    rows_of = {}
    for rid, rw, label, vtype, lo, hi, skill in db.execute(
            'SELECT s.id, r.name_en, d.label_zh, d.value_type, s.value_min, s.value_max, s.skill_id'
            ' FROM runeword_stats s JOIN runewords r ON r.id = s.runewordId JOIN stat_defs d ON d.id = s.statDefId'
            ' ORDER BY s.sort_order'):
        rows_of.setdefault(' '.join((rw or '').split()), []).append(
            {'id': rid, 'label': label or '', 'vtype': vtype, 'lo': lo, 'hi': hi, 'skill_id': skill})

    updates, problems = [], []
    for rw, rows in rows_of.items():
        data = runes.get(squash(rw))
        if not data:
            problems.append(f'{rw}: not in runes.json')
            continue
        claims = {}  # row id -> [(code, skill name, skill id, lo, hi)]
        for i in range(1, 8):
            code, par, lo, hi = (data.get(f'T1{k}{i}') for k in ('Code', 'Param', 'Min', 'Max'))
            if code not in PROCS and code not in ('aura', 'charged', 'skill', 'oskill'):
                continue
            name = skill_name.get(str(par), par)
            key = squash(str(name))
            skill_id, names = skills.get(ALIASES.get(key, key), (None, set()))
            if skill_id is None:
                problems.append(f'{rw}: {code} {name!r} not in skills table')
                continue
            hits = [r for r in rows if fits(code, r, names, lo, hi)]
            # prefer the rows naming the skill when numbers alone also matched others
            named = [r for r in hits if any(n in squash(r['label']) for n in names)]
            hits = named or hits
            if not hits:
                problems.append(f'{rw}: {code} {name} {lo}/{hi} matches no row')
            for r in hits:
                claims.setdefault(r['id'], []).append((code, name, skill_id, lo, hi))
        for r in rows:
            c = claims.get(r['id'], [])
            if len(c) > 1:
                problems.append(f'{rw}: {r["label"]!r} fits {[x[1] for x in c]}')
            elif c and r['skill_id'] is None:
                code, name, skill_id, lo, hi = c[0]
                proc = (PROCS[code], lo, hi, hi) if code in PROCS else (None, None, None, None)
                updates.append((skill_id, *proc, r['id'], f'{rw}: {r["label"]} -> {name}'))

    print(f'{len(updates)} runeword_stats rows to link')
    for p in problems:
        print('  !', p)
    if dry:
        for u in updates:
            print('   ', u[-1])
        return
    with db:
        db.executemany('UPDATE runeword_stats SET skill_id = ?, proc_trigger = ?, proc_chance = ?,'
                       ' proc_level_min = ?, proc_level_max = ? WHERE id = ?', [u[:-1] for u in updates])


if __name__ == '__main__':
    main()
