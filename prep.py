"""Download one patch of League game data and write data.js for the page.

Usage: python3 prep.py [patch]
"""
import collections
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
# Any stat named outside the <stats> block might be a stat-changing passive; every hit gets sorted in rules.py.
POSSIBLE_PASSIVE = re.compile(r"(Health|Mana|Attack Damage|Ability Power|Armor|Magic Resist|Attack Speed|Ability Haste|"
                              r"Move Speed|Critical Strike|Lethality|Omnivamp|Life Steal|Heal and Shield Power|Tenacity|"
                              r"Adaptive Force|Penetration)")
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


# --- Spell formulas -------------------------------------------------------------------------------
# Game stat codes in formulas (missing key = 0) and stat basis (0 total, 1 base, 2 bonus).
STAT_CODES = {0: "ap", 1: "armor", 2: "ad", 4: "as", 6: "mr", 7: "ms", 8: "crit", 9: "critDmg", 12: "hp", 29: "lethality"}
STAT_BASIS = {0: "total", 1: "base", 2: "bonus"}


def _stat(part):
    code = part.get("mStat", 0)
    if code not in STAT_CODES:
        return None, {"t": "x", "what": f"mStat {code}"}
    return STAT_CODES[code], None


def normalize_part(part):
    """One formula part as a small tree node (see the stage 2 plan); unknown shapes become {'t': 'x'}."""
    try:
        return _normalize_part(part)
    except KeyError as missing:
        return {"t": "x", "what": f"{part.get('__type', '')} without {missing}"}


def _normalize_part(part):
    kind = part.get("__type", "")
    if kind == "NamedDataValueCalculationPart":
        return {"t": "v", "name": part["mDataValue"]}
    if kind == "NumberCalculationPart":
        return {"t": "n", "n": _num(part.get("mNumber", 0))}
    if kind in ("StatByCoefficientCalculationPart", "StatByNamedDataValueCalculationPart"):
        stat, bad = _stat(part)
        if bad:
            return bad
        coef = ({"t": "v", "name": part["mDataValue"]} if kind == "StatByNamedDataValueCalculationPart"
                else {"t": "n", "n": _num(part.get("mCoefficient", 0))})
        return {"t": "stat", "stat": stat, "basis": STAT_BASIS.get(part.get("mStatFormula", 0), "total"), "coef": coef}
    if kind == "StatBySubPartCalculationPart":
        stat, bad = _stat(part)
        if bad:
            return bad
        return {"t": "statOf", "stat": stat, "basis": STAT_BASIS.get(part.get("mStatFormula", 0), "total"),
                "part": normalize_part(part["mSubpart"])}
    if kind == "ByCharLevelBreakpointsCalculationPart":
        bps = []
        # Each breakpoint: [level, one-time bonus at that level, bonus per level at and after it].
        known = {"mLevel", "mAdditionalBonusAtThisLevel", "mBonusPerLevelAtAndAfter", "__type"}
        for bp in part.get("mBreakpoints", []):
            if set(bp) - known:
                return {"t": "x", "what": "Breakpoint " + ",".join(sorted(set(bp) - known))}
            entry = [bp.get("mLevel", 1), _num(bp.get("mAdditionalBonusAtThisLevel", 0))]
            if "mBonusPerLevelAtAndAfter" in bp:
                entry.append(_num(bp["mBonusPerLevelAtAndAfter"]))
            bps.append(entry)
        return {"t": "lvlBp", "start": _num(part.get("mLevel1Value", 0)), "bps": bps}
    if kind == "ByCharLevelInterpolationCalculationPart":
        return {"t": "lvlLerp", "a": _num(part.get("mStartValue", 0)), "b": _num(part.get("mEndValue", 0))}
    if kind == "SumOfSubPartsCalculationPart":
        return {"t": "sum", "parts": [normalize_part(p) for p in part.get("mSubparts", [])]}
    if kind == "ProductOfSubPartsCalculationPart":
        return {"t": "prod", "a": normalize_part(part["mPart1"]), "b": normalize_part(part["mPart2"])}
    if "mSpellCalculationKey" in part:
        return {"t": "ref", "name": part["mSpellCalculationKey"]}
    return {"t": "x", "what": kind}


