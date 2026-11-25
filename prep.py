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
            "plaintext": {"en": en.get("plaintext") or "", "fr": fr.get("plaintext") or ""},
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
    """Rune trees and runes in DATA.runes shape: names, short and long descriptions in both languages, and the
    icon path under Data Dragon's /cdn/img/ ("perk-images/...")."""
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
                                       "short": {"en": r.get("shortDesc", ""), "fr": fr.get("shortDesc", "")},
                                       "icon": r.get("icon", ""), "tree": tree["id"], "row": row}
        trees.append({"id": tree["id"], "key": tree["key"],
                      "name": {"en": tree["name"], "fr": fr_trees.get(tree["id"], tree)["name"]},
                      "icon": tree.get("icon", ""), "slots": slots})
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
PLACEHOLDER = re.compile(r"\{\{(.*?)\}\}|@([^@\s<>]+)@")
SIMPLE_NAME = re.compile(r"^\s*([A-Za-z_]\w*)\s*(?:\*\s*(-?[\d.]+))?\s*$")
DAMAGE_TYPES = {"physicalDamage": "physical", "magicDamage": "magic", "trueDamage": "true"}
# "% max Health", " max Health", "% of the target's missing-Health", ...
HEALTH_BASE = re.compile(r"^\s*%?\s*(?:of\s+(?:the\s+)?(?:target'?s?\s+|their\s+|its\s+)?)?(max(?:imum)?|current|missing)[- ]Health",
                         re.I)
NOT_REAL_DAMAGE = re.compile(r"Attack Damage|increased damage|damage amplification", re.I)
NON_CHAMPION_AFTER = re.compile(r"^\s*(?:to|against|vs\.?)\s+(?:minions|monsters|non-champions)", re.I)


def _term_kind(after):
    """(kind, shown as a percentage) from the text right after a placeholder."""
    text = TAG.sub(" ", after)
    percent = text.lstrip().startswith("%")
    base = HEALTH_BASE.match(text)
    if base:
        word = base.group(1).lower()
        return {"missing": "targetMissing", "current": "targetCurrent"}.get(word, "targetMax"), percent
    # A percentage of something other than the target's health (bonus Health, "% damage", "per 1%...").
    return ("unsupported", True) if percent else ("flat", False)


