"""Shared helper: canonical property code (properties.txt) for linking stats across tables."""
import json

# affixes split elemental damage into min/max/len properties; items use the combined one
ALIASES = {
    'fire-min': 'dmg-fire', 'fire-max': 'dmg-fire',
    'ltng-min': 'dmg-ltng', 'ltng-max': 'dmg-ltng',
    'cold-min': 'dmg-cold', 'cold-max': 'dmg-cold', 'cold-len': 'dmg-cold',
    'pois-min': 'dmg-pois', 'pois-max': 'dmg-pois', 'pois-len': 'dmg-pois',
}


def canonical_codes(path='data/d2data/properties.json'):
    """Map every property code to one key shared by all properties that write the same set of
    stats: the property code itself when it is alone, else the first stat name
    (swing1/swing2/swing3 -> item_fasterattackrate, ama/bar/... -> item_addclassskills)."""
    props = json.load(open(path))
    by_stats = {}
    for code, p in props.items():
        stats = tuple(p.get(f'stat{i}') for i in range(1, 8) if p.get(f'stat{i}'))
        by_stats.setdefault(stats or (code,), []).append(code)
    out = {}
    for stats, codes in by_stats.items():
        name = codes[0] if len(codes) == 1 else stats[0]
        for code in codes:
            out[code] = name
    assert len(set(out.values())) == len(by_stats), 'canonical names collide'
    return {**out, **{code: out[target] for code, target in ALIASES.items()}}
