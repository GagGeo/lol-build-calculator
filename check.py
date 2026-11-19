"""Sanity checks on the generated data. Run after prep.py; exits 1 on the first failure.

Two kinds of checks:
- checks that run on every patch (hand rules reviewed, nothing unreadable, coverage, structure);
- exact values written for PINNED_PATCH (Jinx's health, Black Cleaver's stats...). They only run on
  that patch, so a normal balance patch doesn't need a human just because Riot changed a number.
"""
import json
import pathlib
import sys

PINNED_PATCH = "16.23.1"
root = pathlib.Path(__file__).parent
text = (root / "data.js").read_text(encoding="utf-8")
D = json.loads(text[len("window.DATA = "):].rstrip().rstrip(";"))
R = D["rules"]

# Every flagged item/rune must be sorted in rules.py before anything else is checked.
item_sorted = set(R["itemStatPassives"]) | set(R["itemStatPassivesReviewed"]) | set(R["itemStatPassivesUnknown"])
rune_sorted = set(R["runeStats"]) | set(R["runeStatsReviewed"])
todo_items = [i for i in D["review"]["possibleStatPassives"] if i not in item_sorted]
todo_runes = [r for r in D["review"]["possibleRuneStats"] if r not in rune_sorted]
champ_sorted = (set(R.get("championPassiveStats", {})) | set(R.get("championStatsUnknown", []))
                | set(R.get("championStatsReviewed", [])) | set(R["stackers"]))
todo_champs = [c for c in D["review"].get("possibleChampionStats", []) if c not in champ_sorted]
dmg_items = set(R.get("itemDamage", {})) | set(R.get("itemDamageNone", [])) | set(R.get("itemDamageUnknown", []))
dmg_runes = set(R.get("runeDamage", {})) | set(R.get("runeDamageNone", [])) | set(R.get("runeDamageUnknown", []))
todo_dmg_items = [i for i in D["review"].get("possibleItemDamage", []) if i not in dmg_items]
todo_dmg_runes = [r for r in D["review"].get("possibleRuneDamage", []) if r not in dmg_runes]
for i in todo_dmg_items:
    print(f"REVIEW item damage {i} {D['items'][i]['name']['en']}: add to itemDamage, itemDamageNone or itemDamageUnknown in rules.py")
for r in todo_dmg_runes:
    print(f"REVIEW rune damage {r} {D['runes']['byId'][r]['name']['en']}: add to runeDamage, runeDamageNone or runeDamageUnknown in rules.py")
survival_sorted = set(R.get("advisorNotScored", [])) | set(R.get("advisorScored", []))
todo_survival = [i for i in D["review"].get("possibleSurvival", []) if i not in survival_sorted]
for i in todo_survival:
    print(f"REVIEW survival item {i} {D['items'][i]['name']['en']}: add to advisorNotScored or advisorScored in rules.py")
if todo_dmg_items or todo_dmg_runes or todo_survival:
    sys.exit(1)
if todo_items or todo_runes or todo_champs:
    for i in todo_items:
        print(f"REVIEW item {i} {D['items'][i]['name']['en']}: add to itemStatPassives, "
              f"itemStatPassivesReviewed or itemStatPassivesUnknown in rules.py")
    for r in todo_runes:
        print(f"REVIEW rune {r} {D['runes']['byId'][r]['name']['en']}: add to runeStats or runeStatsReviewed in rules.py")
    for c in todo_champs:
        print(f"REVIEW champion {c} passive {D['champions'][c]['spells'][0]['name']['en']}: add to championPassiveStats, "
              f"stackers, championStatsReviewed or championStatsUnknown in rules.py")
    sys.exit(1)