def parse_damage_lines(tooltip, calc_names, value_names):
    """Damage lines from a tooltip: each <xDamage> segment against champions becomes {type, terms}.

    A term is {calc|value, kind, [mult], [percent]}: `mult` is the tooltip's display multiplier
    ({{ x*100 }}), `percent` means a "%" follows it. Returns (lines, flags)."""
    calcs = {n.lower(): n for n in calc_names}
    values = {n.lower(): n for n in value_names}
    lines, flags = [], []
    previous_end = 0
    for match in DAMAGE_TAG.finditer(tooltip):
        tag, segment = match.group(1), match.group(2)
        before = TAG.sub(" ", tooltip[previous_end:match.start()])[-60:]
        following = re.sub(r"\s+", " ", TAG.sub(" ", tooltip[match.end():match.end() + 300]))
        previous_end = match.end()
        words = TAG.sub(" ", PLACEHOLDER.sub(" ", segment))
        # Buffs written in damage colours ("bonus Attack Damage", "Mana", "% increased damage") aren't damage.
        if not re.search(r"damage", NOT_REAL_DAMAGE.sub(" ", words), re.I):
            continue
        # Damage to minions or monsters only.
        # "..., reduced to 50% against minions" changes another effect, not where the damage applies.
        sentence = re.sub(r"(?:reduced|increased) (?:to|by) \S+ against (?:minions|monsters)", "", following.split(".")[0])
        if (re.search(r"minion|monster", before, re.I) and not re.search(r"champion", before, re.I)) \
                or NON_CHAMPION_AFTER.match(following) \
                or (re.search(r"(?:against|to)\s+(?:a\s+)?(?:jungle\s+)?(?:minion|monster)", sentence, re.I)
                    and not re.search(r"champion", sentence, re.I)):
            continue
        found = list(PLACEHOLDER.finditer(segment))
        terms, unresolved = [], False
        for i, m in enumerate(found):
            simple = SIMPLE_NAME.match(m.group(1) if m.group(1) is not None else m.group(2))
            name = simple.group(1).lower() if simple else None
            after = segment[m.end():found[i + 1].start() if i + 1 < len(found) else len(segment)]
            between = TAG.sub(" ", segment[found[i - 1].end():m.start()]) if i else ""
            # "X plus Y per Z Chimes": Z is a count; "X to Y damage": Y is the top of a range (X kept).
            if re.search(r"\b(per|to)\s*$", between, re.I):
                continue
            if name in calcs:
                term = {"calc": calcs[name]}
            elif name in values:
                term = {"value": values[name]}
            else:
                unresolved = True
                continue
            term["kind"], percent = _term_kind(after)
            if simple.group(2) is not None and float(simple.group(2)) != 1:
                term["mult"] = _num(float(simple.group(2)))
            if percent:
                term["percent"] = True
            terms.append(term)
        if unresolved and "unparsed_tooltip" not in flags:
            flags.append("unparsed_tooltip")
        line = {"type": DAMAGE_TYPES[tag], "terms": terms}
        # "... physical damage {{ n }} times", "... each bounce", "per second": the number is for one hit.
        if re.search(r"\b(times|each|per|every)\b", words + " " + following, re.I):
            line["perHit"] = True
        # "between X and Y based on missing Health", "increased by up to ...": the number shown is one end of a range.
        if re.search(r"based on .{0,30}missing Health|increased by up to", sentence, re.I):
            line["varies"] = True
        if terms and line not in lines:
            lines.append(line)
    return lines, flags


HEAL_TAG = re.compile(r"<healing>(.*?)</healing>", re.S)
ALLY_WORD = re.compile(r"\ball(?:y|ies|ied)\b", re.I)
SELF_WORD = re.compile(r"\b(?:himself|herself|itself|themselves|themself|self)\b", re.I)
HEAL_VERB = re.compile(r"\b(?:restor\w*|heal(?:s|ed|ing)?|regenerat\w*|recover\w*|drain\w*)\b", re.I)  # not "Health"
DAMAGE_DEALT = re.compile(r"^\s*%?\s*(?:of\s+)?(?:the\s+|all\s+)?(?:pre-mitigation\s+|post-mitigation\s+)?damage(?!\s+taken)", re.I)
OTHER_UNIT = re.compile(r"^\s*%?\s*of\s+(?:the\s+)?(?:its|their|target'?s?|enemy'?s?|[A-Z]\w*'s)\b", re.I)
CHAMPION = re.compile(r"(?<!non-)champion", re.I)


def _heal_kind(after):
    """Heal term kind from the text after its placeholder: flat, damageDealt, selfMax/selfMissing/selfCurrent."""
    text = re.sub(r"\bof\s+(?:his|her)\s+", "of ", TAG.sub(" ", after), flags=re.I)  # "% of his missing Health"
    percent = text.lstrip().startswith("%")
    if DAMAGE_DEALT.match(text):
        return "damageDealt", percent
    if OTHER_UNIT.match(text):  # "% of its max Health": someone else's health
        return "unsupported", True
    base = HEALTH_BASE.match(text)
    if base:
        word = base.group(1).lower()
        return {"missing": "selfMissing", "current": "selfCurrent"}.get(word, "selfMax"), percent
    return ("unsupported", True) if percent else ("flat", False)