def normalize_calc(calc):
    """A spell calculation as {parts, pct, mult, flags}."""
    try:
        return _normalize_calc(calc)
    except KeyError as missing:
        return {"parts": [{"t": "x", "what": f"{calc.get('__type', '')} without {missing}"}], "pct": False,
                "mult": None, "flags": []}


def _normalize_calc(calc):
    kind = calc.get("__type", "")
    if kind == "GameCalculationModified":
        return {"parts": [{"t": "ref", "name": calc["mModifiedGameCalculation"]}], "pct": False,
                "mult": normalize_part(calc["mMultiplier"]), "flags": []}
    if kind == "GameCalculationConditional":
        return {"parts": [{"t": "ref", "name": calc["mDefaultGameCalculation"]}], "pct": False, "mult": None,
                "flags": ["conditional"]}
    return {"parts": [normalize_part(p) for p in calc.get("mFormulaParts", [])],
            "pct": bool(calc.get("mDisplayAsPercent")),
            "mult": normalize_part(calc["mMultiplier"]) if "mMultiplier" in calc else None,
            "flags": []}


# --- Spells and damage lines ----------------------------------------------------------------------
DAMAGE_TAG = re.compile(r"<(physicalDamage|magicDamage|trueDamage)>(.*?)</\1>", re.S)
PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_]\w*)\s*(?:\*\s*-?[\d.]+)?\s*\}\}|@([A-Za-z_]\w*)(?:\*-?[\d.]+)?@")
DAMAGE_TYPES = {"physicalDamage": "physical", "magicDamage": "magic", "trueDamage": "true"}


def _term_kind(text):
    text = TAG.sub(" ", text)
    if re.search(r"missing Health", text, re.I):
        return "targetMissing"
    if re.search(r"current Health", text, re.I):
        return "targetCurrent"
    if re.search(r"max(imum)? Health", text, re.I):
        return "targetMax"
    return "flat"


def parse_damage_lines(tooltip, calc_names, value_names):
    """Damage lines from a tooltip: each <xDamage> segment becomes {type, terms}. Returns (lines, flags)."""
    calcs = {n.lower(): n for n in calc_names}
    values = {n.lower(): n for n in value_names}
    lines, flags = [], []
    for match in DAMAGE_TAG.finditer(tooltip):
        tag, segment = match.group(1), match.group(2)
        found = list(PLACEHOLDER.finditer(segment))
        terms, unresolved = [], False
        for i, m in enumerate(found):
            name = (m.group(1) or m.group(2)).lower()
            after = segment[m.end():found[i + 1].start() if i + 1 < len(found) else len(segment)]
            if name in calcs:
                terms.append({"calc": calcs[name], "kind": _term_kind(after)})
            elif name in values:
                terms.append({"value": values[name], "kind": _term_kind(after)})
            else:
                unresolved = True
        if unresolved and "unparsed_tooltip" not in flags:
            flags.append("unparsed_tooltip")
        line = {"type": DAMAGE_TYPES[tag], "terms": terms}
        # "... physical damage {{ n }} times", "... each bounce", "per second": the number is for one hit.
        following = TAG.sub(" ", tooltip[match.end():match.end() + 80])
        if re.search(r"\b(times|each|per|every)\b", TAG.sub(" ", segment) + " " + following, re.I):
            line["perHit"] = True
        if terms and line not in lines:
            lines.append(line)
    return lines, flags


def _data_values(spell):
    out = {}
    for dv in spell.get("DataValues") or spell.get("mDataValues") or []:
        name = dv.get("name") or dv.get("mName")
        if name:
            out[name] = [_num(round(v, 4)) for v in (dv.get("values") or dv.get("mValues") or [])]
    return out


def _walk_nodes(node, visit):
    if isinstance(node, dict):
        visit(node)
        for v in node.values():
            _walk_nodes(v, visit)
    elif isinstance(node, list):
        for v in node:
            _walk_nodes(v, visit)


def _resolve_strings(text, strings):
    """Replace {{ key }} references to other string-table entries, one level deep."""
    return re.sub(r"\{\{\s*([A-Za-z_]\w*)\s*\}\}",
                  lambda m: strings.get(m.group(1).lower(), m.group(0)), text)