# A hand rule whose item, rune or champion changed this patch may be stale.
if R.get("rulesCheckedForPatch") != D["patch"]:
    changed = D["review"].get("changed", {})
    ruled_items = (set(R["itemStatPassives"]) | set(R["itemStatPassivesUnknown"]) | set(R.get("itemDamage", {}))
                   | set(R.get("advisorNotScored", [])))
    ruled_champs = (set(R["stackers"]) | set(R.get("championStatsUnknown", [])) | set(R.get("championPassiveStats", {}))
                    | set(R.get("passiveFromLevel", {})))
    stale = ([f"item {i} {D['items'][i]['name']['en']}" for i in changed.get("item", []) if i in ruled_items]
             + [f"rune {r} {D['runes']['byId'][r]['name']['en']}" for r in changed.get("rune", []) if r in R["runeStats"] or r in R.get("runeDamage", {})]
             + [f"champion {c}" for c in changed.get("champion", []) if c in ruled_champs])
    for s in stale:
        print(f"REVIEW {s}: changed since {D['review'].get('comparedWith')}, check its rule in rules.py")
    if stale:
        print(f"Then set rulesCheckedForPatch to \"{D['patch']}\" in rules.py.")
        sys.exit(1)

C, I = D["champions"], D["items"]
pinned = D["patch"] == PINNED_PATCH

# --- Every patch -----------------------------------------------------------------------------------
assert len(C) >= 160, f"only {len(C)} champions"
assert len(I) >= 150, f"only {len(I)} items"
no_note = [i for i in R.get("advisorNotScored", []) if i in I and not I[i]["plaintext"]["en"] and i not in R.get("advisorNotes", {})]
assert not no_note, f"not-scored items without a note (add to advisorNotes): {no_note}"
assert not [c for c in C.values() if set(c["flags"]) - {"custom_skill_ranks"}], \
    [(c["id"], c["flags"]) for c in C.values() if set(c["flags"]) - {"custom_skill_ranks"}]
assert all([s["key"] for s in c["spells"]] == ["P", "Q", "W", "E", "R"] for c in C.values())
# Data Dragon shipped AD per level 0 for every champion in 16.23; the game files must have filled it in.
no_ad_growth = [c["id"] for c in C.values() if not c["base"]["adperlevel"]]
assert len(no_ad_growth) <= 3, f"champions without AD growth: {no_ad_growth}"
report = (root / "data" / f"{D['patch']}-report.txt").read_text(encoding="utf-8")
assert "== Unknown stats ==\n(none)" in report, "report lists unknown stat names"
assert "== Stats object mismatches ==\n(none)" in report, "report lists stats object mismatches"
coverage = float(report.split("spells with damage fully readable: ")[1].split("(")[1].split("%")[0])
assert coverage >= 80, f"spell coverage fell to {coverage}%"

# --- Exact values for PINNED_PATCH only --------------------------------------------------------------
if pinned:
    assert len(C) == 173, len(C)
    assert len(I) == 204, len(I)
    assert C["Jinx"]["base"]["hp"] == 610 and C["Jinx"]["base"]["hpperlevel"] == 105, C["Jinx"]["base"]
    assert C["Tristana"]["base"]["adperlevel"] == 3.4 and C["Quinn"]["base"]["adperlevel"] == 3.2
    assert C["Senna"]["base"]["adperlevel"] == 0
    assert C["Aatrox"]["spells"][0]["lines"], "Aatrox passive damage"
    assert I["3071"]["stats"] == {"ad": 45, "hp": 400, "ah": 20}, I["3071"]["stats"]
    assert I["3071"]["gold"]["total"] == 3000
    assert "APMultiplier" in I["3089"]["groups"], I["3089"]["groups"]
    assert I["3006"]["boots"]
    assert "1036" in I and "2003" not in I
    # Kalista's Black Spear (consumable) and Scarecrow Effigy (trinket) are not slot items, so they are left out.
    assert "3599" not in I and "3330" not in I
    assert "no_cdragon_record" not in C["MonkeyKing"]["flags"]
    assert {"Udyr", "Jayce", "Elise", "Nidalee"} <= {c["id"] for c in C.values() if "custom_skill_ranks" in c["flags"]}
    annie_q = C["Annie"]["spells"][1]
    assert annie_q["values"]["BaseDamage"][1] == 80, annie_q["values"]  # value lists are indexed by rank
    assert [l["type"] for l in annie_q["lines"]] == ["magic"], annie_q["lines"]
    assert any(t["kind"] == "targetMissing" for l in C["Garen"]["spells"][4]["lines"] for t in l["terms"])
    assert any(t["kind"] == "targetMax" for l in C["Vayne"]["spells"][2]["lines"] for t in l["terms"])
print("check OK" + ("" if pinned else f" (exact {PINNED_PATCH} values skipped on {D['patch']})"))