def parse_heal_lines(tooltip, calc_names, value_names):
    """Self-heal lines from a tooltip's <healing> segments: [{terms, [perSecond], [minimum]}] (terms as in
    damage lines, plus {"n": number} for a number written in the text).

    Kept only with a heal verb (restore, heal, regenerate, recover, drain) right before or inside the segment.
    Skipped: heals for allies only, against minions or monsters only, health lost or paid, healing boosts,
    "increased to ..." variants of a heal already read."""
    calcs = {n.lower(): n for n in calc_names}
    values = {n.lower(): n for n in value_names}
    lines, previous_end = [], 0
    clean = lambda html: re.sub(r"\s+", " ", TAG.sub(" ", re.sub(r"<br\s*/?>", ". ", html)))
    for match in HEAL_TAG.finditer(tooltip):
        segment = match.group(1)
        words = TAG.sub(" ", PLACEHOLDER.sub(" ", segment))
        sentence_before = re.split(r"[.!?:]\s", clean(tooltip[:match.start()]))[-1]
        since_last = clean(tooltip[previous_end:match.start()])
        previous_end = match.end()
        near = re.split(r"[.!?:]\s", since_last)[-1]  # this sentence, since the previous heal
        clause = re.split(r"[,;]", near)[-1]
        following = clean(tooltip[match.end():match.end() + 200])
        short = re.split(r"[.,;(]|\band\b", following)[0]
        if re.search(r"increase|reduce|power|effectiveness", words, re.I) \
                or re.search(r"(?:increased|reduced) (?:to|by)\s*$", near, re.I) \
                or re.search(r"\b(?:below|above|under|at least|max(?:imum)?(?: of)?:?)\s*$", near, re.I) \
                or re.search(r"\b(?:los(?:e|es|ing)|cost(?:s|ing)?|spend(?:s|ing)?|consum\w+)\s*$", near, re.I) \
                or not (HEAL_VERB.search(sentence_before) or HEAL_VERB.search(words)):
            continue
        if re.match(r"\s*(?:to|for)\s+(?:\w+\s+){0,2}all(?:y|ies|ied)\b", following, re.I) \
                or (ALLY_WORD.search(sentence_before) and not SELF_WORD.search(sentence_before + " " + short)):
            continue
        scope = clause + " " + words + " " + short
        if (re.search(r"minion|monster|non-champion", scope, re.I) and not CHAMPION.search(scope)):
            continue
        found = list(PLACEHOLDER.finditer(segment))
        terms = []
        for i, m in enumerate(found):
            simple = SIMPLE_NAME.match(m.group(1) if m.group(1) is not None else m.group(2))
            name = simple.group(1).lower() if simple else None
            last = i + 1 == len(found)
            after = segment[m.end():found[i + 1].start() if not last else len(segment)] + (" " + following[:60] if last else "")
            between = TAG.sub(" ", segment[found[i - 1].end():m.start()]) if i else ""
            if re.search(r"\b(?:per|to|and|max:?)\s*$", between, re.I):  # a count, the top of a range, a cap
                continue
            if name in calcs:
                term = {"calc": calcs[name]}
            elif name in values:
                term = {"value": values[name]}
            else:
                continue
            term["kind"], percent = _heal_kind(after)
            if simple.group(2) is not None and float(simple.group(2)) != 1:
                term["mult"] = _num(float(simple.group(2)))
            if percent:
                term["percent"] = True
            terms.append(term)
        literal = re.search(r"(\d+(?:\.\d+)?)\s*%", words)
        if not found and literal:  # "heals for 100% of all damage dealt"
            kind, _ = _heal_kind(words[literal.end() - 1:] + " " + following[:60])
            terms.append({"n": _num(float(literal.group(1))), "kind": kind, "percent": True})
        if not terms:
            continue
        line = {"terms": terms}
        if re.search(r"\b(?:per|each|every)\s+second", words + " " + short, re.I):
            line["perSecond"] = True
        if re.search(r"between|increased (?:up )?to .{0,40}based on|based on (?:his|her|their) missing Health",
                     near + " " + words + " " + following[:80], re.I):
            line["minimum"] = True  # the smallest value of a range is counted
        if line not in lines:
            lines.append(line)
    return lines


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


