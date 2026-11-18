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


# Data Dragon `stats` object key -> (canonical key, multiplier). Used only to cross-check descriptions.
DD_STATS = {
    "FlatHPPoolMod": ("hp", 1), "FlatMPPoolMod": ("mp", 1), "FlatPhysicalDamageMod": ("ad", 1),
    "FlatMagicDamageMod": ("ap", 1), "FlatArmorMod": ("armor", 1), "FlatSpellBlockMod": ("mr", 1),
    "PercentAttackSpeedMod": ("as", 100), "FlatCritChanceMod": ("crit", 100),
    "PercentLifeStealMod": ("lifesteal", 100), "FlatMovementSpeedMod": ("ms", 1),
    "PercentMovementSpeedMod": ("msPct", 100),
}
POSSIBLE_PASSIVE = re.compile(r"(Increases your|equal to|based on|converts?|per \d+ bonus)", re.I)
GROUP_PREFIX = "Items/ItemGroups/"


def _keep_item(iid, item):
    # Ids of 5+ digits are other game modes' copies (Arena etc.) that Data Dragon still flags for map 11.
    return (len(iid) <= 4
            and item.get("maps", {}).get("11")
            and item.get("gold", {}).get("purchasable")
            and not item.get("requiredAlly")
            and item.get("inStore") is not False
            and not item.get("hideFromAll")
            and not {"Consumable", "Trinket"} & set(item.get("tags", [])))


def build_items(dd_en, dd_fr, items_bin):
    """Summoner's Rift items in DATA.items shape, the item-group limits they use, and report lines."""
    group_max = {k: v["mMaxGroupOwnable"] for k, v in items_bin.items()
                 if isinstance(v, dict) and v.get("__type") == "ItemGroup" and v.get("mMaxGroupOwnable") is not None}
    items, groups, report = {}, {}, []
    for iid, en in dd_en["data"].items():
        if not _keep_item(iid, en):
            continue
        fr = dd_fr["data"].get(iid, en)
        stats, unknown = parse_item_stats(en["description"])
        for name in unknown:
            report.append(f"unknown stat '{name}' in item {iid} ({en['name']})")
        for dd_key, value in en.get("stats", {}).items():
            key, mult = DD_STATS.get(dd_key, (None, 1))
            if key and abs(stats.get(key, 0) - value * mult) > 1e-6:
                report.append(f"stats mismatch: item {iid} ({en['name']}) {key}: "
                              f"description {stats.get(key, 0)} vs stats object {value * mult:g}")
        outside_stats = TAG.sub(" ", re.sub(r"<stats>.*?</stats>", "", en["description"], flags=re.S))
        if POSSIBLE_PASSIVE.search(outside_stats):
            report.append(f"possible stat passive: {iid} {en['name']}")
        bin_item = items_bin.get(f"Items/{iid}", {})
        item_groups = []
        for g in bin_item.get("mItemGroups", []):
            if g in group_max:
                gid = g[len(GROUP_PREFIX):] if g.startswith(GROUP_PREFIX) else g
                item_groups.append(gid)
                groups[gid] = group_max[g]
        items[iid] = {
            "id": iid,
            "name": {"en": en["name"], "fr": fr["name"]},
            "desc": {"en": en["description"], "fr": fr["description"]},
            "gold": {"total": en["gold"]["total"], "base": en["gold"]["base"]},
            "from": en.get("from", []),
            "into": en.get("into", []),
            "tier": bin_item.get("epicness"),
            "groups": item_groups,
            "boots": "Boots" in item_groups,
            "requiredChampion": en.get("requiredChampion") or None,
            "stats": stats,
        }
    return items, groups, report


def build_runes(rr_en, rr_fr):
    """Rune trees and runes in DATA.runes shape, names and descriptions in both languages."""
    fr_names = {r["id"]: r for tree in rr_fr for slot in tree["slots"] for r in slot["runes"]}
    fr_trees = {t["id"]: t for t in rr_fr}
    trees, by_id = [], {}
    for tree in rr_en:
        slots = []
        for row, slot in enumerate(tree["slots"]):
            slots.append([r["id"] for r in slot["runes"]])
            for r in slot["runes"]:
                fr = fr_names.get(r["id"], r)
                by_id[str(r["id"])] = {"id": r["id"], "name": {"en": r["name"], "fr": fr["name"]},
                                       "desc": {"en": r["longDesc"], "fr": fr["longDesc"]},
                                       "tree": tree["id"], "row": row}
        trees.append({"id": tree["id"], "key": tree["key"],
                      "name": {"en": tree["name"], "fr": fr_trees.get(tree["id"], tree)["name"]},
                      "slots": slots})
    return {"trees": trees, "byId": by_id}
