import unittest

from prep import attach_positions, build_summoners, change_details, parse_item_stats, build_items, build_runes, build_champions, diff_patches, normalize_calc, parse_damage_lines, build_spells, skill_rank_flags, passive_stat_words, parse_heal_lines, level_up, shown_damage, normalize_part, _one_spell

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

    def test_plaintext_in_both_languages(self):
        en = {"data": {**EN["data"], "3071": {**EN["data"]["3071"], "plaintext": "Shields against large bursts of damage"}}}
        fr = {"data": {**FR["data"], "3071": {**FR["data"]["3071"], "plaintext": "Protège contre les gros bursts de dégâts."}}}
        items, _, _ = build_items(en, fr, BIN)
        self.assertEqual(items["3071"]["plaintext"], {"en": "Shields against large bursts of damage",
                                                      "fr": "Protège contre les gros bursts de dégâts."})
        self.assertEqual(items["1036"]["plaintext"], {"en": "", "fr": ""})

    def test_report_lists_unknown_stats_and_stat_object_mismatch(self):
        text = "\n".join(self.report)
        self.assertIn("unknown stat 'Foo Bar' in item 6666", text)
        self.assertIn("stats mismatch: item 5555", text)
        self.assertNotIn("stats mismatch: item 3006", text)
        self.assertIn("possible stat passive: 4444", text)
        self.assertIn("possible stat passive: 4633", text)
        self.assertNotIn("possible stat passive: 3071", text)


RR_EN = [{"id": 8100, "key": "Domination", "name": "Domination", "icon": "perk-images/Styles/7200_Domination.png", "slots": [
    {"runes": [{"id": 8112, "name": "Electrocute", "longDesc": "L", "shortDesc": "S", "icon": "perk-images/E.png"}]},
    {"runes": [{"id": 8126, "name": "Cheap Shot", "longDesc": "L2", "shortDesc": "S2"}]}]}]
RR_FR = [{"id": 8100, "key": "Domination", "name": "Domination FR", "slots": [
    {"runes": [{"id": 8112, "name": "Électrocution", "longDesc": "LF", "shortDesc": "SF"}]},
    {"runes": [{"id": 8126, "name": "Coup bas", "longDesc": "L2F", "shortDesc": "S2F"}]}]}]


class BuildRunes(unittest.TestCase):
    def test_build_runes(self):
        runes = build_runes(RR_EN, RR_FR)
        self.assertEqual(runes["trees"], [{"id": 8100, "key": "Domination",
                                           "name": {"en": "Domination", "fr": "Domination FR"},
                                           "icon": "perk-images/Styles/7200_Domination.png", "slots": [[8112], [8126]]}])
        self.assertEqual(runes["byId"]["8112"], {"id": 8112, "name": {"en": "Electrocute", "fr": "Électrocution"},
                                                 "desc": {"en": "L", "fr": "LF"}, "short": {"en": "S", "fr": "SF"},
                                                 "icon": "perk-images/E.png", "tree": 8100, "row": 0})
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
                     "mAdaptiveForceToAbilityPowerWeight": 1.0,
                     "damagePerLevelModifiable": {"baseValue": 3.4000000953674316},
                     "baseStaticHPRegenModifiable": {"baseValue": 1.1}},
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

    def test_base_stats_from_game_files_when_present(self):
        b = self.champs["Annie"]["base"]
        self.assertEqual(b["adperlevel"], 3.4)  # Data Dragon says 2.65
        self.assertEqual(b["hpregen"], 5.5)  # game files: per second, x5
        self.assertEqual(b["armorperlevel"], 4.7)  # key absent from game files: Data Dragon kept
        self.assertTrue(any("adperlevel" in line and "Annie" in line for line in self.report))
        self.assertFalse(any("hpregen" in line for line in self.report))

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
        self.assertEqual(normalize_calc(_calc({"mFoo": "x", "__type": "SomeNewCalculationPart"}))["parts"],
                         [{"t": "x", "what": "SomeNewCalculationPart"}])
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

    def test_minion_reduction_of_another_effect_keeps_the_line(self):
        tip = ("Attacks deal <magicDamage>@PDamage@ max Health magic damage</magicDamage> and restore "
               "<healing>@Heal*100@% of damage dealt as Health</healing>, reduced to @Mod*100@% against minions.")
        lines, _ = parse_damage_lines(tip, {"PDamage"}, set())
        self.assertEqual(lines[0]["terms"][0]["calc"], "PDamage")

    def test_count_after_per_and_top_of_range_are_not_damage(self):
        lines, _ = parse_damage_lines("<magicDamage>@A@ plus @B@ per @C@ Chimes magic damage</magicDamage>", set(), {"A", "B", "C"})
        self.assertEqual([t["value"] for t in lines[0]["terms"]], ["A", "B"])
        lines, _ = parse_damage_lines("<physicalDamage>@A@ to @B@ physical damage</physicalDamage>", set(), {"A", "B"})
        self.assertEqual([t["value"] for t in lines[0]["terms"]], ["A"])

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