def _one_spell(key, sid, name, maxrank, tooltip, bin_spell, keep_all=False):
    flags = [] if bin_spell is not None else ["no_cdragon_spell"]
    bin_spell = bin_spell or {}
    values = _data_values(bin_spell)
    raw_calcs = bin_spell.get("mSpellCalculations") or {}
    lines, line_flags = parse_damage_lines(tooltip, set(raw_calcs), set(values))
    flags += line_flags
    heals = parse_heal_lines(tooltip, set(raw_calcs), set(values))
    # Keep only the calcs and values the damage lines reach (following refs).
    calcs, todo = {}, [t["calc"] for l in lines + heals for t in l["terms"] if "calc" in t]
    used_values = {t["value"] for l in lines + heals for t in l["terms"] if "value" in t}
    if keep_all:  # passives: rules.py championPassiveStats may name any of them
        todo += list(raw_calcs)
        used_values |= set(values)
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
            "calcs": calcs, "lines": lines, "heals": heals, "flags": flags}


def passive_tooltip(bin_data, record, strings):
    """(passive spell id, its bin entry, its English tooltip or None)."""
    lower = {k.lower(): v for k, v in bin_data.items() if isinstance(v, dict)}
    passive_path = record.get("mCharacterPassiveSpell", "")
    passive_id = passive_path.split("/")[-1]
    entry = lower.get(passive_path.lower(), {})
    loc = (((entry.get("mSpell") or {}).get("mClientData") or {}).get("mTooltipData") or {}).get("mLocKeys") or {}
    keys = [loc.get("keyTooltip", "").lower(), f"spell_{passive_id.lower()}_tooltip",
            f"spell_{passive_id.lower()}_tooltipextended"]
    tooltip = next((strings[k] for k in keys if k in strings), None)
    return passive_id, entry, None if tooltip is None else _resolve_strings(tooltip, strings)


# A stat named in a passive outside its damage text: a candidate for championPassiveStats in rules.py.
PASSIVE_STAT = re.compile(POSSIBLE_PASSIVE.pattern[:-1] + r"|Attack Range)")


def passive_stat_words(tooltip):
    return bool(PASSIVE_STAT.search(TAG.sub(" ", DAMAGE_TAG.sub(" ", tooltip or ""))))


LEVEL_UP_VALUE = re.compile(r"\{\{\s*([A-Za-z_]\w*)\s*(?:\*\s*(-?[\d.]+))?\s*\}\}(%?)")


def level_up(en, fr, values, skip, maxrank):
    """Rows of the game's level-up tooltip (Data Dragon leveltip): [{label: {en, fr}, values: [rank 1..maxrank], pct}].
    Each row's value is the first {{ name[*mult] }}[%] before "->", looked up in the spell's DataValues
    (case-insensitive). Names in `skip` (lower case) and names that aren't DataValues (cost, cooldown, old
    effect amounts) are left out."""
    lower = {k.lower(): v for k, v in values.items()}
    labels_fr = (fr.get("leveltip") or {}).get("label") or []
    tip = en.get("leveltip") or {}
    clean = lambda text: re.sub(r"@\w+@", "", text).strip(" :")
    rows = []
    for i, (label, effect) in enumerate(zip(tip.get("label") or [], tip.get("effect") or [])):
        m = LEVEL_UP_VALUE.search(effect.split("->")[0])
        name = m.group(1).lower() if m else None
        if not m or name in skip or not lower.get(name, [])[1:maxrank + 1]:
            continue
        mult = float(m.group(2) or 1)
        rows.append({"label": {"en": clean(label), "fr": clean(labels_fr[i]) if i < len(labels_fr) else clean(label)},
                     "values": [_num(round(v * mult, 3)) for v in lower[name][1:maxrank + 1]], "pct": bool(m.group(3))})
    return rows


