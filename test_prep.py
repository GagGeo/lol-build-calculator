import unittest

from prep import parse_item_stats, build_items, build_runes, build_champions, diff_patches, normalize_calc, parse_damage_lines, build_spells, skill_rank_flags

CLEAVER = ("<mainText><stats><attention>45</attention> Attack Damage<br>"
           "<attention>400</attention> Health<br><attention>20</attention> Ability Haste"
           "</stats><br><br><passive>Carve</passive>…</mainText>")


class ParseItemStats(unittest.TestCase):
    def test_parses_all_stats(self):
        self.assertEqual(parse_item_stats(CLEAVER), ({"ad": 45, "hp": 400, "ah": 20}, []))

    def test_percent_move_speed(self):
        self.assertEqual(parse_item_stats("<stats><attention>4%</attention> Move Speed</stats>")[0], {"msPct": 4})

    def test_flat_move_speed(self):
        self.assertEqual(parse_item_stats("<stats><attention>25</attention> Move Speed</stats>")[0], {"ms": 25})

    def test_percent_magic_pen(self):
        self.assertEqual(parse_item_stats("<stats><attention>40%</attention> Magic Penetration</stats>")[0],
                         {"magicPenPct": 40})

    def test_unknown_name_reported(self):
        self.assertEqual(parse_item_stats("<stats><attention>5</attention> Foo Bar</stats>"), ({}, ["Foo Bar"]))

    def test_gold_per_10_ignored(self):
        self.assertEqual(parse_item_stats("<stats><attention>3</attention> Gold Per 10 Seconds</stats>"), ({}, []))

    def test_no_stats_block(self):
        self.assertEqual(parse_item_stats("<mainText>Active only</mainText>"), ({}, []))


def _item(name, desc, total=1000, **extra):
    base = {"name": name, "description": desc, "maps": {"11": True},
            "gold": {"base": total, "total": total, "purchasable": True}, "tags": [], "stats": {}}
    base.update(extra)
    return base


EN = {"data": {
    "1036": _item("Long Sword", "<mainText><stats><attention>10</attention> Attack Damage</stats></mainText>",
                  350, into=["3071"], stats={"FlatPhysicalDamageMod": 10}),
    "3071": _item("Black Cleaver", CLEAVER, 3000, **{"from": ["1036"]},
                  stats={"FlatHPPoolMod": 400, "FlatPhysicalDamageMod": 45}),
    "3006": _item("Berserker's Greaves",
                  "<stats><attention>25%</attention> Attack Speed<br><attention>45</attention> Move Speed</stats>",
                  1100, stats={"PercentAttackSpeedMod": 0.25, "FlatMovementSpeedMod": 45}),
    "3599": _item("Kalista's Black Spear", "<mainText></mainText>", 0, requiredChampion="Kalista"),
    "2003": _item("Health Potion", "", 50, tags=["Consumable"]),
    "3340": _item("Stealth Ward", "", 0, tags=["Trinket"]),
    "9999": _item("Aram Thing", "", maps={"11": False}),
    "7777": _item("Ornn Upgrade", "", requiredAlly="Ornn"),
    "8888": _item("Hidden", "", hideFromAll=True),
    "5555": _item("Mismatch", "<stats><attention>45</attention> Attack Damage</stats>",
                  stats={"FlatPhysicalDamageMod": 40}),
    "4444": _item("Deathcap", "<stats><attention>130</attention> Ability Power</stats><br>"
                  "<passive>Opus</passive> Increases your total Ability Power by 30%."),
    "6666": _item("Odd", "<stats><attention>5</attention> Foo Bar</stats>"),
    "4633": _item("Riftmaker", "<stats><attention>350</attention> Health</stats><br>"
                  "<passive>Void Infusion</passive> Gain 2% of your bonus Health as Ability Power."),
    "323107": _item("Redemption", "<stats><attention>15</attention> Ability Haste</stats>"),
}}
FR = {"data": {k: {**v, "name": "Couperet noir" if k == "3071" else "FR " + v["name"],
                   "description": "FR " + v["description"]} for k, v in EN["data"].items()}}
