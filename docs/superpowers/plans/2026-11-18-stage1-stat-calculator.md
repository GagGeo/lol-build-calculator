# Stage 1: Stat Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page, opened straight from disk, where you pick a champion, level 1–18,
a legal rune page and up to 6 legal items, and see base, bonus and total stats.
English and French are available.

**Architecture:** `prep.py` (Python, standard library only) downloads Data Dragon and
CommunityDragon files for one patch. It turns them into `data.js`
(`window.DATA = {...}`) and writes a report. The page is plain HTML and JavaScript.
- `engine.js` holds pure functions (stats, legality, gold) that run in the browser
  and under `node --test`.
- `app.js` draws one reusable champion panel. Stage 2 will put two of them side
  by side.

**Tech Stack:** Python 3.14 (stdlib: `urllib`, `json`, `concurrent.futures`,
`unittest`), Node 26 (`node --test` only, no packages), vanilla HTML/CSS/JS.

**Spec:** `docs/superpowers/specs/2026-11-17-lol-build-calculator-design.md`

**Scope:** stage 1 of the spec only. Separate plans will cover stage 2 (damage
against an enemy, spells, damage runes, champion passives) and stage 3 (buy
advisor). They'll be written once this stage's data file exists, because spell
formula handling depends on what the real data looks like. Champion stat
conversions such as Jhin's attack speed to AD come in stage 2, with champion
passives.

## Global Constraints

- No third-party Python packages. No npm packages. No build step. No framework.
- `index.html` must work when opened as a `file://` URL, which is why the data
  goes in `data.js` rather than a JSON fetch.
- Data sources:
  - `https://ddragon.leagueoflegends.com/api/versions.json`, plus
    `https://ddragon.leagueoflegends.com/cdn/<patch>/data/<en_US|fr_FR>/<file>.json`
  - `https://raw.communitydragon.org/<major.minor>/game/items.cdtb.bin.json`
  - `https://raw.communitydragon.org/<major.minor>/game/data/characters/<id lowercased>/<id lowercased>.bin.json`

  If a CommunityDragon `<major.minor>` path returns 404, retry with `latest` and
  write a line in the report.
- Stats are parsed from `en_US` only. `fr_FR` supplies display names and
  descriptions only.
- Champion ids are compared **case-insensitively** everywhere. Data Dragon writes
  `"FiddleSticks"` in `requiredChampion` while the champion id is `"Fiddlesticks"`.
- Anything not computed is shown with a visible flag, never silently dropped.
- Footer disclaimer, exact text:
  - EN: `LoL Build Calculator isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.`
  - FR: `LoL Build Calculator n'est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ni de toute personne officiellement impliquée dans la production ou la gestion des propriétés de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou des marques déposées de Riot Games, Inc.`
- The language choice is stored in `localStorage` under `lang`. Every read and
  write is wrapped in try/catch, with English as the default.