def _damage_names(spell):
    """Lower-case names of the values and calcs a spell's damage lines reach (following refs)."""
    names, todo, seen = set(), [], set()
    for line in spell["lines"]:
        for term in line["terms"]:
            if "value" in term:
                names.add(term["value"].lower())
            if "calc" in term:
                todo.append(term["calc"])
    while todo:
        calc = todo.pop()
        if calc in seen:
            continue
        seen.add(calc)
        names.add(calc.lower())

        def visit(node):
            if node.get("t") == "v" and "name" in node:
                names.add(node["name"].lower())
            elif node.get("t") == "ref" and "name" in node:
                todo.append(node["name"])
        _walk_nodes(spell["calcs"].get(calc, {}), visit)
    return names


def build_spells(dd_en, dd_fr, bin_data, record, strings):
    """Passive + Q/W/E/R in DATA spell shape, from a Data Dragon champion, its CommunityDragon file and the string table."""
    lower = {k.lower(): v for k, v in bin_data.items() if isinstance(v, dict)}
    spells = []
    passive_id, entry, tooltip = passive_tooltip(bin_data, record, strings)
    passive = _one_spell("P", passive_id, {"en": dd_en["passive"]["name"], "fr": dd_fr["passive"]["name"]}, 1,
                         tooltip or "", entry.get("mSpell") if entry else None, keep_all=True)
    if tooltip is None:
        passive["flags"].append("no_tooltip")
    if not entry:
        passive["flags"] = [f for f in passive["flags"] if f != "no_cdragon_spell"] + ["no_cdragon_spell"]
    passive["desc"] = {"en": dd_en["passive"].get("description", ""), "fr": dd_fr["passive"].get("description", "")}
    spells.append(passive)
    names = record.get("spellNames", [])
    for i, key in enumerate("QWER"):
        en, fr = dd_en["spells"][i], dd_fr["spells"][i]
        suffix = "/spells/" + names[i].lower() if i < len(names) else None
        entry = next((v for k, v in lower.items() if suffix and k.endswith(suffix)), None)
        spell = _one_spell(key, en["id"], {"en": en["name"], "fr": fr["name"]}, en["maxrank"],
                           en.get("tooltip", ""), entry.get("mSpell") if entry else None)
        # Plain description, cooldown and cost per rank ("8/7/6"); cost only when it is paid in the resource.
        spell["desc"] = {"en": en.get("description", ""), "fr": fr.get("description", "")}
        spell["cooldown"] = en.get("cooldownBurn") if en.get("cooldownBurn") not in (None, "", "0") else None
        spell["cost"] = en.get("costBurn") if "{{ cost }}" in en.get("resource", "") and en.get("costBurn") not in (None, "0") else None
        spell["levelUp"] = level_up(en, fr, _data_values(entry.get("mSpell") or {}) if entry else {},
                                    _damage_names(spell), en["maxrank"])
        spells.append(spell)
    return spells


def _line_unsupported(spell, line):
    """Reasons a damage line can't be fully computed (unsupported parts, missing calcs or values)."""
    bad, seen, todo = [], set(), [t["calc"] for t in line["terms"] if "calc" in t]
    bad += ["missing value" for t in line["terms"] if "value" in t and t["value"] not in spell["values"]]
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
            elif node.get("t") == "v" and node["name"] not in spell["values"]:
                bad.append("missing value")
        _walk_nodes(spell["calcs"][name], visit)
    return bad


def skill_rank_flags(spells):
    """['custom_skill_ranks'] when the champion doesn't use the usual 5/5/5/3 ranks."""
    usual = {"Q": 5, "W": 5, "E": 5, "R": 3}
    odd = any(s["maxrank"] != usual[s["key"]] for s in spells if s["key"] in usual)
    return ["custom_skill_ranks"] if odd else []