BIN = {
    "Items/3006": {"mItemGroups": ["Items/ItemGroups/Default", "Items/ItemGroups/Boots"], "epicness": 4},
    "Items/3071": {"mItemGroups": ["Items/ItemGroups/Default", "{24adb712}"], "epicness": 5},
    "Items/ItemGroups/Boots": {"__type": "ItemGroup", "mMaxGroupOwnable": 1},
    "{24adb712}": {"__type": "ItemGroup", "mMaxGroupOwnable": 1},
    "{deadbeef}": {"__type": "ItemGroup", "mMaxGroupOwnable": 1},
    "Items/ItemGroups/Default": {"__type": "ItemGroup"},
}


class BuildItems(unittest.TestCase):
    def setUp(self):
        self.items, self.groups, self.report = build_items(EN, FR, BIN)

    def test_keeps_rift_purchasable_items(self):
        self.assertIn("1036", self.items)
        self.assertEqual(self.items["1036"]["stats"], {"ad": 10})
        self.assertEqual(self.items["1036"]["into"], ["3071"])
        self.assertEqual(self.items["3071"]["from"], ["1036"])
        self.assertEqual(self.items["3071"]["gold"], {"total": 3000, "base": 3000})

    def test_drops_consumables_trinkets_other_maps_and_ally_only(self):
        for gone in ("2003", "3340", "9999", "7777", "8888", "323107"):
            self.assertNotIn(gone, self.items)

    def test_groups_and_boots(self):
        self.assertEqual(self.items["3006"]["groups"], ["Boots"])
        self.assertTrue(self.items["3006"]["boots"])
        self.assertFalse(self.items["1036"]["boots"])
        self.assertEqual(self.groups, {"Boots": 1, "{24adb712}": 1})

    def test_tier_names_and_required_champion(self):
        self.assertEqual(self.items["3071"]["tier"], 5)
        self.assertIsNone(self.items["1036"]["tier"])
        self.assertEqual(self.items["3071"]["name"], {"en": "Black Cleaver", "fr": "Couperet noir"})
        self.assertEqual(self.items["3071"]["desc"]["fr"], "FR " + CLEAVER)
        self.assertEqual(self.items["3599"]["requiredChampion"], "Kalista")
        self.assertIsNone(self.items["1036"]["requiredChampion"])

    def test_report_lists_unknown_stats_and_stat_object_mismatch(self):
        text = "\n".join(self.report)
        self.assertIn("unknown stat 'Foo Bar' in item 6666", text)
        self.assertIn("stats mismatch: item 5555", text)
        self.assertNotIn("stats mismatch: item 3006", text)
        self.assertIn("possible stat passive: 4444", text)
        self.assertIn("possible stat passive: 4633", text)
        self.assertNotIn("possible stat passive: 3071", text)


RR_EN = [{"id": 8100, "key": "Domination", "name": "Domination", "slots": [
    {"runes": [{"id": 8112, "name": "Electrocute", "longDesc": "L", "shortDesc": "S"}]},
    {"runes": [{"id": 8126, "name": "Cheap Shot", "longDesc": "L2", "shortDesc": "S2"}]}]}]
RR_FR = [{"id": 8100, "key": "Domination", "name": "Domination FR", "slots": [
    {"runes": [{"id": 8112, "name": "Électrocution", "longDesc": "LF", "shortDesc": "SF"}]},
    {"runes": [{"id": 8126, "name": "Coup bas", "longDesc": "L2F", "shortDesc": "S2F"}]}]}]


class BuildRunes(unittest.TestCase):
    def test_build_runes(self):
        runes = build_runes(RR_EN, RR_FR)
        self.assertEqual(runes["trees"], [{"id": 8100, "key": "Domination",
                                           "name": {"en": "Domination", "fr": "Domination FR"},
                                           "slots": [[8112], [8126]]}])
        self.assertEqual(runes["byId"]["8112"], {"id": 8112, "name": {"en": "Electrocute", "fr": "Électrocution"},
                                                 "desc": {"en": "L", "fr": "LF"}, "tree": 8100, "row": 0})
        self.assertEqual(runes["byId"]["8126"]["row"], 1)


