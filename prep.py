"""Download one patch of League game data and write data.js for the page.

Usage: python3 prep.py [patch]
"""
import concurrent.futures
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

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


POSSIBLE_RUNE_STAT = re.compile(r"(Adaptive Force|Attack Speed|Ability Haste|Health|Armor|Magic Resist|Move Speed)")


def build_champions(dd_en, dd_fr, records):
    """Champions in DATA.champions shape. `records` maps id -> CommunityDragon CharacterRecords/Root or None."""
    champs, report = {}, []
    for cid, en in dd_en["data"].items():
        fr = dd_fr["data"].get(cid, en)
        s = en["stats"]
        record = records.get(cid)
        flags = []
        if record is None:
            flags.append("no_cdragon_record")
            report.append(f"no CommunityDragon record for {cid}: attack speed ratio = base attack speed, adaptive = AD")
            ratio, adaptive_ap = s["attackspeed"], False
        else:
            ratio = record.get("attackSpeedRatioModifiable", {}).get("baseValue", s["attackspeed"])
            adaptive_ap = record.get("mAdaptiveForceToAbilityPowerWeight") == 1.0
        champs[cid] = {
            "id": cid,
            "name": {"en": en["name"], "fr": fr["name"]},
            "title": {"en": en["title"], "fr": fr["title"]},
            "resource": en.get("partype", ""),
            "base": {
                "hp": s["hp"], "hpperlevel": s["hpperlevel"], "mp": s["mp"], "mpperlevel": s["mpperlevel"],
                "armor": s["armor"], "armorperlevel": s["armorperlevel"],
                "mr": s["spellblock"], "mrperlevel": s["spellblockperlevel"],
                "ad": s["attackdamage"], "adperlevel": s["attackdamageperlevel"],
                "as": s["attackspeed"], "asratio": round(ratio, 4), "asperlevel": s["attackspeedperlevel"],
                "ms": s["movespeed"], "range": s["attackrange"],
                "hpregen": s["hpregen"], "hpregenperlevel": s["hpregenperlevel"],
                "mpregen": s["mpregen"], "mpregenperlevel": s["mpregenperlevel"],
            },
            "adaptiveAP": adaptive_ap,
            "flags": flags,
        }
    return champs, report


def diff_patches(old, new):
    """'changed/new/removed <item|champion> <id>' lines between two DATA dicts."""
    lines = []
    for section, label in (("items", "item"), ("champions", "champion")):
        a, b = old.get(section, {}), new.get(section, {})
        lines += [f"changed {label} {k}" for k in sorted(a.keys() & b.keys()) if a[k] != b[k]]
        lines += [f"new {label} {k}" for k in sorted(b.keys() - a.keys())]
        lines += [f"removed {label} {k}" for k in sorted(a.keys() - b.keys())]
    return lines


def fetch_json(url, cache_path):
    """JSON from cache_path if present, else downloaded from url and cached."""
    cache_path = pathlib.Path(cache_path)
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    req = urllib.request.Request(url, headers={"User-Agent": "lol-build-calculator"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(text, encoding="utf-8")
    return json.loads(text)


DD = "https://ddragon.leagueoflegends.com"
CD = "https://raw.communitydragon.org"


def main(argv):
    root = pathlib.Path(__file__).parent
    patch = argv[1] if len(argv) > 1 else fetch_json(f"{DD}/api/versions.json", root / "cache" / "versions.json")[0]
    if len(argv) <= 1:
        (root / "cache" / "versions.json").unlink()  # always re-check the latest version next run
    cache = root / "cache" / patch
    major_minor = ".".join(patch.split(".")[:2])
    report = []

    def dd(lang, name):
        return fetch_json(f"{DD}/cdn/{patch}/data/{lang}/{name}.json", cache / lang / f"{name}.json")

    def cd(path):
        try:
            return fetch_json(f"{CD}/{major_minor}/{path}", cache / "cd" / path)
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            report.append(f"CommunityDragon {major_minor} missing {path}, used latest")
            return fetch_json(f"{CD}/latest/{path}", cache / "cd" / path)

    ch_en, ch_fr = dd("en_US", "champion"), dd("fr_FR", "champion")
    it_en, it_fr = dd("en_US", "item"), dd("fr_FR", "item")
    rr_en, rr_fr = dd("en_US", "runesReforged"), dd("fr_FR", "runesReforged")
    items_bin = cd("game/items.cdtb.bin.json")

    def record(cid):
        low = cid.lower()
        try:
            data = cd(f"game/data/characters/{low}/{low}.bin.json")
        except urllib.error.HTTPError:
            return cid, None
        for key, value in data.items():
            if key.lower() == f"characters/{low}/characterrecords/root":
                return cid, value
        return cid, None

    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        records = dict(pool.map(record, ch_en["data"]))

    champions, champ_report = build_champions(ch_en, ch_fr, records)
    items, groups, item_report = build_items(it_en, it_fr, items_bin)
    runes = build_runes(rr_en, rr_fr)
    from rules import RULES

    possible_passives = [line.split()[3] for line in item_report if line.startswith("possible stat passive:")]
    possible_runes = sorted(k for k, r in runes["byId"].items()
                            if POSSIBLE_RUNE_STAT.search(TAG.sub(" ", r["desc"]["en"])))
    data = {"patch": patch, "champions": champions, "items": items, "groups": groups, "runes": runes,
            "rules": RULES, "review": {"possibleStatPassives": possible_passives, "possibleRuneStats": possible_runes}}

    out_dir = root / "data"
    out_dir.mkdir(exist_ok=True)
    previous = sorted((p for p in out_dir.glob("*.json") if p.stem != patch),
                      key=lambda p: [int(x) for x in p.stem.split(".")])
    diff = diff_patches(json.loads(previous[-1].read_text(encoding="utf-8")), data) if previous else []

    text = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    (root / "data.js").write_text(f"window.DATA = {text};\n", encoding="utf-8")
    (out_dir / f"{patch}.json").write_text(text, encoding="utf-8")

    counts = f"patch {patch}: {len(champions)} champions, {len(items)} items, {len(groups)} item groups, " \
             f"{len(runes['byId'])} runes"
    sections = [
        ("Counts", [counts]),
        ("Unknown stats", [l for l in item_report if l.startswith("unknown stat")]),
        ("Stats object mismatches", [l for l in item_report if l.startswith("stats mismatch")]),
        ("Possible stat passives (review in rules.py)", [l for l in item_report if l.startswith("possible stat")]),
        ("Possible rune stats (review in rules.py)",
         [f"{k} {runes['byId'][k]['name']['en']}" for k in possible_runes]),
        ("Missing CommunityDragon records", champ_report),
        ("CommunityDragon fallbacks", report),
        (f"Changes since {previous[-1].stem}" if previous else "Changes (no previous patch)", diff),
    ]
    report_path = out_dir / f"{patch}-report.txt"
    report_path.write_text("\n\n".join(f"== {title} ==\n" + ("\n".join(lines) or "(none)")
                                       for title, lines in sections) + "\n", encoding="utf-8")
    print(counts)
    print(f"report: {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