# DATA base key -> (Data Dragon key, CommunityDragon record key, multiplier). Data Dragon has shipped wrong
# values (16.23: attack damage per level 0 for every champion), so the game files win when they have the key.
BASE_STATS = {
    "hp": ("hp", "baseHPModifiable", 1), "hpperlevel": ("hpperlevel", "hpPerLevelModifiable", 1),
    "mp": ("mp", None, 1), "mpperlevel": ("mpperlevel", None, 1),
    "armor": ("armor", "baseArmorModifiable", 1), "armorperlevel": ("armorperlevel", "armorPerLevelModifiable", 1),
    "mr": ("spellblock", "baseMR", 1), "mrperlevel": ("spellblockperlevel", "mrPerLevel", 1),
    "ad": ("attackdamage", "baseDamageModifiable", 1), "adperlevel": ("attackdamageperlevel", "damagePerLevelModifiable", 1),
    "as": ("attackspeed", "attackSpeedModifiable", 1),
    "asperlevel": ("attackspeedperlevel", "attackSpeedPerLevelModifiable", 1),
    "ms": ("movespeed", "baseMoveSpeedModifiable", 1), "range": ("attackrange", "attackRangeModifiable", 1),
    "hpregen": ("hpregen", "baseStaticHPRegenModifiable", 5), "hpregenperlevel": ("hpregenperlevel", "hpRegenPerLevelModifiable", 5),
    "mpregen": ("mpregen", None, 1), "mpregenperlevel": ("mpregenperlevel", None, 1),
}


def base_stats(s, record):
    """(base stats, {key: [champion-less 'dd -> cd' notes]}) with game-file values where present."""
    base, changed = {}, {}
    for key, (dd_key, cd_key, mult) in BASE_STATS.items():
        value = s[dd_key]
        cd = (record or {}).get(cd_key) if cd_key else None
        if isinstance(cd, dict) and "baseValue" in cd:
            game = round(cd["baseValue"] * mult, 4)
            if abs(game - value) > 1e-3:
                changed[key] = f"{value:g} -> {game:g}"
            value = game
        base[key] = value
    return base, changed


POSSIBLE_RUNE_STAT = re.compile(r"(Adaptive Force|Attack Speed|Ability Haste|Health|Armor|Magic Resist|Move Speed)")


def build_champions(dd_en, dd_fr, records):
    """Champions in DATA.champions shape. `records` maps id -> CommunityDragon CharacterRecords/Root or None."""
    champs, report, fixed = {}, [], collections.defaultdict(list)
    for cid, en in dd_en["data"].items():
        fr = dd_fr["data"].get(cid, en)
        s = en["stats"]
        record = records.get(cid)
        flags = []
        base, changed = base_stats(s, record)
        for key, note in changed.items():
            fixed[key].append(f"{cid} {note}")
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
            "tags": en.get("tags", []),  # Riot's classes: Marksman, Mage, Tank...
            "difficulty": en.get("info", {}).get("difficulty"),  # Riot's 1-10 rating
            "resource": en.get("partype", ""),
            "base": {**base, "asratio": round(ratio, 4)},
            "adaptiveAP": adaptive_ap,
            "flags": flags,
        }
    for key, notes in sorted(fixed.items()):
        report.append(f"base {key} taken from game files for {len(notes)} champions "
                      f"(Data Dragon differs): {', '.join(notes[:8])}{' ...' if len(notes) > 8 else ''}")
    return champs, report


def build_summoners(en, fr):
    """Summoner's Rift summoner spells: name and description in both languages, cooldown, icon file."""
    out = {}
    for sid, s in en["data"].items():
        if "CLASSIC" not in s.get("modes", []):
            continue
        f = fr["data"].get(sid, s)
        out[sid] = {"id": sid, "name": {"en": s["name"], "fr": f["name"]},
                    "desc": {"en": s["description"], "fr": f["description"]},
                    "cooldown": s.get("cooldownBurn"), "icon": s["image"]["full"], "level": int(s.get("summonerLevel", 1))}
    return out