def _champ(cid, name, title):
    return {"id": cid, "key": "1", "name": name, "title": title, "partype": "Mana", "stats": {
        "hp": 560, "hpperlevel": 96, "mp": 418, "mpperlevel": 25, "movespeed": 335, "armor": 19,
        "armorperlevel": 4.7, "spellblock": 30, "spellblockperlevel": 1.3, "attackrange": 625,
        "hpregen": 5.5, "hpregenperlevel": 0.55, "mpregen": 8, "mpregenperlevel": 0.8, "crit": 0,
        "critperlevel": 0, "attackdamage": 50, "attackdamageperlevel": 2.65, "attackspeedperlevel": 1.36,
        "attackspeed": 0.61}}


DD_CH = {"data": {"Annie": _champ("Annie", "Annie", "the Dark Child"), "Zed": _champ("Zed", "Zed", "the Master")}}
DD_CH_FR = {"data": {"Annie": _champ("Annie", "Annie", "l'Enfant obscur"), "Zed": _champ("Zed", "Zed", "le Maître")}}
RECORDS = {"Annie": {"attackSpeedRatioModifiable": {"baseValue": 0.625},
                     "mAdaptiveForceToAbilityPowerWeight": 1.0},
           "Zed": None}


class BuildChampions(unittest.TestCase):
    def setUp(self):
        self.champs, self.report = build_champions(DD_CH, DD_CH_FR, RECORDS)

    def test_champion_base_and_ratio(self):
        c = self.champs["Annie"]
        self.assertEqual(c["base"]["asratio"], 0.625)
        self.assertTrue(c["adaptiveAP"])
        self.assertEqual(c["base"]["mr"], 30)
        self.assertEqual(c["base"]["ad"], 50)
        self.assertEqual(c["base"]["as"], 0.61)
        self.assertEqual(c["base"]["asperlevel"], 1.36)
        self.assertEqual(c["base"]["ms"], 335)
        self.assertEqual(c["title"], {"en": "the Dark Child", "fr": "l'Enfant obscur"})
        self.assertEqual(c["resource"], "Mana")
        self.assertEqual(c["flags"], [])

    def test_missing_record_falls_back_and_flags(self):
        c = self.champs["Zed"]
        self.assertEqual(c["base"]["asratio"], 0.61)
        self.assertFalse(c["adaptiveAP"])
        self.assertIn("no_cdragon_record", c["flags"])
        self.assertTrue(any("Zed" in line for line in self.report))


class DiffPatches(unittest.TestCase):
    def test_diff_lists_changed_new_removed(self):
        self.assertEqual(diff_patches({"items": {"1": {"stats": {"ad": 10}}, "3": {}}, "champions": {}},
                                      {"items": {"1": {"stats": {"ad": 12}}, "2": {}}, "champions": {}}),
                         ["changed item 1", "new item 2", "removed item 3"])



class DiffRunes(unittest.TestCase):
    def test_diff_includes_runes(self):
        old = {"items": {}, "champions": {}, "runes": {"byId": {"8010": {"desc": {"en": "1.8-4"}}}}}
        new = {"items": {}, "champions": {}, "runes": {"byId": {"8010": {"desc": {"en": "2-4"}}}}}
        self.assertEqual(diff_patches(old, new), ["changed rune 8010"])



def _calc(*parts, **extra):
    return {"mFormulaParts": list(parts), "__type": "GameCalculation", **extra}