def _one_spell(key, sid, name, maxrank, tooltip, bin_spell):
    flags = [] if bin_spell is not None else ["no_cdragon_spell"]
    bin_spell = bin_spell or {}
    values = _data_values(bin_spell)
    raw_calcs = bin_spell.get("mSpellCalculations") or {}
    lines, line_flags = parse_damage_lines(tooltip, set(raw_calcs), set(values))
    flags += line_flags
    # Keep only the calcs and values the damage lines reach (following refs).
    calcs, todo = {}, [t["calc"] for l in lines for t in l["terms"] if "calc" in t]
    used_values = {t["value"] for l in lines for t in l["terms"] if "value" in t}
    while todo:
        cname = todo.pop()
        if cname in calcs or cname not in raw_calcs:
            continue
        calcs[cname] = normalize_calc(raw_calcs[cname])

        def visit(node):
            if node.get("t") == "ref":
                todo.append(node["name"])
            elif node.get("t") == "v":
                used_values.add(node["name"])
        _walk_nodes(calcs[cname], visit)
    return {"key": key, "id": sid, "name": name, "maxrank": maxrank,
            "values": {k: v for k, v in values.items() if k in used_values},
            "calcs": calcs, "lines": lines, "flags": flags}


def build_spells(dd_en, dd_fr, bin_data, record, strings):
    """Passive + Q/W/E/R in DATA spell shape, from a Data Dragon champion, its CommunityDragon file and the string table."""
    lower = {k.lower(): v for k, v in bin_data.items() if isinstance(v, dict)}
    spells = []
    passive_path = record.get("mCharacterPassiveSpell", "")
    passive_id = passive_path.split("/")[-1]
    tooltip = next((strings[k] for k in (f"spell_{passive_id.lower()}_tooltip",
                                         f"spell_{passive_id.lower()}_tooltipextended") if k in strings), None)
    entry = lower.get(passive_path.lower(), {})
    passive = _one_spell("P", passive_id, {"en": dd_en["passive"]["name"], "fr": dd_fr["passive"]["name"]}, 1,
                         _resolve_strings(tooltip or "", strings), entry.get("mSpell") if entry else None)
    if tooltip is None:
        passive["flags"].append("no_tooltip")
    if not entry:
        passive["flags"] = [f for f in passive["flags"] if f != "no_cdragon_spell"] + ["no_cdragon_spell"]
    spells.append(passive)
    names = record.get("spellNames", [])
    for i, key in enumerate("QWER"):
        en, fr = dd_en["spells"][i], dd_fr["spells"][i]
        suffix = "/spells/" + names[i].lower() if i < len(names) else None
        entry = next((v for k, v in lower.items() if suffix and k.endswith(suffix)), None)
        spells.append(_one_spell(key, en["id"], {"en": en["name"], "fr": fr["name"]}, en["maxrank"],
                                 en.get("tooltip", ""), entry.get("mSpell") if entry else None))
    return spells


def _line_unsupported(spell, line):
    """Reasons a damage line can't be fully computed (unsupported parts or missing calcs)."""
    bad, seen, todo = [], set(), [t["calc"] for t in line["terms"] if "calc" in t]
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        seen.add(name)
        if name not in spell["calcs"]:
            bad.append("missing calc")
            continue

        def visit(node):
            if node.get("t") == "x":
                bad.append(node["what"])
            elif node.get("t") == "ref":
                todo.append(node["name"])
        _walk_nodes(spell["calcs"][name], visit)
    return bad


