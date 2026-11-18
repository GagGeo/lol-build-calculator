"""Sanity checks on the generated data. Run after prep.py; exits 1 on the first failure.

Pinned values (counts, Jinx, Black Cleaver...) are for patch 16.23.1. When a new patch fails an
assert below because Riot changed that value on purpose, update the value here (and in
engine.real.test.js if it fails there too).
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
dmg_items = set(R.get("itemDamage", {})) | set(R.get("itemDamageNone", [])) | set(R.get("itemDamageUnknown", []))
dmg_runes = set(R.get("runeDamage", {})) | set(R.get("runeDamageNone", [])) | set(R.get("runeDamageUnknown", []))
todo_dmg_items = [i for i in D["review"].get("possibleItemDamage", []) if i not in dmg_items]
todo_dmg_runes = [r for r in D["review"].get("possibleRuneDamage", []) if r not in dmg_runes]
for i in todo_dmg_items:
    print(f"REVIEW item damage {i} {D['items'][i]['name']['en']}: add to itemDamage, itemDamageNone or itemDamageUnknown in rules.py")
for r in todo_dmg_runes:
    print(f"REVIEW rune damage {r} {D['runes']['byId'][r]['name']['en']}: add to runeDamage, runeDamageNone or runeDamageUnknown in rules.py")
if todo_dmg_items or todo_dmg_runes:
    sys.exit(1)
if todo_items or todo_runes:
    for i in todo_items:
        print(f"REVIEW item {i} {D['items'][i]['name']['en']}: add to itemStatPassives, "
              f"itemStatPassivesReviewed or itemStatPassivesUnknown in rules.py")
    for r in todo_runes:
        print(f"REVIEW rune {r} {D['runes']['byId'][r]['name']['en']}: add to runeStats or runeStatsReviewed in rules.py")
    sys.exit(1)

# A hand rule whose item, rune or champion changed this patch may be stale.
if R.get("rulesCheckedForPatch") != D["patch"]:
    changed = D["review"].get("changed", {})
    ruled_items = set(R["itemStatPassives"]) | set(R["itemStatPassivesUnknown"]) | set(R.get("itemDamage", {}))
    ruled_champs = set(R["stackers"]) | set(R.get("championStatsUnknown", []))
    stale = ([f"item {i} {D['items'][i]['name']['en']}" for i in changed.get("item", []) if i in ruled_items]
             + [f"rune {r} {D['runes']['byId'][r]['name']['en']}" for r in changed.get("rune", []) if r in R["runeStats"] or r in R.get("runeDamage", {})]
             + [f"champion {c}" for c in changed.get("champion", []) if c in ruled_champs])
    for s in stale:
        print(f"REVIEW {s}: changed since {D['review'].get('comparedWith')}, check its rule in rules.py")
    if stale:
        print(f"Then set rulesCheckedForPatch to \"{D['patch']}\" in rules.py.")
        sys.exit(1)

C, I = D["champions"], D["items"]
assert len(C) == 173, len(C)
assert len(I) == 204, len(I)
assert C["Jinx"]["base"]["hp"] == 610 and C["Jinx"]["base"]["hpperlevel"] == 105, C["Jinx"]["base"]
assert I["3071"]["stats"] == {"ad": 45, "hp": 400, "ah": 20}, I["3071"]["stats"]
assert I["3071"]["gold"]["total"] == 3000
assert "APMultiplier" in I["3089"]["groups"], I["3089"]["groups"]
assert I["3006"]["boots"]
assert "1036" in I and "2003" not in I
# Kalista's Black Spear (consumable) and Scarecrow Effigy (trinket) are not slot items, so they are left out.
assert "3599" not in I and "3330" not in I
assert "no_cdragon_record" not in C["MonkeyKing"]["flags"]
assert not [c for c in C.values() if set(c["flags"]) - {"custom_skill_ranks"}], \
    [(c["id"], c["flags"]) for c in C.values() if set(c["flags"]) - {"custom_skill_ranks"}]
assert {"Udyr", "Jayce", "Elise", "Nidalee"} <= {c["id"] for c in C.values() if "custom_skill_ranks" in c["flags"]}

# Spells (stage 2).
assert all([s["key"] for s in c["spells"]] == ["P", "Q", "W", "E", "R"] for c in C.values())
annie_q = C["Annie"]["spells"][1]
assert annie_q["values"]["BaseDamage"][1] == 80, annie_q["values"]  # value lists are indexed by rank
assert [l["type"] for l in annie_q["lines"]] == ["magic"], annie_q["lines"]
assert any(t["kind"] == "targetMissing" for l in C["Garen"]["spells"][4]["lines"] for t in l["terms"])
assert any(t["kind"] == "targetMax" for l in C["Vayne"]["spells"][2]["lines"] for t in l["terms"])
report = (root / "data" / f"{D['patch']}-report.txt").read_text(encoding="utf-8")
assert "== Unknown stats ==\n(none)" in report, "report lists unknown stat names"
assert "== Stats object mismatches ==\n(none)" in report, "report lists stats object mismatches"
coverage = float(report.split("damage lines fully readable: ")[1].split("(")[1].split("%")[0])
assert coverage >= 80, f"spell coverage fell to {coverage}%"
print("check OK")