class NormalizeCalc(unittest.TestCase):
    def test_annie_q(self):
        calc = _calc({"mDataValue": "BaseDamage", "__type": "NamedDataValueCalculationPart"},
                     {"mDataValue": "APRatio", "__type": "StatByNamedDataValueCalculationPart"})
        self.assertEqual(normalize_calc(calc), {"parts": [
            {"t": "v", "name": "BaseDamage"},
            {"t": "stat", "stat": "ap", "basis": "total", "coef": {"t": "v", "name": "APRatio"}}],
            "pct": False, "mult": None, "flags": []})

    def test_bonus_ad_coefficient(self):
        part = {"mStat": 2, "mStatFormula": 2, "mCoefficient": 1.5, "__type": "StatByCoefficientCalculationPart"}
        self.assertEqual(normalize_calc(_calc(part))["parts"],
                         [{"t": "stat", "stat": "ad", "basis": "bonus", "coef": {"t": "n", "n": 1.5}}])

    def test_max_health_code_12(self):
        part = {"mStat": 12, "mCoefficient": 0.1, "__type": "StatByCoefficientCalculationPart"}
        self.assertEqual(normalize_calc(_calc(part))["parts"][0]["stat"], "hp")

    def test_level_breakpoints(self):
        part = {"mLevel1Value": 10.0, "mBreakpoints": [
            {"mLevel": 7, "mAdditionalBonusAtThisLevel": 5.0, "__type": "Breakpoint"},
            {"mLevel": 13, "mAdditionalBonusAtThisLevel": 5.0, "__type": "Breakpoint"}],
            "__type": "ByCharLevelBreakpointsCalculationPart"}
        self.assertEqual(normalize_calc(_calc(part))["parts"], [{"t": "lvlBp", "start": 10, "bps": [[7, 5], [13, 5]]}])

    def test_breakpoint_bonus_per_level(self):
        part = {"mLevel1Value": 10.0, "mBreakpoints": [{"mLevel": 2, "mBonusPerLevelAtAndAfter": 3.0, "__type": "Breakpoint"}],
                "__type": "ByCharLevelBreakpointsCalculationPart"}
        self.assertEqual(normalize_calc(_calc(part))["parts"], [{"t": "lvlBp", "start": 10, "bps": [[2, 0, 3]]}])

    def test_breakpoint_with_unknown_key_is_unsupported(self):
        part = {"mLevel1Value": 10.0, "mBreakpoints": [{"mLevel": 7, "{02deb550}": 1.0, "__type": "Breakpoint"}],
                "__type": "ByCharLevelBreakpointsCalculationPart"}
        self.assertEqual(normalize_calc(_calc(part))["parts"][0]["t"], "x")

    def test_level_interpolation(self):
        part = {"mStartValue": 40.0, "mEndValue": 210.0, "__type": "ByCharLevelInterpolationCalculationPart"}
        self.assertEqual(normalize_calc(_calc(part))["parts"], [{"t": "lvlLerp", "a": 40, "b": 210}])

    def test_sum_product_ref(self):
        part = {"mSubparts": [{"mNumber": 1.0, "__type": "NumberCalculationPart"},
                              {"mPart1": {"mDataValue": "Ratio", "__type": "NamedDataValueCalculationPart"},
                               "mPart2": {"mSpellCalculationKey": "MaxHPDamage", "__type": "{f3cbe7b2}"},
                               "__type": "ProductOfSubPartsCalculationPart"}],
                "__type": "SumOfSubPartsCalculationPart"}
        self.assertEqual(normalize_calc(_calc(part))["parts"], [{"t": "sum", "parts": [
            {"t": "n", "n": 1}, {"t": "prod", "a": {"t": "v", "name": "Ratio"}, "b": {"t": "ref", "name": "MaxHPDamage"}}]}])

    def test_stat_of_subpart(self):
        part = {"mStat": 12, "mSubpart": {"mSpellCalculationKey": "Pct", "__type": "{f3cbe7b2}"},
                "__type": "StatBySubPartCalculationPart"}
        self.assertEqual(normalize_calc(_calc(part))["parts"],
                         [{"t": "statOf", "stat": "hp", "basis": "total", "part": {"t": "ref", "name": "Pct"}}])

    def test_modified_and_conditional(self):
        mod = {"mMultiplier": {"mDataValue": "Mult", "__type": "NamedDataValueCalculationPart"},
               "mModifiedGameCalculation": "Base", "__type": "GameCalculationModified"}
        self.assertEqual(normalize_calc(mod), {"parts": [{"t": "ref", "name": "Base"}], "pct": False,
                                               "mult": {"t": "v", "name": "Mult"}, "flags": []})
        cond = {"mDefaultGameCalculation": "Plain", "mConditionalGameCalculation": "Empowered",
                "__type": "GameCalculationConditional"}
        self.assertEqual(normalize_calc(cond), {"parts": [{"t": "ref", "name": "Plain"}], "pct": False,
                                                "mult": None, "flags": ["conditional"]})

    def test_game_calculation_multiplier(self):
        calc = _calc({"mNumber": 2.0, "__type": "NumberCalculationPart"},
                     mMultiplier={"mNumber": 3.0, "__type": "NumberCalculationPart"})
        self.assertEqual(normalize_calc(calc)["mult"], {"t": "n", "n": 3})

    def test_unknown_part_and_stat_are_unsupported(self):
        self.assertEqual(normalize_calc(_calc({"mBuffName": "x", "__type": "BuffCounterByCoefficientCalculationPart"}))["parts"],
                         [{"t": "x", "what": "BuffCounterByCoefficientCalculationPart"}])
        self.assertEqual(normalize_calc(_calc({"mStat": 15, "mCoefficient": 1.0, "__type": "StatByCoefficientCalculationPart"}))["parts"],
                         [{"t": "x", "what": "mStat 15"}])

    def test_missing_fields_are_unsupported_not_errors(self):
        self.assertEqual(normalize_calc({"__type": "GameCalculationConditional"})["parts"][0]["t"], "x")
        self.assertEqual(normalize_calc({"__type": "GameCalculationModified"})["parts"][0]["t"], "x")
        self.assertEqual(normalize_calc(_calc({"__type": "NamedDataValueCalculationPart"}))["parts"][0]["t"], "x")
        self.assertEqual(normalize_calc(_calc({"__type": "ProductOfSubPartsCalculationPart"}))["parts"][0]["t"], "x")

    def test_percent_display(self):
        calc = _calc({"mDataValue": "MaxHealthRatio", "__type": "NamedDataValueCalculationPart"}, mDisplayAsPercent=True)
        self.assertTrue(normalize_calc(calc)["pct"])



