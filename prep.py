"""Download one patch of League game data and write data.js for the page.

Usage: python3 prep.py [patch]
"""
import re

# English stat name in item descriptions -> (flat key, percent key). None = ignore.
STAT_NAMES = {
    "Health": ("hp", "hp"),
    "Mana": ("mp", "mp"),
    "Attack Damage": ("ad", "ad"),
    "Ability Power": ("ap", "ap"),
    "Armor": ("armor", "armor"),
    "Magic Resist": ("mr", "mr"),
    "Attack Speed": ("as", "as"),
    "Ability Haste": ("ah", "ah"),
    "Move Speed": ("ms", "msPct"),
    "Critical Strike Chance": ("crit", "crit"),
    "Critical Strike Damage": ("critDmg", "critDmg"),
    "Life Steal": ("lifesteal", "lifesteal"),
    "Omnivamp": ("omnivamp", "omnivamp"),
    "Lethality": ("lethality", "lethality"),
    "Armor Penetration": ("armorPenPct", "armorPenPct"),
    "Magic Penetration": ("magicPen", "magicPenPct"),
    "Heal and Shield Power": ("hsp", "hsp"),
    "Tenacity": ("tenacity", "tenacity"),
    "Base Health Regen": ("hpRegenPct", "hpRegenPct"),
    "Base Mana Regen": ("mpRegenPct", "mpRegenPct"),
    "Adaptive Force": ("adaptive", "adaptive"),
    "Gold Per 10 Seconds": None,
}

TAG = re.compile(r"<[^>]+>")
STAT_LINE = re.compile(r"<attention>([\d.]+)(%?)</attention>\s*(.+)", re.S)


def _num(text):
    value = float(text)
    return int(value) if value.is_integer() else value


def parse_item_stats(desc):
    """Stats from the <stats> block of an English item description, plus unknown stat names."""
    block = re.search(r"<stats>(.*?)</stats>", desc, re.S)
    stats, unknown = {}, []
    if not block:
        return stats, unknown
    for line in re.split(r"<br\s*/?>", block.group(1)):
        m = STAT_LINE.search(line)
        if not m:
            continue
        name = TAG.sub("", m.group(3)).strip()
        if name not in STAT_NAMES:
            unknown.append(name)
            continue
        keys = STAT_NAMES[name]
        if keys is None:
            continue
        key = keys[1] if m.group(2) else keys[0]
        stats[key] = stats.get(key, 0) + _num(m.group(1))
    return stats, unknown