class ParseHealLines(unittest.TestCase):
    def kinds(self, tip, names):
        lines = parse_heal_lines(tip, set(), set(names))
        return [[(t["value"], t["kind"]) for t in l["terms"]] for l in lines]

    def test_self_flat_and_ally_skipped(self):  # Alistar passive
        tip = ("Alistar roars, restoring <healing>@BaseHeal@ Health</healing> to himself and "
               "<healing>@AllyHeal@ Health</healing> to nearby allied champions.")
        self.assertEqual(self.kinds(tip, ["BaseHeal", "AllyHeal"]), [[("BaseHeal", "flat")]])

    def test_ally_only_sentence_skipped(self):
        tip = "Soraka heals an ally champion for <healing>@Heal@ Health</healing>."
        self.assertEqual(self.kinds(tip, ["Heal"]), [])

    def test_percent_of_damage_dealt(self):  # Aatrox passive, Briar passive
        tip = "and restore <healing>@PHealingRatio*100@% of damage dealt as Health</healing>"
        lines = parse_heal_lines(tip, set(), {"PHealingRatio"})
        self.assertEqual(lines[0]["terms"], [{"value": "PHealingRatio", "kind": "damageDealt", "mult": 100, "percent": True}])
        tip = "<healing>Heals Briar for @HealPercent*100@% of the pre-mitigation damage</healing>"
        self.assertEqual(self.kinds(tip, ["HealPercent"]), [[("HealPercent", "damageDealt")]])

    def test_own_max_and_missing_health(self):  # Garen passive, Illaoi passive
        self.assertEqual(self.kinds("Garen regenerates <healing>@RegenCalc@ max Health</healing> every 5 seconds",
                                    ["RegenCalc"]), [[("RegenCalc", "selfMax")]])
        self.assertEqual(self.kinds("restores <healing>@MissingHPPercentHeal*100@% missing Health</healing> to Illaoi.",
                                    ["MissingHPPercentHeal"]), [[("MissingHPPercentHeal", "selfMissing")]])

    def test_health_lost_or_paid_and_other_units_health_are_not_heals(self):
        self.assertEqual(self.kinds("instead losing <healing>@CurrentHealthLoss*100@% current Health</healing>",
                                    ["CurrentHealthLoss"]), [])  # Dr. Mundo
        self.assertEqual(self.kinds("a Grove that costs <healing>@HealthTooltip@ Health</healing>", ["HealthTooltip"]), [])
        self.assertEqual(self.kinds("he restores <healing>@RegenPercent@ of its max Health</healing>.", ["RegenPercent"]),
                         [[("RegenPercent", "unsupported")]])  # Trundle: the dead enemy's health
        self.assertEqual(self.kinds("gains up to <health>@X@%</health> increased <healing>Healing</healing>", ["X"]), [])

    def test_minion_only_and_per_second(self):
        self.assertEqual(self.kinds("restoring <healing>@MonsterHealing@ Health</healing> when used against a minion.",
                                    ["MonsterHealing"]), [])
        lines = parse_heal_lines("restores <healing>@H@ Health per second</healing>", set(), {"H"})
        self.assertTrue(lines[0]["perSecond"])