class ParseDamageLines(unittest.TestCase):
    def test_annie_q_line(self):
        lines, flags = parse_damage_lines("deals <magicDamage>{{ totaldamage }} magic damage</magicDamage>.", {"TotalDamage"}, set())
        self.assertEqual(lines, [{"type": "magic", "terms": [{"calc": "TotalDamage", "kind": "flat"}]}])
        self.assertEqual(flags, [])

    def test_garen_r_value_terms_and_missing_health(self):
        t = "dealing <trueDamage>{{ basedamage }} plus {{ executedamage*100 }}% missing Health true damage</trueDamage>."
        lines, _ = parse_damage_lines(t, set(), {"BaseDamage", "ExecuteDamage"})
        self.assertEqual(lines[0]["terms"], [{"value": "BaseDamage", "kind": "flat"},
                                             {"value": "ExecuteDamage", "kind": "targetMissing", "mult": 100, "percent": True}])
        self.assertEqual(lines[0]["type"], "true")

    def test_vayne_w_max_health(self):
        lines, _ = parse_damage_lines("<trueDamage>{{ totaldamage }} max Health true damage</trueDamage>", {"TotalDamage"}, set())
        self.assertEqual(lines[0]["terms"][0]["kind"], "targetMax")

    def test_string_table_placeholders(self):
        lines, _ = parse_damage_lines("<magicDamage>@TotalDamage@ magic damage</magicDamage>", {"TotalDamage"}, set())
        self.assertEqual(lines, [{"type": "magic", "terms": [{"calc": "TotalDamage", "kind": "flat"}]}])

    def test_current_health(self):
        lines, _ = parse_damage_lines("<physicalDamage>{{ pct }}% current Health physical damage</physicalDamage>", set(), {"Pct"})
        self.assertEqual(lines[0]["terms"], [{"value": "Pct", "kind": "targetCurrent", "percent": True}])

    def test_unresolved_placeholder_flags(self):
        lines, flags = parse_damage_lines("<physicalDamage>{{ mystery }} physical damage</physicalDamage>", set(), set())
        self.assertEqual(lines, [])
        self.assertEqual(flags, ["unparsed_tooltip"])

    def test_no_damage_tags_no_flag(self):
        self.assertEqual(parse_damage_lines("Grants <speed>{{ ms }}% Move Speed</speed>.", set(), {"MS"}), ([], []))

    def test_multi_hit_lines_marked_per_hit(self):
        lines, _ = parse_damage_lines("deals <physicalDamage>{{ totaldamage }} physical damage</physicalDamage> {{ f1 }} times over the duration",
                                      {"TotalDamage"}, set())
        self.assertTrue(lines[0]["perHit"])
        lines, _ = parse_damage_lines("deals <magicDamage>{{ totaldamage }} magic damage</magicDamage> to enemies each bounce.",
                                      {"TotalDamage"}, set())
        self.assertTrue(lines[0]["perHit"])
        lines, _ = parse_damage_lines("deals <magicDamage>{{ totaldamage }} magic damage</magicDamage> to the first enemy hit.",
                                      {"TotalDamage"}, set())
        self.assertNotIn("perHit", lines[0])

    # Final-review fixes.
    def test_cross_spell_placeholder_is_flagged(self):
        lines, flags = parse_damage_lines("<physicalDamage>{{ spell.khazixq:basedamage }} physical damage</physicalDamage>", set(), set())
        self.assertEqual((lines, flags), ([], ["unparsed_tooltip"]))

    def test_percent_sign_means_percent_value(self):
        lines, _ = parse_damage_lines("<magicDamage>{{ healthdamage }}% max Health magic damage</magicDamage>", set(), {"HealthDamage"})
        self.assertEqual(lines[0]["terms"], [{"value": "HealthDamage", "kind": "targetMax", "percent": True}])

    def test_times_100_means_fraction_and_multiplier_kept(self):
        lines, _ = parse_damage_lines("<trueDamage>{{ executedamage*100 }}% missing Health true damage</trueDamage>", set(), {"ExecuteDamage"})
        self.assertEqual(lines[0]["terms"], [{"value": "ExecuteDamage", "kind": "targetMissing", "mult": 100, "percent": True}])
        lines, _ = parse_damage_lines("<physicalDamage>{{ basedamage*0.5 }} physical damage</physicalDamage>", set(), {"BaseDamage"})
        self.assertEqual(lines[0]["terms"], [{"value": "BaseDamage", "kind": "flat", "mult": 0.5}])

    def test_hyphenated_missing_health(self):
        lines, _ = parse_damage_lines("<trueDamage>{{ x }}% missing-Health true damage</trueDamage>", set(), {"X"})
        self.assertEqual(lines[0]["terms"][0]["kind"], "targetMissing")

    def test_percent_of_other_base_is_unsupported(self):
        for text in ("{{ x }}% of the grabbed enemy's bonus Health physical damage", "{{ x }}% damage",
                     "{{ x }}% per 1% missing Health magic damage"):
            lines, _ = parse_damage_lines(f"<magicDamage>{text}</magicDamage>", set(), {"X"})
            self.assertEqual(lines[0]["terms"][0]["kind"], "unsupported", text)

    def test_non_damage_segments_are_skipped(self):
        for text in ("<physicalDamage>{{ x }} bonus Attack Damage</physicalDamage>", "<magicDamage>{{ x }} Mana</magicDamage>",
                     "<magicDamage>{{ x }}% increased damage</magicDamage>"):
            self.assertEqual(parse_damage_lines(text, set(), {"X"}), ([], []), text)

    def test_minion_and_monster_segments_are_skipped(self):
        t = ("bites a monster or minion, dealing <trueDamage>{{ m }} true damage</trueDamage>, "
             "or a champion, dealing <magicDamage>{{ c }} magic damage</magicDamage>.")
        lines, _ = parse_damage_lines(t, set(), {"M", "C"})
        self.assertEqual([l["terms"][0]["value"] for l in lines], ["C"])
        lines, _ = parse_damage_lines("deals <physicalDamage>{{ m }} physical damage</physicalDamage> to minions", set(), {"M"})
        self.assertEqual(lines, [])

    def test_minion_only_said_later_in_the_sentence(self):
        t = ("dealing <trueDamage>{{ m }} true damage</trueDamage> and restoring Health when used against a minion or "
             "jungle monster. Against a champion, it deals <magicDamage>{{ c }} magic damage</magicDamage>.")
        lines, _ = parse_damage_lines(t, set(), {"M", "C"})
        self.assertEqual([l["terms"][0]["value"] for l in lines], ["C"])

    def test_minion_only_with_markup_in_between(self):
        t = ("dealing <trueDamage>{{ monsterminiondamage }} true damage</trueDamage> and restoring <healing>{{ monsterhealing }} "
             "Health</healing> when used against a minion or jungle monster. Against a champion, it instead deals "
             "<magicDamage>{{ totalchampiondamage }} magic damage</magicDamage>.")
        lines, _ = parse_damage_lines(t, set(), {"MonsterMinionDamage", "TotalChampionDamage"})
        self.assertEqual([l["terms"][0]["value"] for l in lines], ["TotalChampionDamage"])

    def test_damage_that_varies_with_missing_health_is_marked(self):
        t = "deals between <physicalDamage>{{ maxdamage }} physical damage</physicalDamage>, based on their missing Health."
        self.assertTrue(parse_damage_lines(t, set(), {"MaxDamage"})[0][0]["varies"])
        t = "deals <physicalDamage>{{ d }} physical damage</physicalDamage>, increased by up to 60% based on his missing Health."
        self.assertTrue(parse_damage_lines(t, set(), {"D"})[0][0]["varies"])

    def test_duplicate_lines_kept_once(self):
        t = "<magicDamage>{{ d }} magic damage</magicDamage> then <magicDamage>{{ d }} magic damage</magicDamage>"
        self.assertEqual(len(parse_damage_lines(t, {"D"}, set())[0]), 1)