- Commit messages carry **no** `Co-Authored-By` or Claude/Anthropic trailer (the
  user's rule).
- Tests that pin real values are for patch `16.23.1`. When a later patch changes a
  value legitimately, update the test and say so in the commit message.

### Canonical stat keys (used by prep, rules and engine)

`hp, mp, ad, ap, armor, mr, as` (bonus attack speed, %), `ah, ms` (flat), `msPct,
crit` (%), `critDmg` (%), `lifesteal, omnivamp, lethality, armorPenPct, magicPen,
magicPenPct, hsp` (heal and shield power, %), `tenacity, hpRegenPct, mpRegenPct,
adaptive`.

English stat name → key:

| English name | Key |
|---|---|
| Health | hp |
| Mana | mp |
| Attack Damage | ad |
| Ability Power | ap |
| Armor | armor |
| Magic Resist | mr |
| Attack Speed | as |
| Ability Haste | ah |
| Move Speed | ms, or msPct if the value has `%` |
| Critical Strike Chance | crit |
| Critical Strike Damage | critDmg |
| Life Steal | lifesteal |
| Omnivamp | omnivamp |
| Lethality | lethality |
| Armor Penetration | armorPenPct |
| Magic Penetration | magicPen, or magicPenPct if `%` |
| Heal and Shield Power | hsp |
| Tenacity | tenacity |
| Base Health Regen | hpRegenPct |
| Base Mana Regen | mpRegenPct |
| Adaptive Force | adaptive |
| Gold Per 10 Seconds | ignored, silently |

### `window.DATA` shape (produced by Task 3, consumed by Tasks 4–6)

```js
{
  patch: "16.23.1",
  champions: { "<id>": {
    id, name: {en, fr}, title: {en, fr}, resource: "Mana",
    base: { hp, hpperlevel, mp, mpperlevel, armor, armorperlevel, mr, mrperlevel,
            ad, adperlevel, as, asratio, asperlevel /* percent */, ms, range,
            hpregen, hpregenperlevel, mpregen, mpregenperlevel },
    adaptiveAP: true|false, flags: [] } },
  items: { "<id>": {
    id, name: {en, fr}, desc: {en, fr} /* HTML */, gold: {total, base},
    from: ["<id>"], into: ["<id>"], tier: <epicness number|null>,
    groups: ["<groupId>"], boots: bool, requiredChampion: "<id>"|null,
    stats: { <canonical key>: number } } },
  groups: { "<groupId>": <max owned, integer> },   // only groups whose max is set
  runes: { trees: [{ id, key, name: {en, fr}, slots: [[ids],[ids],[ids],[ids]] }],
           byId: { "<runeId>": { id, name: {en, fr}, desc: {en, fr}, tree, row } } },
  rules: <RULES from rules.py>
}
```

`slots[0]` holds the keystones. `row` is 0–3. A group id is the bin key with
`Items/ItemGroups/` stripped (e.g. `Boots`, `CleaveItems`), or the raw hash such as
`{24adb712}`.

### Rune page shape (engine and UI)

`{ primary, keystone, primaryRunes: [r1, r2, r3], secondary, secondaryRunes: [a, b],
shards: [s1, s2, s3] }`. All values are numbers or `null`.

## Review Focus

1. **Switching champion after picking items** (e.g. to Cassiopeia while wearing
   boots, or to Annie holding Kalista's Black Spear): the now-illegal items are
   removed and the removal is shown, never kept silently. This is tested by
   `pruneBuild` in Task 5.
2. **Switching the primary rune tree to the one picked as secondary**, or changing
   a tree: the dependent choices are cleared, not left invalid. This is tested by
   `normalizeRunePage` in Task 5.
3. **Mismatched champion id spelling across sources** (`FiddleSticks` and
   `Fiddlesticks`; CommunityDragon paths are lowercase, e.g. `monkeyking`): the
   item restriction and the record lookup still work. Tested in Task 5 (engine)
   and Task 3 (`check.py`).
4. **A typed level outside 1–18, or text**: it's clamped to 1–18 and rounded.
   Tested in Task 4.
5. **Local storage blocked** (private window): the language switch still works for
   the session and the default is English. Tested in Task 6.

---

### Task 1: Item stat parsing

**Files:**
- Create: `.gitignore` (contents: `cache/`, `__pycache__/`)
- Create: `prep.py`
- Test: `test_prep.py`

**Interfaces:**
- Produces: `parse_item_stats(desc: str) -> tuple[dict[str, float], list[str]]`. It
  returns the stats from the `<stats>…</stats>` block of an item description, plus
  the English names it didn't recognise.

- [ ] **Step 1: Write the failing tests** in `test_prep.py` (`unittest`):

```python
CLEAVER = ("<mainText><stats><attention>45</attention> Attack Damage<br>"
           "<attention>400</attention> Health<br><attention>20</attention> Ability Haste"
           "</stats><br><br><passive>Carve</passive>…</mainText>")

def test_parses_all_stats(self):
    self.assertEqual(parse_item_stats(CLEAVER), ({"ad": 45, "hp": 400, "ah": 20}, []))
def test_percent_move_speed(self):
    self.assertEqual(parse_item_stats("<stats><attention>4%</attention> Move Speed</stats>")[0], {"msPct": 4})
def test_flat_move_speed(self):
    self.assertEqual(parse_item_stats("<stats><attention>25</attention> Move Speed</stats>")[0], {"ms": 25})
def test_percent_magic_pen(self):
    self.assertEqual(parse_item_stats("<stats><attention>40%</attention> Magic Penetration</stats>")[0], {"magicPenPct": 40})
def test_unknown_name_reported(self):
    self.assertEqual(parse_item_stats("<stats><attention>5</attention> Foo Bar</stats>"), ({}, ["Foo Bar"]))
def test_gold_per_10_ignored(self):
    self.assertEqual(parse_item_stats("<stats><attention>3</attention> Gold Per 10 Seconds</stats>"), ({}, []))
def test_no_stats_block(self):
    self.assertEqual(parse_item_stats("<mainText>Active only</mainText>"), ({}, []))
```

- [ ] **Step 2: Run it and confirm it fails.** Run
  `python3 -m unittest test_prep -v`. Expected: an `ImportError` / `AttributeError`
  for `parse_item_stats`.
- [ ] **Step 3: Implement `parse_item_stats` in `prep.py`.**
  - Take the first `<stats>(.*?)</stats>` block and split it on `<br>`.
  - In each line, find `<attention>([\d.]+)(%?)</attention>\s*(.+)`.
  - Strip any remaining tags from the name, then map it with the table in Global
    Constraints.
  - Values are floats, with whole numbers shown without decimals.
- [ ] **Step 4: Run the tests and confirm they pass.** Run
  `python3 -m unittest test_prep -v`. Expected: 7 tests OK.
- [ ] **Step 5: Commit.**
  `git add .gitignore prep.py test_prep.py docs && git commit -m "feat: parse item stats from descriptions"`

### Task 2: Item, group and rune building

**Files:**
- Modify: `prep.py`
- Test: `test_prep.py`

**Interfaces:**
- Consumes: `parse_item_stats` (Task 1).
- Produces:
  - `build_items(dd_en: dict, dd_fr: dict, items_bin: dict) -> tuple[dict, dict, list[str]]`
    returns `(items, groups, report_lines)`, shaped as `DATA.items` and
    `DATA.groups`.
  - `build_runes(rr_en: list, rr_fr: list) -> dict`, shaped as `DATA.runes`.

- [ ] **Step 1: Write the failing tests.** The fixtures are small hand-written dicts
  in the test file, shaped like the real files:
  - `dd_*`: `{"data": {id: {...}}}`, using `name`, `description`, `gold`, `maps`,
    `tags`, `from`, `into`, `requiredChampion`, `requiredAlly`, `inStore`,
    `hideFromAll`.
  - `items_bin`: `{"Items/<id>": {"mItemGroups": [...], "epicness": n}, "Items/ItemGroups/Boots": {"__type": "ItemGroup", "mMaxGroupOwnable": 1}, "{24adb712}": {"__type": "ItemGroup", "mMaxGroupOwnable": 1}, "Items/ItemGroups/Default": {"__type": "ItemGroup"}}`.

```python
def test_keeps_rift_purchasable_items(self):   # Long Sword 1036 kept
def test_drops_consumables_trinkets_other_maps_and_ally_only(self):
    # 2003 tagged Consumable, a Trinket, one with maps["11"] False, one with requiredAlly → all absent
def test_groups_and_boots(self):
    items, groups, _ = build_items(EN, FR, BIN)
    self.assertEqual(items["3006"]["groups"], ["Boots"])      # Default group dropped (no max)
    self.assertTrue(items["3006"]["boots"])
    self.assertEqual(groups, {"Boots": 1, "{24adb712}": 1})
def test_tier_names_and_required_champion(self):
    self.assertEqual(items["3071"]["tier"], 5)
    self.assertEqual(items["3071"]["name"], {"en": "Black Cleaver", "fr": "Couperet noir"})
    self.assertEqual(items["3599"]["requiredChampion"], "Kalista")
def test_report_lists_unknown_stats_and_stat_object_mismatch(self):
    # an item whose description says 45 AD but stats.FlatPhysicalDamageMod is 40 → a report line naming its id
def test_build_runes(self):
    # two-tree fixture; byId[8112] == {"id": 8112, "name": {...}, "desc": {...}, "tree": 8100, "row": 0}
```

- [ ] **Step 2: Run them and confirm they fail.** Run
  `python3 -m unittest test_prep -v`. Expected: the new tests fail with
  `AttributeError`.
- [ ] **Step 3: Implement `build_items` and `build_runes` in `prep.py`.**
  - **Keeping items:** keep an item when all of these hold:
    - `maps["11"]` is true
    - `gold.purchasable` is true
    - it has no `requiredAlly`
    - `inStore` is not `False`
    - `hideFromAll` is not true
    - its tags include neither `Consumable` nor `Trinket`
  - **Stats** come from `parse_item_stats(en description)`.
  - **Report lines:**
    - unknown stat names, with the item id,
    - every item where Data Dragon's `stats` object disagrees with the parsed
      value, using this mapping: `FlatHPPoolMod→hp`, `FlatMPPoolMod→mp`,
      `FlatPhysicalDamageMod→ad`, `FlatMagicDamageMod→ap`, `FlatArmorMod→armor`,
      `FlatSpellBlockMod→mr`, `PercentAttackSpeedMod→as` (×100),
      `FlatCritChanceMod→crit` (×100), `PercentLifeStealMod→lifesteal` (×100),
      `FlatMovementSpeedMod→ms`, `PercentMovementSpeedMod→msPct` (×100),
    - a **"possible stat passive"** line for every item whose English description
      text outside `<stats>` matches
      `/(Increases your|equal to|based on|converts?|per \d+ bonus)/i`.
  - **Groups:** an item's groups are the `mItemGroups` entries whose group has a
    `mMaxGroupOwnable`.
  - **Runes:** `row` is the slot index in `slots`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run
  `python3 -m unittest test_prep -v`. Expected: all OK.
- [ ] **Step 5: Commit.**
  `git commit -am "feat: build items, item groups and runes"`

### Task 3: Champions, rules, output, report, `check.py`

**Files:**
- Create: `rules.py`, `check.py`
- Modify: `prep.py`
- Test: `test_prep.py`
- Generated and committed: `data.js`, `data/16.23.1.json`, `data/16.23.1-report.txt`

**Interfaces:**
- Consumes: `build_items` and `build_runes` (Task 2).
- Produces:
  - `build_champions(dd_en: dict, dd_fr: dict, records: dict[str, dict | None]) -> tuple[dict, list[str]]`.
    `records` maps a champion id to its CommunityDragon
    `Characters/<Name>/CharacterRecords/Root` object, or `None` if missing.
  - `diff_patches(old: dict, new: dict) -> list[str]`
  - `fetch_json(url: str, cache_path: pathlib.Path) -> object` (reads the cache
    if present)
  - `main(argv: list[str]) -> int`: `python3 prep.py [patch]`
  - `RULES` in `rules.py`

- [ ] **Step 1: Write the failing tests:**

```python
def test_champion_base_and_ratio(self):
    # record has attackSpeedRatioModifiable.baseValue 0.625, mAdaptiveForceToAbilityPowerWeight 1.0
    c = champs["Annie"]; self.assertEqual(c["base"]["asratio"], 0.625); self.assertTrue(c["adaptiveAP"])
    self.assertEqual(c["base"]["mr"], DD["data"]["Annie"]["stats"]["spellblock"])
def test_missing_record_falls_back_and_flags(self):
    # records["Zed"] = None → asratio == base as, adaptiveAP False, "no_cdragon_record" in flags, a report line
def test_diff_lists_changed_new_removed(self):
    self.assertEqual(diff_patches({"items": {"1": {"stats": {"ad": 10}}}, "champions": {}},
                                  {"items": {"1": {"stats": {"ad": 12}}, "2": {}}, "champions": {}}),
                     ["changed item 1", "new item 2"])
```

- [ ] **Step 2: Run them and confirm they fail.** Run
  `python3 -m unittest test_prep -v`. Expected: the new tests fail.
- [ ] **Step 3: Write `rules.py`** with these values. The shard values were checked
  against CommunityDragon `perks.json` for 16.23.

```python
RULES = {
  "shards": {"5008": {"adaptive": 9}, "5005": {"as": 10}, "5007": {"ah": 8},
             "5010": {"msPct": 2.5}, "5001": {"hpPerLevel": 10},
             "5011": {"hp": 65}, "5013": {"tenacity": 15}},
  "shardRows": [[5008, 5005, 5007], [5008, 5010, 5001], [5011, 5013, 5001]],
  "noBoots": ["Cassiopeia"],
  "asCap": 2.5,
  # ponytail: rough laner estimate, Riot publishes none; only drives a warning
  "typicalGoldByLevel": [500, 800, 1100, 1500, 1900, 2400, 3000, 3700, 4400,
                         5200, 6100, 7000, 8000, 9000, 10200, 11500, 13000, 15000],
  "goldWarningFactor": 1.5,
  "itemStatPassives": {"3089": [{"op": "mulTotal", "stat": "ap", "value": 0.30}]},
  "itemStatPassivesReviewed": [],
  "stackers": {"Veigar": {"ap": 1}},
  "runeStats": {},
  "runeStatsReviewed": [],
}
```

  Item passive ops:
  - `{"op": "mulTotal", "stat", "value"}`: total stat × (1 + value).
  - `{"op": "convert", "from", "basis": "bonus"|"total", "to", "value"}`: adds
    value × source stat to the target. It's applied after every `mulTotal` except
    a `mulTotal` on the target.

  `runeStats` maps a rune id to `{stat: value}`. It applies only when the page's
  "assume fully stacked" toggle is on.
- [ ] **Step 4: Implement `build_champions`, `diff_patches`, `fetch_json` and
  `main`.**
  - `build_champions` takes the base stats from Data Dragon `champion.json`,
    renaming `spellblock`→`mr`, `attackdamage`→`ad`, `attackspeed`→`as`,
    `attackspeedperlevel`→`asperlevel` and `movespeed`→`ms`.
  - It takes `asratio` from `attackSpeedRatioModifiable.baseValue`, and
    `adaptiveAP` = `mAdaptiveForceToAbilityPowerWeight == 1.0`.
  - `main` downloads both languages and all the CommunityDragon files, with 8
    threads, cached under `cache/<patch>/`.
  - It writes:
    - `data.js` as `window.DATA = <json>;`,
    - `data/<patch>.json`,
    - `data/<patch>-report.txt`, with sections: counts, unknown stats,
      stats-object mismatches, possible stat passives, possible rune stats (rune
      long descriptions matching `/(Adaptive Force|Attack Speed|Ability Haste|Health|Armor|Magic Resist|Move Speed)/`),
      missing records, CommunityDragon fallbacks, and the diff against the newest
      other `data/*.json`.
  - It prints the counts and the report path, and returns 0.
- [ ] **Step 5: Run the tests and confirm they pass.** Run
  `python3 -m unittest test_prep -v`. Expected: all OK.
- [ ] **Step 6: Run the real prep.** Run `python3 prep.py 16.23.1`. Expected: the
  counts print, with 173 champions and over 150 items, and `data.js` exists.
- [ ] **Step 7: Fill the hand lists from the report.**
  - Read every "possible stat passive" item in the report. Each one goes either into
    `itemStatPassives`, as one of the two ops, or into `itemStatPassivesReviewed`
    when the effect isn't a permanent stat (e.g. a temporary shield).
  - Do the same for the "possible rune stats" runes, with `runeStats` and
    `runeStatsReviewed`.
  - Add stacking champions whose passive or ability grants a permanent stat per
    stack, with the value read from their Data Dragon description (e.g.
    `"Sion": {"hp": …}`, `"Thresh": …`). Re-run `prep.py`.
- [ ] **Step 8: Write `check.py`.** Use plain `assert`s on `data/16.23.1.json` and
  exit 1 on the first failure:
  - `champions` count is 173. `Jinx.base.hp` is 610 and `hpperlevel` is 105.
  - Item `3071` has stats `{"ad": 45, "hp": 400, "ah": 20}` and `gold.total` 3000.
  - `3089` has `"APMultiplier"` among its groups. `3006` has `boots` true.
  - `1036` (Long Sword) is present and `2003` (Health Potion) is absent.
  - Some item named "Kalista's Black Spear" has `requiredChampion` `"Kalista"`.
  - `champions["MonkeyKing"]` has no `"no_cdragon_record"` flag.
  - Every "possible stat passive" id is in `itemStatPassives` or
    `itemStatPassivesReviewed`, and every "possible rune stats" id is in
    `runeStats` or `runeStatsReviewed`.
  - The report has no unknown stat names.
- [ ] **Step 9: Run the check.** Run `python3 check.py`. Expected: it prints
  `check OK` and exits 0.
- [ ] **Step 10: Commit.**
  `git add rules.py check.py prep.py test_prep.py data.js data && git commit -m "feat: champion data, hand rules, data.js output and patch report"`

### Task 4: Stats engine

**Files:**
- Create: `engine.js`
- Test: `engine.test.js` (with a small inline fixture DATA)

**Interfaces:**
- Consumes: the `DATA` shape (Task 3).
- Produces, on global `Engine` in the browser and `module.exports` in Node:
  - `Engine.growth(level: number) -> number`
  - `Engine.clampLevel(level: any) -> integer 1..18`
  - `Engine.championStats(data, sel) -> {base, bonus, total, flags}`, where
    `sel = {champ, level, items: [id], runes: page|null, stacked: bool, stacks: number}`.
    `base`, `bonus` and `total` are canonical-key objects. `total.as` is final
    attacks per second and `total.ms` is final move speed.

- [ ] **Step 1: Write the failing tests** (`node:test`, `node:assert/strict`).
  - **Fixture `D`**, shared with Task 5 (export it from `engine.test.js` or keep it
    at the top of the file):
    - Champions:
      - `Testo`: `hp 600 / hpperlevel 100`, `armor 30 / 4`, `ad 60 / 3`, `as 0.65`,
        `asratio 0.625`, `asperlevel 2`, `ms 340`, `adaptiveAP false`, every other
        base value 0.
      - `Veigar`, `Cassiopeia` and `Fiddlesticks`: copies of Testo.
    - Items:
      - `ls` (ad 10), `bow` (as 25), `cap` (ap 130, id `3089` passive via rules),
        `big` (as 300),
      - `boots` and `boots2` (ms 100, groups `["Boots"]`, `boots: true`),
      - `effigy` (`requiredChampion: "FiddleSticks"`),
      - `bf` (ad 40, `gold.total` 1300).
    - `groups` is `{Boots: 1}`.
    - `runes` has two trees, each with 4 rows of 2 runes.
    - `rules` is a copy of `RULES`, with `itemStatPassives` keyed by `cap`.
  - **Helpers:**
    - `stats(o) = Engine.championStats(D, {champ: 'Testo', level: 1, items: [], runes: null, stacked: false, stacks: 0, ...o})`.
    - `pageWithShards(s)` returns a valid page with those shards.
  - Every float assertion uses `near(a, b)`, which passes when |a − b| < 1e-9.
    `assert.equal` is only for integers.

```js
test('growth', () => { near(Engine.growth(1), 0); near(Engine.growth(18), 17); near(Engine.growth(2), 0.72); });
test('level 18 base hp', () => near(stats({level: 18}).total.hp, 2300));
test('item bonus ad', () => near(stats({level: 18, items: ['ls']}).total.ad, 121));
test('attack speed', () => near(stats({level: 1, items: ['bow']}).total.as, 0.80625));
test('attack speed cap', () => near(stats({level: 1, items: ['big']}).total.as, 2.5));
test('rabadon multiplies total ap incl. adaptive shard', () =>
  near(stats({items: ['cap'], runes: pageWithShards([5008, 5010, 5011])}).total.ap, 180.7));
test('adaptive goes AD for AD champ with no bonus', () => near(stats({runes: pageWithShards([5008, 5010, 5011])}).bonus.ad, 5.4));
test('health scaling shard', () => assert.equal(stats({level: 10, runes: pageWithShards([5005, 5001, 5011])}).bonus.hp, 100 + 65));
test('move speed soft cap', () => assert.equal(stats({items: ['boots']}).total.ms, 435));
test('stacks', () => assert.equal(stats({champ: 'Veigar', stacks: 50}).bonus.ap, 50));
test('level clamp', () => { assert.equal(Engine.clampLevel(0), 1); assert.equal(Engine.clampLevel(19), 18); assert.equal(Engine.clampLevel('7.6'), 8); assert.equal(Engine.clampLevel('x'), 1); });
```

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test`. Expected: the
  tests fail because `Engine` is undefined.
- [ ] **Step 3: Implement `engine.js`.**
  - `growth(n) = (n-1) × (0.7025 + 0.0175 × (n-1))`.
  - **Base** stat = base + perlevel × growth.
  - **Bonus** = item stats + shard stats + `runeStats` (when `stacked`) +
    stackers × stacks. `hpPerLevel` gives 10 × level.
  - **Adaptive force:** 1 point = 1 AP or 0.6 AD. It goes to AP if bonus AP > bonus
    AD, to AD if lower, and follows `adaptiveAP` on a tie. Apply it before item
    passives.
  - **Attack speed:** `min(asCap, as + asratio × (bonus.as/100 + asperlevel/100 × growth))`.
  - **Move speed:** `(ms + bonus.ms) × (1 + msPct/100)`, then the soft caps: above
    415 the excess counts ×0.8, and above 490 ×0.5.
  - **Item passives:** apply `mulTotal` first, then `convert`.
  - **Flags:** `flags` is `[]` in stage 1. `check.py` guarantees every possible
    passive has been reviewed. Stage 2 fills `flags` for spells.
  - End the file with:
    `if (typeof module === 'object') module.exports = Engine;`
- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --test`. Expected:
  all pass.
- [ ] **Step 5: Commit.**
  `git add engine.js engine.test.js && git commit -m "feat: stats engine"`

### Task 5: Legality and gold

**Files:**
- Modify: `engine.js`
- Test: `engine.test.js`, `engine.real.test.js` (loads the real `data.js` via
  `globalThis.window = {}; require('./data.js')`)

**Interfaces:**
- Consumes: `DATA.items`, `DATA.groups`, `DATA.runes` and `DATA.rules`.
- Produces:
  - `Engine.validateBuild(data, champ, items) -> string[]`, with error codes
    `too_many_items`, `group_limit:<groupId>`, `champion_only:<itemId>` and
    `no_boots_champion`.
  - `Engine.allowedItems(data, champ, items, slot) -> string[]`: ids that make a
    valid build if placed in `slot`, replacing what's there.
  - `Engine.pruneBuild(data, champ, items) -> {items, removed}`: walks the slots in
    order and drops each item that makes the build invalid.
  - `Engine.validateRunePage(data, page) -> string[]`, with codes `primary`,
    `keystone`, `primary_row:<0..2>`, `secondary`, `secondary_same_tree`,
    `secondary_row`, `secondary_same_row` and `shard:<0..2>`.
  - `Engine.normalizeRunePage(data, page) -> page`: sets every invalid field, and
    everything that depends on it, to `null`.
  - `Engine.buildCost(data, items) -> number`: the sum of `gold.total`.
  - `Engine.goldWarning(data, level, items) -> null | {cost, typical}`

- [ ] **Step 1: Write the failing fixture tests:**

```js
test('two boots', () => assert.deepEqual(Engine.validateBuild(D, 'Testo', ['boots', 'boots2']), ['group_limit:Boots']));
test('seven items', () => assert.ok(Engine.validateBuild(D, 'Testo', Array(7).fill('ls')).includes('too_many_items')));
test('cassiopeia boots', () => assert.deepEqual(Engine.validateBuild(D, 'Cassiopeia', ['boots']), ['no_boots_champion']));
test('champion-only, case-insensitive', () => {
  assert.deepEqual(Engine.validateBuild(D, 'Fiddlesticks', ['effigy']), []);        // requiredChampion "FiddleSticks"
  assert.deepEqual(Engine.validateBuild(D, 'Testo', ['effigy']), ['champion_only:effigy']); });
test('allowedItems keeps swap in same slot', () => {
  assert.ok(!Engine.allowedItems(D, 'Testo', ['boots', null], 1).includes('boots2'));
  assert.ok(Engine.allowedItems(D, 'Testo', ['boots', null], 0).includes('boots2')); });
test('pruneBuild on champion switch', () =>
  assert.deepEqual(Engine.pruneBuild(D, 'Cassiopeia', ['ls', 'boots']), {items: ['ls', null], removed: ['boots']}));
test('rune page valid', () => assert.deepEqual(Engine.validateRunePage(D, VALID_PAGE), []));
test('secondary same tree', () => assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, secondary: VALID_PAGE.primary}).includes('secondary_same_tree')));
test('secondary same row', () => assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, secondaryRunes: SAME_ROW_PAIR}).includes('secondary_same_row')));
test('normalize clears dependents', () => {
  const p = Engine.normalizeRunePage(D, {...VALID_PAGE, primary: OTHER_TREE});
  assert.equal(p.keystone, null); assert.deepEqual(p.primaryRunes, [null, null, null]); });
test('gold warning', () => {
  assert.deepEqual(Engine.goldWarning(D, 1, ['bf']), {cost: 1300, typical: 500});
  assert.equal(Engine.goldWarning(D, 18, ['bf']), null); });
```

- [ ] **Step 2: Write `engine.real.test.js`** against patch 16.23.1:
  - Jinx level 18 `total.hp` = 2395 and `total.armor` = 97.4 (rounded to 1
    decimal).
  - `validateBuild` for Annie with `['3089', '3089']` includes a `group_limit`
    error.
  - Ravenous Hydra `3074` plus Stridebreaker `6631` gives `group_limit:CleaveItems`.
  - `3006` plus `3020` gives `group_limit:Boots`.
  - Annie can't use the Kalista's Black Spear id, and Kalista can.
- [ ] **Step 3: Run the tests and confirm they fail.** Run `node --test`. Expected:
  the new tests fail.
- [ ] **Step 4: Implement the functions in `engine.js`.**
  - **Group counting:** for every group with a max in `data.groups`, count the
    build's items in that group (duplicates count). Report each group that's over
    its max once.
- [ ] **Step 5: Run the tests and confirm they pass.** Run `node --test`. Expected:
  all pass.
- [ ] **Step 6: Commit.**
  `git add engine.js engine.test.js engine.real.test.js && git commit -m "feat: build and rune page legality, gold warning"`

### Task 6: Page, languages, disclaimer

**Files:**
- Create: `i18n.js`, `i18n.test.js`, `app.js`, `index.html` (CSS inline),
  `README.md` ("run `./update.sh` after each patch, then open index.html")
- Create: `update.sh`, the one command for a patch update. It does this:
  1. `python3 prep.py "$@"`
  2. `python3 -m unittest -q test_prep`
  3. `python3 check.py`
  4. `node --test`

  It runs with `set -e`. At the end it prints
  `All good — patch <x> ready` or, when `check.py` failed on unreviewed
  passives, the list of ids to review with the line in `rules.py` to edit.
  `check.py` prints the ids it found; `update.sh` passes them through.

**Interfaces:**
- Consumes: everything `Engine` exports, and `DATA`.
- Produces:
  - in `i18n.js` (global `I18N` / `module.exports`):
    - `I18N.LABELS = {en: {...}, fr: {...}}`
    - `I18N.t(key, lang) -> string`
    - `I18N.loadLang(storage) -> 'en'|'fr'`
    - `I18N.saveLang(storage, lang) -> void`
    - `I18N.name(obj /* {en, fr} */, lang) -> string`
  - in `app.js`: `createPanel(container: HTMLElement, side: 'you'|'enemy') -> {getSelection(), setLang(lang)}`.
    Stage 1 creates one `'you'` panel. Stage 2 adds the second.

- [ ] **Step 1: Write the failing tests** in `i18n.test.js`:

```js
test('same keys in both languages', () => assert.deepEqual(Object.keys(I18N.LABELS.en).sort(), Object.keys(I18N.LABELS.fr).sort()));
test('loadLang default and throwing storage', () => {
  assert.equal(I18N.loadLang({getItem: () => null}), 'en');
  assert.equal(I18N.loadLang({getItem: () => { throw new Error('blocked'); }}), 'en');
  assert.equal(I18N.loadLang({getItem: () => 'fr'}), 'fr');
  assert.equal(I18N.loadLang({getItem: () => 'de'}), 'en'); });
test('saveLang swallows errors', () => assert.doesNotThrow(() => I18N.saveLang({setItem() { throw new Error('blocked'); }}, 'fr')));
```

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test`. Expected: the
  `i18n` tests fail.
- [ ] **Step 3: Implement `i18n.js`.** It holds every label the page shows: stat
  names, the section titles (Champion, Level, Runes, Items, Stats, Base, Bonus,
  Total), the "assume fully stacked" switch, the gold warning sentence, the
  "removed because…" notice, flag texts, and the disclaimer copied exactly from
  Global Constraints.
- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --test`. Expected:
  all pass.
- [ ] **Step 5: Implement `index.html` and `app.js`.**
  - **Load order:** `data.js`, `engine.js`, `i18n.js`, `app.js`.
  - **Header:** the title "LoL Build Calculator", the patch number, and an EN/FR
    button.
  - **Panel:**
    - a champion `<select>`, sorted by name in the current language,
    - level as `<input type=range min=1 max=18>` plus `<input type=number>`, both
      passed through `clampLevel`,
    - a stack-count input, shown only for `rules.stackers` champions.
  - **Rune selects:**
    - primary tree, keystone, 3 rows,
    - secondary tree (the primary tree excluded), 2 runes,
    - 3 shard rows,
    - an "assume fully stacked" checkbox.

    Every change goes through `normalizeRunePage`.
  - **Item slots:** 6 `<select>`s, each filled from `allowedItems` for its slot and
    grouped with `<optgroup>`, checked in this order:
    1. Boots (`boots` true)
    2. Starter (tier 1)
    3. Legendary (tier 5)
    4. Components (everything else)

    A champion change runs `pruneBuild` and shows the removed items in a notice.
  - **Below:** the build cost, the gold warning when it applies, and a stats table
    with Base, Bonus and Total columns for every canonical key that's non-zero.
    Every `flags` entry shows as a warning line.
  - **Footer:** the disclaimer.
  - **Language switch:** re-renders all labels and names with no reload and keeps
    every selection.
  - **Responsive layout:** at 375px wide the panel stacks into one column with no
    horizontal scroll.
- [ ] **Step 6: Verify by hand in the browser.** Open `index.html`. Check that:
  - Jinx at level 18 with no items shows Health 2395.
  - After choosing Berserker's Greaves, no other boots are offered in the other
    slots.
  - Switching to Cassiopeia removes the boots and shows the notice.
  - With Rabadon's Deathcap, the AP total is ×1.3.
  - FR switches champion and item names to French. After a reload FR is still
    active.
  - The disclaimer is visible in both languages.
  - At 375px wide there's no horizontal scroll.
- [ ] **Step 7: Run the whole suite.** Run
  `python3 -m unittest test_prep -v && python3 check.py && node --test`.
  Expected: all pass.
- [ ] **Step 8: Commit.**
  `git add i18n.js i18n.test.js app.js index.html README.md && git commit -m "feat: stat calculator page with EN/FR switch"`
