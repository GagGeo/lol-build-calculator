import unittest

from prep import parse_item_stats, build_items, build_runes, build_champions, diff_patches

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


if __name__ == "__main__":
    unittest.main()