def _dd_spell(sid, tooltip, maxrank=5):
    return {"id": sid, "name": sid + " name", "tooltip": tooltip, "maxrank": maxrank}


DD_ANNIE = {"id": "Annie", "passive": {"name": "Pyromania"}, "spells": [
    _dd_spell("AnnieQ", "<magicDamage>{{ totaldamage }} magic damage</magicDamage>"),
    _dd_spell("AnnieW", "<magicDamage>{{ basedamage }} magic damage</magicDamage>"),
    _dd_spell("AnnieE", "Shield"), _dd_spell("AnnieR", "<magicDamage>{{ x }} magic damage</magicDamage>", 3)]}
DD_ANNIE_FR = {**DD_ANNIE, "passive": {"name": "Pyromanie"},
               "spells": [{**s, "name": s["name"] + " fr"} for s in DD_ANNIE["spells"]]}
ANNIE_BIN = {
    "Characters/Annie/Spells/AnnieQAbility/AnnieQ": {"mSpell": {
        "DataValues": [{"name": "BaseDamage", "values": [35, 80, 125]}, {"name": "APRatio", "values": [0.8, 0.8, 0.8]},
                       {"name": "Unused", "values": [1, 2, 3]}],
        "mSpellCalculations": {"TotalDamage": _calc({"mDataValue": "BaseDamage", "__type": "NamedDataValueCalculationPart"},
                                                    {"mDataValue": "APRatio", "__type": "StatByNamedDataValueCalculationPart"}),
                               "Other": _calc({"mNumber": 1.0, "__type": "NumberCalculationPart"})}}},
    "Characters/Annie/Spells/AnnieWAbility/AnnieW": {"mSpell": {"mDataValues": [{"mName": "BaseDamage", "mValues": [0, 70, 115]}]}},
    "Characters/Annie/Spells/AnniePassiveAbility/AnniePassive": {"mSpell": {"DataValues": [{"name": "StunDuration", "values": [1.25]}]}},
}
ANNIE_RECORD = {"spellNames": ["AnnieQAbility/AnnieQ", "AnnieWAbility/AnnieW", "AnnieEAbility/AnnieE", "AnnieRAbility/AnnieR"],
                "mCharacterPassiveSpell": "Characters/Annie/Spells/AnniePassiveAbility/AnniePassive"}