def change_details(old, new):
    """What changed, field by field, for the "What changed" tab: champion base stats and ability cooldowns/costs,
    item stats and price, rune texts. [{kind, id, changes: [[field, before, after]]}]; before/after are None for
    a change shown without numbers (an ability's details, a rune's description)."""
    out = []
    for cid, c in new.get("champions", {}).items():
        o = old.get("champions", {}).get(cid)
        if not o or o == c:
            continue
        ch = [["base." + k, o["base"].get(k), v] for k, v in c["base"].items() if o["base"].get(k) != v]
        old_spells = {s["key"]: s for s in o.get("spells", [])}
        for s in c.get("spells", []):
            p = old_spells.get(s["key"], {})
            for f in ("cooldown", "cost"):
                if f in p and p.get(f) != s.get(f):
                    ch.append([f"{s['key']}.{f}", p.get(f), s.get(f)])
            if {k: v for k, v in p.items() if k not in ("cooldown", "cost", "desc")} != \
                    {k: v for k, v in s.items() if k not in ("cooldown", "cost", "desc")}:
                ch.append([f"{s['key']}.details", None, None])
        if ch:
            out.append({"kind": "champion", "id": cid, "changes": ch})
    for iid, i in new.get("items", {}).items():
        o = old.get("items", {}).get(iid)
        if not o or o == i:
            continue
        ch = [["stat." + k, o["stats"].get(k), i["stats"].get(k)] for k in sorted(set(o["stats"]) | set(i["stats"]))
              if o["stats"].get(k) != i["stats"].get(k)]
        if o["gold"]["total"] != i["gold"]["total"]:
            ch.append(["gold", o["gold"]["total"], i["gold"]["total"]])
        if o.get("desc") != i.get("desc"):
            ch.append(["desc", None, None])
        if ch:
            out.append({"kind": "item", "id": iid, "changes": ch})
    for rid, r in new.get("runes", {}).get("byId", {}).items():
        o = old.get("runes", {}).get("byId", {}).get(rid)
        if o and o.get("desc") != r.get("desc"):
            out.append({"kind": "rune", "id": rid, "changes": [["desc", None, None]]})
    return out


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
# Usual positions per champion (Riot's files have none). Community data, "latest" only: cached per patch.
MERAKI = "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json"
POSITIONS = ("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT")


RATINGS = ("damage", "toughness", "control", "mobility", "utility")