class BuildSpells(unittest.TestCase):
    def setUp(self):
        self.spells = build_spells(DD_ANNIE, DD_ANNIE_FR, ANNIE_BIN, ANNIE_RECORD, STRINGS)

    def test_order_ranks_and_names(self):
        self.assertEqual([s["key"] for s in self.spells], ["P", "Q", "W", "E", "R"])
        self.assertEqual(self.spells[0]["maxrank"], 1)
        self.assertEqual(self.spells[0]["name"], {"en": "Pyromania", "fr": "Pyromanie"})
        self.assertEqual(self.spells[1]["maxrank"], 5)
        self.assertEqual(self.spells[1]["name"], {"en": "AnnieQ name", "fr": "AnnieQ name fr"})

    def test_heal_lines_kept_with_their_values(self):
        strings = {"spell_anniepassive_tooltip": "Annie restores <healing>@StunDuration@ Health</healing>."}
        p = build_spells(DD_ANNIE, DD_ANNIE_FR, ANNIE_BIN, ANNIE_RECORD, strings)[0]
        self.assertEqual(p["heals"], [{"terms": [{"value": "StunDuration", "kind": "flat"}]}])
        self.assertEqual(self.spells[1]["heals"], [])

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

    def test_passive_tooltip_from_loc_key_and_all_calcs_kept(self):
        bin_data = {**ANNIE_BIN, "Characters/Annie/Spells/AnniePassiveAbility/AnniePassive": {"mSpell": {
            "DataValues": [{"name": "Range", "values": [0, 0]}],
            "mSpellCalculations": {"BonusRange": {"mFormulaParts": [
                {"mEndValue": 150.0, "__type": "ByCharLevelInterpolationCalculationPart"}]}},
            "mClientData": {"mTooltipData": {"mLocKeys": {"keyTooltip": "Passive_AnniePassive_Tooltip"}}}}}}
        strings = {"passive_anniepassive_tooltip": "<magicDamage>@BonusRange@ magic damage</magicDamage>"}
        p = build_spells(DD_ANNIE, DD_ANNIE_FR, bin_data, ANNIE_RECORD, strings)[0]
        self.assertEqual(p["flags"], [])
        self.assertEqual(len(p["lines"]), 1)
        self.assertEqual(p["calcs"]["BonusRange"]["parts"], [{"t": "lvlLerp", "a": 0, "b": 150}])
        self.assertIn("Range", p["values"])

    def test_passive_stat_words(self):
        self.assertTrue(passive_stat_words("Tristana's Attack Range is increased by @X@."))
        self.assertTrue(passive_stat_words("Rammus gains <scaleAD>@T@ Attack Damage</scaleAD>."))
        self.assertFalse(passive_stat_words("Attacks deal <magicDamage>@D@ max Health magic damage</magicDamage>."))
        self.assertFalse(passive_stat_words("Annie stuns."))

    def test_skill_rank_flags(self):
        self.assertEqual(skill_rank_flags(self.spells), [])
        self.assertEqual(skill_rank_flags([{"key": "Q", "maxrank": 6}, {"key": "R", "maxrank": 3}]), ["custom_skill_ranks"])



class AttachPositionsTest(unittest.TestCase):
    def test_positions_and_missing(self):
        champs = {"Garen": {}, "Newbie": {}}
        missing = attach_positions(champs, {"Garen": {"positions": ["TOP", "ODD"]}})
        self.assertEqual(champs["Garen"]["positions"], ["TOP"])
        self.assertEqual(champs["Newbie"]["positions"], [])
        self.assertEqual(missing, ["Newbie"])



