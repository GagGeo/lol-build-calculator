"""Sanity checks on the generated data. Run after prep.py; exits 1 on the first failure.

Pinned values are for patch 16.23.1: update them when a patch legitimately changes them.
"""
import json
import pathlib
import sys

root = pathlib.Path(__file__).parent
text = (root / "data.js").read_text(encoding="utf-8")
D = json.loads(text[len("window.DATA = "):].rstrip().rstrip(";"))
R = D["rules"]

# Every flagged item/rune must be sorted in rules.py before anything else is checked.
item_sorted = set(R["itemStatPassives"]) | set(R["itemStatPassivesReviewed"]) | set(R["itemStatPassivesUnknown"])
rune_sorted = set(R["runeStats"]) | set(R["runeStatsReviewed"])
todo_items = [i for i in D["review"]["possibleStatPassives"] if i not in item_sorted]
todo_runes = [r for r in D["review"]["possibleRuneStats"] if r not in rune_sorted]
if todo_items or todo_runes:
    for i in todo_items:
        print(f"REVIEW item {i} {D['items'][i]['name']['en']}: add to itemStatPassives, "
              f"itemStatPassivesReviewed or itemStatPassivesUnknown in rules.py")
    for r in todo_runes:
        print(f"REVIEW rune {r} {D['runes']['byId'][r]['name']['en']}: add to runeStats or runeStatsReviewed in rules.py")
    sys.exit(1)

C, I = D["champions"], D["items"]
assert len(C) == 173, len(C)
assert C["Jinx"]["base"]["hp"] == 610 and C["Jinx"]["base"]["hpperlevel"] == 105, C["Jinx"]["base"]
assert I["3071"]["stats"] == {"ad": 45, "hp": 400, "ah": 20}, I["3071"]["stats"]
assert I["3071"]["gold"]["total"] == 3000
assert "APMultiplier" in I["3089"]["groups"], I["3089"]["groups"]
assert I["3006"]["boots"]
assert "1036" in I and "2003" not in I
# Kalista's Black Spear (consumable) and Scarecrow Effigy (trinket) are not slot items, so they are left out.
assert "3599" not in I and "3330" not in I
assert "no_cdragon_record" not in C["MonkeyKing"]["flags"]
assert not [c for c in C.values() if c["flags"]], [c["id"] for c in C.values() if c["flags"]]
report = (root / "data" / f"{D['patch']}-report.txt").read_text(encoding="utf-8")
assert "== Unknown stats ==\n(none)" in report, "report lists unknown stat names"
print("check OK")