def attach_positions(champions, meraki):
    """Sets each champion's "positions" and 1-3 "ratings" (damage, toughness...) from Meraki's file; returns the ids
    it doesn't list."""
    missing = []
    for cid, champ in champions.items():
        entry = meraki.get(cid) or {}
        ratings = entry.get("attributeRatings") or {}
        champ["ratings"] = {k: ratings[k] for k in RATINGS if isinstance(ratings.get(k), int)}
        champ["positions"] = [p for p in entry.get("positions", []) if p in POSITIONS]
        if not champ["positions"]:
            missing.append(cid)
    return missing


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
    summoners = build_summoners(dd("en_US", "summoner"), dd("fr_FR", "summoner"))
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
    try:
        no_position = attach_positions(champions, fetch_json(MERAKI, cache / "meraki_champions.json"))
    except (urllib.error.URLError, ValueError) as e:  # a missing role must not block a patch update
        no_position = attach_positions(champions, {})
        report.append(f"Meraki positions not downloaded: {e}")
    unsupported, unparsed, spells_ok, spells_all = collections.Counter(), [], 0, 0
    possible_champ_stats = sorted(cid for cid, (rec, data, _, _) in files.items()
                                  if passive_stat_words(passive_tooltip(data, rec or {}, strings)[2]))
    for cid, (rec, data, dd_en, dd_fr) in files.items():
        spells = build_spells(dd_en, dd_fr, data, rec or {}, strings)
        champions[cid]["spells"] = spells
        champions[cid]["flags"] += skill_rank_flags(spells)
        for s in spells:
            if not s["lines"] and "unparsed_tooltip" not in s["flags"]:
                continue  # no damage text at all
            spells_all += 1
            bad = ["unparsed text"] if "unparsed_tooltip" in s["flags"] else []
            if bad:
                unparsed.append(f"{cid} {s['key']}")
            for line in s["lines"]:
                bad += _line_unsupported(s, line)
                bad += ["percentage of another base" for t in line["terms"] if t["kind"] == "unsupported"]
            unsupported.update(bad)
            spells_ok += not bad
    coverage = f"spells with damage fully readable: {spells_ok}/{spells_all} ({100 * spells_ok / max(spells_all, 1):.1f}%)"
    heal_lines = [(cid, s) for cid, c in champions.items() for s in c["spells"] if s["heals"]]
    heals_ok = sum(1 for _, s in heal_lines if not _line_unsupported(s, s["heals"][0])
                   and all(t["kind"] != "unsupported" for t in s["heals"][0]["terms"]))
    heal_coverage = f"spells with a self-heal read: {len(heal_lines)}, fully readable: {heals_ok}"
    items, groups, item_report = build_items(it_en, it_fr, items_bin)
    runes = build_runes(rr_en, rr_fr)
    from rules import RULES

    possible_passives = [line.split()[3] for line in item_report if line.startswith("possible stat passive:")]
    possible_runes = sorted(k for k, r in runes["byId"].items()
                            if POSSIBLE_RUNE_STAT.search(TAG.sub(" ", r["desc"]["en"])))
    outside_stats = lambda html: TAG.sub(" ", re.sub(r"<stats>.*?</stats>", "", html, flags=re.S))
    damage_words = re.compile(r"damag|critical", re.I)  # "damage", "Damaging", "Critically Strikes"
    possible_item_damage = sorted(i for i, it in items.items() if damage_words.search(outside_stats(it["desc"]["en"])))
    possible_rune_damage = sorted(k for k, r in runes["byId"].items() if damage_words.search(TAG.sub(" ", r["desc"]["en"])))
    survival_words = re.compile(r"shield|heal|restore|stasis|revive|cleanse|Lifeline", re.I)
    possible_survival = sorted(i for i, it in items.items()
                               if it["tier"] == 5 and survival_words.search(outside_stats(it["desc"]["en"])))
    data = {"patch": patch, "champions": champions, "items": items, "groups": groups, "runes": runes, "summoners": summoners,
            "rules": RULES, "review": {"possibleStatPassives": possible_passives, "possibleRuneStats": possible_runes,
                                       "possibleItemDamage": possible_item_damage,
                                       "possibleRuneDamage": possible_rune_damage,
                                       "possibleSurvival": possible_survival,
                                       "possibleChampionStats": possible_champ_stats}}

    out_dir = root / "data"
    out_dir.mkdir(exist_ok=True)
    previous = sorted((p for p in out_dir.glob("*.json") if p.stem != patch),
                      key=lambda p: [int(x) for x in p.stem.split(".")])
    old = json.loads(previous[-1].read_text(encoding="utf-8")) if previous else {}
    diff = diff_patches(old, data) if previous else []
    data["review"]["changes"] = change_details(old, data) if previous else []
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
        ("Possible champion stat passives (review in rules.py)",
         [f"{c} {champions[c]['spells'][0]['name']['en']}" for c in possible_champ_stats]),
        ("Possible rune stats (review in rules.py)",
         [f"{k} {runes['byId'][k]['name']['en']}" for k in possible_runes]),
        ("Spell coverage", [coverage, heal_coverage]),
        ("Spells with unparsed damage text", unparsed),
        ("Unsupported formula parts (count)", [f"{n} {what}" for what, n in unsupported.most_common()]),
        ("Possible item damage effects (review in rules.py)",
         [f"{i} {items[i]['name']['en']}" for i in possible_item_damage]),
        ("Possible rune damage effects (review in rules.py)",
         [f"{k} {runes['byId'][k]['name']['en']}" for k in possible_rune_damage]),
        ("Possible survival items for the advisor (review in rules.py)",
         [f"{i} {items[i]['name']['en']}" for i in possible_survival]),
        ("Champion records (missing, or base stats corrected from game files)", champ_report),
        ("Champions with no position (Meraki doesn't list them yet)", no_position),
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