def skill_rank_flags(spells):
    """['custom_skill_ranks'] when the champion doesn't use the usual 5/5/5/3 ranks."""
    usual = {"Q": 5, "W": 5, "E": 5, "R": 3}
    odd = any(s["maxrank"] != usual[s["key"]] for s in spells if s["key"] in usual)
    return ["custom_skill_ranks"] if odd else []


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
    sections = (("items", "item", lambda d: d.get("items", {})),
                ("champions", "champion", lambda d: d.get("champions", {})),
                ("runes", "rune", lambda d: d.get("runes", {}).get("byId", {})))
    for _, label, pick in sections:
        a, b = pick(old), pick(new)
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

    def champion_files(cid):
        low = cid.lower()
        dd_en = dd("en_US", f"champion/{cid}")["data"][cid]
        dd_fr = dd("fr_FR", f"champion/{cid}")["data"][cid]
        try:
            data = cd(f"game/data/characters/{low}/{low}.bin.json")
        except urllib.error.HTTPError:
            return cid, (None, {}, dd_en, dd_fr)
        root = next((v for k, v in data.items() if k.lower() == f"characters/{low}/characterrecords/root"), None)
        return cid, (root, data, dd_en, dd_fr)

    strings = cd("game/en_us/data/menu/en_us/lol.stringtable.json")
    strings = strings.get("entries", strings)
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        files = dict(pool.map(champion_files, ch_en["data"]))
    records = {cid: f[0] for cid, f in files.items()}

    champions, champ_report = build_champions(ch_en, ch_fr, records)
    unsupported, unparsed, lines_ok, lines_all = collections.Counter(), [], 0, 0
    for cid, (rec, data, dd_en, dd_fr) in files.items():
        spells = build_spells(dd_en, dd_fr, data, rec or {}, strings)
        champions[cid]["spells"] = spells
        champions[cid]["flags"] += skill_rank_flags(spells)
        for s in spells:
            if "unparsed_tooltip" in s["flags"]:
                unparsed.append(f"{cid} {s['key']}")
            for line in s["lines"]:
                lines_all += 1
                bad = _line_unsupported(s, line)
                unsupported.update(bad)
                lines_ok += not bad
    coverage = f"damage lines fully readable: {lines_ok}/{lines_all} ({100 * lines_ok / max(lines_all, 1):.1f}%)"
    items, groups, item_report = build_items(it_en, it_fr, items_bin)
    runes = build_runes(rr_en, rr_fr)
    from rules import RULES

    possible_passives = [line.split()[3] for line in item_report if line.startswith("possible stat passive:")]
    possible_runes = sorted(k for k, r in runes["byId"].items()
                            if POSSIBLE_RUNE_STAT.search(TAG.sub(" ", r["desc"]["en"])))
    outside_stats = lambda html: TAG.sub(" ", re.sub(r"<stats>.*?</stats>", "", html, flags=re.S))
    possible_item_damage = sorted(i for i, it in items.items() if re.search(r"damage", outside_stats(it["desc"]["en"]), re.I))
    possible_rune_damage = sorted(k for k, r in runes["byId"].items() if re.search(r"damage", TAG.sub(" ", r["desc"]["en"]), re.I))
    data = {"patch": patch, "champions": champions, "items": items, "groups": groups, "runes": runes,
            "rules": RULES, "review": {"possibleStatPassives": possible_passives, "possibleRuneStats": possible_runes,
                                       "possibleItemDamage": possible_item_damage,
                                       "possibleRuneDamage": possible_rune_damage}}

    out_dir = root / "data"
    out_dir.mkdir(exist_ok=True)
    previous = sorted((p for p in out_dir.glob("*.json") if p.stem != patch),
                      key=lambda p: [int(x) for x in p.stem.split(".")])
    diff = diff_patches(json.loads(previous[-1].read_text(encoding="utf-8")), data) if previous else []
    changed = {"item": [], "champion": [], "rune": []}
    for line in diff:
        kind, label, key = line.split()
        if kind == "changed":
            changed[label].append(key)
    data["review"]["changed"] = changed
    data["review"]["comparedWith"] = previous[-1].stem if previous else None

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
        ("Spell coverage", [coverage]),
        ("Spells with unparsed damage text", unparsed),
        ("Unsupported formula parts (count)", [f"{n} {what}" for what, n in unsupported.most_common()]),
        ("Possible item damage effects (review in rules.py)",
         [f"{i} {items[i]['name']['en']}" for i in possible_item_damage]),
        ("Possible rune damage effects (review in rules.py)",
         [f"{k} {runes['byId'][k]['name']['en']}" for k in possible_rune_damage]),
        ("Missing CommunityDragon records", champ_report),
        ("CommunityDragon fallbacks", report),
        (f"Changes since {previous[-1].stem}" if previous else "Changes (no previous patch)", diff),
    ]
    report_path = out_dir / f"{patch}-report.txt"
    report_path.write_text("\n\n".join(f"== {title} ==\n" + ("\n".join(lines) or "(none)")
                                       for title, lines in sections) + "\n", encoding="utf-8")
    print(counts)
    print(coverage)
    print(f"report: {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