STRINGS = {"spell_anniepassive_tooltip": "Stuns for @StunDuration@ seconds."}


class BuildSpells(unittest.TestCase):
    def setUp(self):
        self.spells = build_spells(DD_ANNIE, DD_ANNIE_FR, ANNIE_BIN, ANNIE_RECORD, STRINGS)

    def test_order_ranks_and_names(self):
        self.assertEqual([s["key"] for s in self.spells], ["P", "Q", "W", "E", "R"])
        self.assertEqual(self.spells[0]["maxrank"], 1)
        self.assertEqual(self.spells[0]["name"], {"en": "Pyromania", "fr": "Pyromanie"})
        self.assertEqual(self.spells[1]["maxrank"], 5)
        self.assertEqual(self.spells[1]["name"], {"en": "AnnieQ name", "fr": "AnnieQ name fr"})

    def test_q_lines_calcs_and_trimmed_values(self):
        q = self.spells[1]
        self.assertEqual(q["lines"], [{"type": "magic", "terms": [{"calc": "TotalDamage", "kind": "flat"}]}])
        self.assertEqual(sorted(q["calcs"]), ["TotalDamage"])
        self.assertEqual(sorted(q["values"]), ["APRatio", "BaseDamage"])
        self.assertEqual(q["values"]["BaseDamage"][1], 80)

    def test_m_prefixed_data_values(self):
        self.assertEqual(self.spells[2]["lines"][0]["terms"], [{"value": "BaseDamage", "kind": "flat"}])
        self.assertEqual(self.spells[2]["values"]["BaseDamage"], [0, 70, 115])

    def test_missing_bin_spell_and_unparsed_flags(self):
        self.assertIn("no_cdragon_spell", self.spells[3]["flags"])
        self.assertIn("unparsed_tooltip", self.spells[4]["flags"])

    def test_passive_from_strings_without_damage(self):
        self.assertEqual(self.spells[0]["lines"], [])
        self.assertEqual(self.spells[0]["flags"], [])

    def test_passive_without_tooltip_flags(self):
        spells = build_spells(DD_ANNIE, DD_ANNIE_FR, ANNIE_BIN, ANNIE_RECORD, {})
        self.assertIn("no_tooltip", spells[0]["flags"])

    def test_string_reference_resolved(self):
        strings = {"spell_anniepassive_tooltip": "{{Spell_Inner}}", "spell_inner": "<magicDamage>@StunDuration@ magic damage</magicDamage>"}
        spells = build_spells(DD_ANNIE, DD_ANNIE_FR, ANNIE_BIN, ANNIE_RECORD, strings)
        self.assertEqual(spells[0]["lines"][0]["terms"], [{"value": "StunDuration", "kind": "flat"}])

    def test_skill_rank_flags(self):
        self.assertEqual(skill_rank_flags(self.spells), [])
        self.assertEqual(skill_rank_flags([{"key": "Q", "maxrank": 6}, {"key": "R", "maxrank": 3}]), ["custom_skill_ranks"])


if __name__ == "__main__":
    unittest.main()
