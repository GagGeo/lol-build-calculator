import unittest

from prep import parse_item_stats

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


if __name__ == "__main__":
    unittest.main()