class SummonersAndChangesTest(unittest.TestCase):
    def test_summoners_keep_rift_spells(self):
        en = {"data": {"SummonerFlash": {"name": "Flash", "description": "Blink.", "cooldownBurn": "300", "modes": ["CLASSIC", "ARAM"],
                                         "image": {"full": "SummonerFlash.png"}, "summonerLevel": 7},
                       "SummonerSnowball": {"name": "Mark", "description": "x", "modes": ["ARAM"], "image": {"full": "x.png"}}}}
        fr = {"data": {"SummonerFlash": {"name": "Saut éclair", "description": "Saute."}}}
        out = build_summoners(en, fr)
        self.assertEqual(list(out), ["SummonerFlash"])
        self.assertEqual(out["SummonerFlash"]["name"], {"en": "Flash", "fr": "Saut éclair"})
        self.assertEqual(out["SummonerFlash"]["cooldown"], "300")

    def test_change_details(self):
        old = {"champions": {"Jinx": {"base": {"ad": 59, "hp": 630}, "spells": [{"key": "Q", "cooldown": "1", "values": {"a": [1]}}]}},
               "items": {"1": {"stats": {"ad": 10}, "gold": {"total": 350}, "desc": "d"}}, "runes": {"byId": {"8": {"desc": "a"}}}}
        new = {"champions": {"Jinx": {"base": {"ad": 62, "hp": 630}, "spells": [{"key": "Q", "cooldown": "0.9", "values": {"a": [2]}}]}},
               "items": {"1": {"stats": {"ad": 12}, "gold": {"total": 350}, "desc": "d"}}, "runes": {"byId": {"8": {"desc": "b"}}}}
        ch = {(c["kind"], c["id"]): c["changes"] for c in change_details(old, new)}
        self.assertEqual(ch[("champion", "Jinx")], [["base.ad", 59, 62], ["Q.cooldown", "1", "0.9"], ["Q.details", None, None]])
        self.assertEqual(ch[("item", "1")], [["stat.ad", 10, 12]])
        self.assertEqual(ch[("rune", "8")], [["desc", None, None]])
        self.assertEqual(change_details(new, new), [])

    def test_meraki_ratings(self):
        champs = {"Ahri": {}}
        attach_positions(champs, {"Ahri": {"positions": ["MIDDLE"], "attributeRatings": {"damage": 3, "toughness": 1, "abilityReliance": 100}}})
        self.assertEqual(champs["Ahri"]["ratings"], {"damage": 3, "toughness": 1})



class LevelUp(unittest.TestCase):
    EN = {"leveltip": {"label": ["Move Speed", "Damage", "@AbilityResourceName@ Cost", "Range", "Shield"],
                       "effect": ["{{ basemovespeed*100.000000 }}% -> {{ basemovespeednl*100.000000 }}%",
                                  "{{ basedamage }} -> {{ basedamageNL }}", "{{ cost }} -> {{ costNL }}",
                                  "{{ castrange }} -> {{ castrangeNL }}", "{{ ShieldBase }} -> {{ shieldbaseNL }}"]}}
    FR = {"leveltip": {"label": ["Vitesse de déplacement", "Dégâts", "Coût en @AbilityResourceName@", "Portée", "Bouclier"]}}
    VALUES = {"BaseMoveSpeed": [0, 0.25, 0.31, 0.37], "BaseDamage": [0, 10, 20, 30], "ShieldBase": [0, 45, 65, 85]}

    def test_rows_per_rank_with_labels_and_percent(self):
        rows = level_up(self.EN, self.FR, self.VALUES, {"basedamage"}, 3)
        self.assertEqual(rows, [
            {"label": {"en": "Move Speed", "fr": "Vitesse de déplacement"}, "values": [25, 31, 37], "pct": True},
            {"label": {"en": "Shield", "fr": "Bouclier"}, "values": [45, 65, 85], "pct": False}])

    def test_labels_lose_markup(self):
        en = {"leveltip": {"label": ["<spellName>Fiery</spellName> Damage"], "effect": ["{{ ShieldBase }} -> {{ x }}"]}}
        fr = {"leveltip": {"label": ["Dégâts de <spellName>Feu</spellName>"]}}
        self.assertEqual(level_up(en, fr, self.VALUES, set(), 3)[0]["label"], {"en": "Fiery Damage", "fr": "Dégâts de Feu"})

    def test_no_leveltip(self):
        self.assertEqual(level_up({}, {}, self.VALUES, set(), 3), [])



