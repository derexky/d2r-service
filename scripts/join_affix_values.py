"""
Join d2r.world affix crawl (data/affixes/{magic,rare}[.en-US].json) with
blizzhackers/d2data magicprefix/magicsuffix to add numeric mod ranges.
data/d2data/ is a copy of https://github.com/blizzhackers/d2data/tree/master/json

Usage: python3 scripts/join_affix_values.py
Output: data/affixes/{magic,rare}.merged.json — each row gets `ename`, `src`
        (d2data row: 'prefix-<key>' / 'suffix-<key>') and `mods`
        [{code, param, min, max}]; `mods` is null when no d2data row matches,
        and `ambiguous` lists the candidates left after checking them against the
        numbers in the stat text (`mods` is then the newest-version one).
"""
import json
import re

D2DATA = 'data/d2data/'
DIR = 'data/affixes/'

# d2r.world gid -> itemtypes.txt code
GID_TYPE = {
    'rings': 'ring', 'amulets': 'amul', 'jewels': 'jewl', 'purehelms': 'helm', 'bar-helms': 'phlm',
    'dru-helms': 'pelt', 'circlets': 'circ', 'armors': 'tors', 'pureshields': 'shld', 'pal-shields': 'ashd',
    'nec-shields': 'head', 'war-shields': 'grim', 'belts': 'belt', 'boots': 'boot', 'gloves': 'glov',
    'swords': 'swor', 'daggers': 'knif', 'axes': 'axe', 'polearms': 'pole', 'purespears': 'spea',
    'ama-spears': 'aspe', 'clubs': 'club', 'puremaces': 'mace', 'hammers': 'hamm', 'scepters': 'scep',
    'staves': 'staf', 'orbs': 'orb', 'wands': 'wand', 'katars': 'h2h', 'purebows': 'bow', 'ama-bows': 'abow',
    'crossbows': 'xbow', 'purejavelins': 'jave', 'ama-javelins': 'ajav', 'throwing-axes': 'taxe',
    'throwing-knives': 'tkni', 'grand-charms': 'lcha', 'large-charms': 'mcha', 'small-charms': 'scha',
}


def fetch(name):
    with open(D2DATA + name) as f:
        return json.load(f)


def rows(d):
    return list(d.values()) if isinstance(d, dict) else d


def main():
    eng = fetch('localestrings-eng.json')
    types = {t['Code']: t for t in rows(fetch('itemtypes.json')) if t.get('Code')}

    def ancestors(code, seen=None):
        seen = seen if seen is not None else set()
        if code in types and code not in seen:
            seen.add(code)
            for k in ('Equiv1', 'Equiv2'):
                ancestors(types[code].get(k), seen)
        return seen

    index = {}
    for side, file in (('prefixes', 'magicprefix.json'), ('suffixes', 'magicsuffix.json')):
        idx = index[side] = {}
        # newest version first, so the first remaining candidate is the current game data
        for key, x in sorted(fetch(file).items(), key=lambda kv: -(kv[1].get('version') or 0)):
            if x.get('Name') and 'level' in x:
                x['src'] = f"{side.removesuffix('es')}-{key}"
                idx.setdefault((eng.get(x['Name'], x['Name'].removesuffix('Affix')), x['level']), []).append(x)

    def match(side, ename, alvl, gid):
        anc = ancestors(GID_TYPE[gid])
        hits = []
        for x in index[side].get((ename, alvl), []):
            # game data has 'staff' typos for 'staf'; d2r.world lists those affixes on staves
            itypes = {'staf' if t == 'staff' else t for t in (x.get(f'itype{i}') for i in range(1, 8))} - {None}
            etypes = {x.get(f'etype{i}') for i in range(1, 6)} - {None}
            if itypes & anc and not etypes & anc:
                hits.append((x['src'], [{'code': x[f'mod{i}code'], 'param': x.get(f'mod{i}param') or 0,
                              'min': x.get(f'mod{i}min'), 'max': x.get(f'mod{i}max')}
                             for i in (1, 2, 3) if x.get(f'mod{i}code')]))
        # identical mods from several rows (old versions) collapse to the first, i.e. newest, row
        uniq = {}
        for h in hits:
            uniq.setdefault(json.dumps(h[1]), h)
        return list(uniq.values())

    def pick(hits, stats):
        # keep candidates whose bounds all appear in the stat text and explain the most of its numbers
        nums = {int(n) for n in re.findall(r'\d+', ' '.join(stats))}
        bounds = [{abs(v) for m in h[1] for v in (m['min'], m['max']) if v} for h in hits]
        ok = [(len(b & nums), h) for b, h in zip(bounds, hits) if b <= nums]
        best = max((n for n, _ in ok), default=None)
        return [h for n, h in ok if n == best] or hits

    for kind in ('magic', 'rare'):
        zh = json.load(open(f'{DIR}{kind}.json'))
        en = json.load(open(f'{DIR}{kind}.en-US.json'))
        miss = amb = total = 0
        for page, epage in zip(zh, en):
            assert page['gid'] == epage['gid']
            for side in ('prefixes', 'suffixes'):
                used = set()  # one page may list two affixes sharing name+alvl (e.g. charges vs. on-hit)
                for g, eg in zip(page[side], epage[side]):
                    for r, er in zip(g, eg):
                        total += 1
                        hits = match(side, er['name'], er['alvl'], page['gid'])
                        if len(hits) > 1:
                            hits = pick(hits, r['stats'])
                            hits.sort(key=lambda h: h[0] in used)
                        r['ename'] = er['name']
                        r['src'], r['mods'] = hits[0] if hits else (None, None)
                        used.add(r['src'])
                        if len(hits) > 1:
                            r['ambiguous'] = [h[1] for h in hits]
                            amb += 1
                        miss += not hits
        json.dump(zh, open(f'{DIR}{kind}.merged.json', 'w'), ensure_ascii=False, indent=2)
        print(f'{kind}: {total} rows, {miss} unmatched, {amb} ambiguous')


if __name__ == '__main__':
    main()