class ShownDamage(unittest.TestCase):
    """Level-up rows that repeat the table's damage row (line 0) are left out; other lines' rows stay."""
    SPELL = {"lines": [{"type": "magic", "terms": [{"calc": "Max", "kind": "flat"}]},
                       {"type": "magic", "terms": [{"value": "Second", "kind": "flat"}]}],
             "calcs": {"Max": {"parts": [{"t": "ref", "name": "Min"}], "mult": {"t": "n", "n": 3}, "pct": False, "flags": []},
                       "Min": {"parts": [{"t": "v", "name": "MinBase"},
                                         {"t": "stat", "stat": "ap", "basis": "total", "coef": {"t": "n", "n": 0.3}}],
                               "mult": None, "pct": False, "flags": []}},
             "values": {"MinBase": [0, 20, 30, 40], "Second": [0, 5, 6, 7]}}

    def test_names_and_flat_base_of_line_zero_only(self):
        self.assertEqual(shown_damage(self.SPELL, 3), ({"max", "min", "minbase"}, [60, 90, 120]))

    def test_unreadable_line_zero_hides_nothing(self):
        spell = {**self.SPELL, "calcs": {**self.SPELL["calcs"], "Min": {"parts": [{"t": "x", "what": "Odd"}],
                                                                          "mult": None, "pct": False, "flags": []}}}
        self.assertEqual(shown_damage(spell, 3), (set(), None))

    def test_level_up_skips_rows_equal_to_the_damage_row(self):
        en = {"leveltip": {"label": ["Maximum Damage", "Second Hit"],
                           "effect": ["{{ maxbase }} -> {{ x }}", "{{ second }} -> {{ x }}"]}}
        values = {"MaxBase": [0, 60, 90, 120], "Second": [0, 5, 6, 7]}
        names, base = shown_damage(self.SPELL, 3)
        rows = level_up(en, {}, values, names, 3, base)
        self.assertEqual([r["label"]["en"] for r in rows], ["Second Hit"])

    def test_equal_numbers_that_are_not_damage_stay(self):
        en = {"leveltip": {"label": ["Shield Amount"], "effect": ["{{ shield }} -> {{ x }}"]}}
        rows = level_up(en, {}, {"Shield": [0, 60, 90, 120]}, set(), 3, [60, 90, 120])
        self.assertEqual([r["label"]["en"] for r in rows], ["Shield Amount"])



class MoreFormulaParts(unittest.TestCase):
    """Formula parts the engine reads since 2026-11-25 (they were 'unreadable')."""

    def test_level_table(self):
        part = {"values": [20.0, 30.0, 40.0], "__type": "ByCharLevelFormulaCalculationPart"}
        self.assertEqual(normalize_part(part), {"t": "lvlTable", "values": [20, 30, 40]})

    def test_effect_value_and_mana(self):
        self.assertEqual(normalize_part({"mEffectIndex": 2, "__type": "EffectValueCalculationPart"}),
                         {"t": "v", "name": "Effect2Amount"})
        self.assertEqual(normalize_part({"mCoefficient": 0.03, "mStatFormula": 2,
                                         "__type": "AbilityResourceByCoefficientCalculationPart"}),
                         {"t": "stat", "stat": "mp", "basis": "bonus", "coef": {"t": "n", "n": 0.03}})

    def test_stacks_and_level_forms(self):
        self.assertEqual(normalize_part({"mBuffName": "{x}", "mCoefficient": 2.0, "__type": "BuffCounterByCoefficientCalculationPart"}),
                         {"t": "stacks", "coef": {"t": "n", "n": 2}})
        self.assertEqual(normalize_part({"mBuffName": "{x}", "mDataValue": "PerStack",
                                         "__type": "BuffCounterByNamedDataValueCalculationPart"}),
                         {"t": "stacks", "coef": {"t": "v", "name": "PerStack"}})
        self.assertEqual(normalize_part({"StartDataValue": "S", "EndDataValue": "E", "__type": "{ee18a47b}"}),
                         {"t": "lerp", "a": {"t": "v", "name": "S"}, "b": {"t": "v", "name": "E"}})
        self.assertEqual(normalize_part({"{91d404a5}": "Base", "{b2cd0eb0}": "Per", "__type": "{b22609db}"}),
                         {"t": "perLvl", "base": {"t": "v", "name": "Base"}, "per": {"t": "v", "name": "Per"}})

    def test_formulas_of_another_spell(self):
        other = {"gnarq": {"DataValues": [{"name": "MiniBase", "values": [0, 5, 45]}], "mSpellCalculations": {
            "MiniTotalDamage": {"mFormulaParts": [{"mDataValue": "minibase", "__type": "NamedDataValueCalculationPart"},
                                                  {"mSpellCalculationKey": "Extra", "__type": "{f3cbe7b2}"}],
                                "__type": "GameCalculation"},
            "Extra": {"mFormulaParts": [{"mNumber": 1.0, "__type": "NumberCalculationPart"}], "__type": "GameCalculation"}}}}
        tooltip = "<physicalDamage>{{ spell.gnarq:minitotaldamage }} physical damage</physicalDamage>"
        spell = _one_spell("Q", "GnarQ", {"en": "Q", "fr": "Q"}, 2, tooltip, {}, other=other.get)
        self.assertEqual(spell["lines"], [{"type": "physical", "terms": [{"calc": "spell.gnarq:MiniTotalDamage", "kind": "flat"}]}])
        self.assertEqual(spell["calcs"]["spell.gnarq:MiniTotalDamage"]["parts"],
                         [{"t": "v", "name": "spell.gnarq:MiniBase"}, {"t": "ref", "name": "spell.gnarq:Extra"}])
        self.assertIn("spell.gnarq:Extra", spell["calcs"])
        self.assertEqual(spell["values"], {"spell.gnarq:MiniBase": [0, 5, 45]})
        self.assertNotIn("unparsed_tooltip", spell["flags"])

    def test_values_case_insensitive_and_effect_amounts(self):
        bin_spell = {"DataValues": [{"name": "RAPCoefficient", "values": [0, 0.35, 0.35]}],
                     "mEffectAmount": [{"value": [0, 80, 130], "__type": "SpellEffectAmount"}, {"__type": "SpellEffectAmount"}],
                     "mSpellCalculations": {"Total": {"mFormulaParts": [
                         {"mDataValue": "rAPCoefficient", "__type": "NamedDataValueCalculationPart"},
                         {"mEffectIndex": 1, "__type": "EffectValueCalculationPart"}], "__type": "GameCalculation"}}}
        spell = _one_spell("R", "X", {"en": "X", "fr": "X"}, 2, "<magicDamage>{{ Total }} magic damage</magicDamage>", bin_spell)
        self.assertEqual(spell["calcs"]["Total"]["parts"], [{"t": "v", "name": "RAPCoefficient"}, {"t": "v", "name": "Effect1Amount"}])
        self.assertEqual(spell["values"], {"RAPCoefficient": [0, 0.35, 0.35], "Effect1Amount": [0, 80, 130]})


if __name__ == "__main__":
    unittest.main()
