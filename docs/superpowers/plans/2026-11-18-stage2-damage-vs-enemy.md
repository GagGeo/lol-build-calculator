# Stage 2: Damage Against an Enemy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second champion panel (the enemy) with the same choices. For each side the page shows:
- basic attack and per-spell damage against the other side, after resistances,
- an ordered combo, with the target's HP left or "kills".

Damage runes and item damage effects are counted, and anything the tool can't compute is flagged "check in game".

**Architecture:**
- `prep.py` also downloads each champion's Data Dragon file (spell names, ranks, tooltips) and the English game text table (passive tooltips). It turns CommunityDragon spell formulas into small normalized formula trees, and parses tooltips into "damage lines" (damage type plus terms).
- `engine.js` evaluates formulas, skill ranks, resistances and the combo. `rules.py` holds hand-written damage rules for runes and items.
- `app.js` instantiates the existing panel twice and adds the combo UI.

**Tech Stack:** unchanged. Python 3 standard library, Node `node --test`, plain HTML/JS.

**Spec:** `docs/superpowers/specs/2026-11-17-lol-build-calculator-design.md` (section "Damage", stage 2).
**Builds on:** stage 1 (`docs/superpowers/plans/2026-11-18-stage1-stat-calculator.md`), already merged in `main`.

## Global Constraints

- Everything from stage 1's Global Constraints still holds, including:
  - no packages,
  - works from `file://`,
  - EN/FR,
  - nothing silently dropped,
  - no Co-Authored-By trailer.
- **New data sources**, cached like the others:
  - `https://ddragon.leagueoflegends.com/cdn/<patch>/data/<en_US|fr_FR>/champion/<Id>.json`
  - `https://raw.communitydragon.org/<major.minor>/game/en_us/data/menu/en_us/lol.stringtable.json` (English only. There is no French table at this path, and it's used only for parsing.)
- **Game value lists are indexed by rank.** `values[1]` is rank 1 and `values[0]` is unused. For example, Annie Q `BaseDamage` = `[35, 80, 125, 170, 215, 260, 305]`, so rank 1 = 80.
- **Stat codes in formulas (`mStat`; a missing key means 0):**

  | Code | Stat |
  |---|---|
  | 0 | ap |
  | 1 | armor |
  | 2 | ad |
  | 4 | as |
  | 6 | mr |
  | 7 | ms |
  | 8 | crit |
  | 9 | critDmg |
  | 12 | hp |
  | 29 | lethality |

  Any other code makes the term unsupported.
- **Stat basis (`mStatFormula`; missing means 0):** 0 = total, 1 = base, 2 = bonus.
- **Engine units, converted when a formula reads them:**
  - `as`: bonus is a percentage; formulas read bonus/100, and total in attacks per second.
  - `crit`: percentage; formulas read /100.
  - `critDmg`: formulas read the total crit multiplier = `rules.critBase` (1.75) + bonus critDmg/100.
- **Resistance after the attacker's penetration**, for R = target total armor (physical) or MR (magic):
  - If R > 0: `R' = max(0, R × (1 − shredPct) × (1 − penPct/100) − flatPen)`.
  - Otherwise R' = R.
  - Multiplier: `100/(100+R')` if R' ≥ 0, else `2 − 100/(100−R')`.
  - flatPen is `lethality` for physical damage and `magicPen` for magic. penPct is `armorPenPct` or `magicPenPct`. True damage is not reduced.
  - `rules.lethalityFlat: true` treats lethality as flat penetration. Ruling to verify in game; if lethality scales with level, change this one rule.
- **Adaptive damage** is physical when attacker bonus AD > total AP, magic when lower. On a tie it follows the champion's `adaptiveAP`.
- **Default skill order:**
  - Levels 1/2/3 take Q/W/E.
  - R ranks up at 6/11/16.
  - Other levels go to the first ability in the priority (default Q, W, E) that is below its max rank and below the cap for basic abilities at level L, `floor((L+1)/2)`.
- **Default combo:** Q, W, E, then 3 basic attacks, then R. The order and the number of attacks are editable.
- **Target's current HP:** a percentage per panel, clamped 1–100, default 100. The combo runs in order against the running HP.

### Formula tree shape (prep → `DATA.champions[id].spells[i].calcs`)

| Node | Comes from | Value |
|---|---|---|
| `{t:'v', name}` | NamedDataValueCalculationPart | `values[name][rank]` (0 if missing) |
| `{t:'n', n}` | NumberCalculationPart | n |
| `{t:'stat', stat, basis, coef: node}` | StatByCoefficient (`coef {t:'n'}`) / StatByNamedDataValue (`coef {t:'v'}`) | stat × coef |
| `{t:'statOf', stat, basis, part: node}` | StatBySubPartCalculationPart | stat × part |
| `{t:'lvlBp', start, bps: [[level, add], …]}` | ByCharLevelBreakpoints | start + Σ add for bps with level ≤ champion level |
| `{t:'lvlLerp', a, b}` | ByCharLevelInterpolation | a + (b−a)(L−1)/17 |
| `{t:'sum', parts}` / `{t:'prod', a, b}` | SumOfSubParts / ProductOfSubParts | sum / product |
| `{t:'ref', name}` | `{f3cbe7b2}` with `mSpellCalculationKey` | value of another calc in the same spell |
| `{t:'x', what}` | anything else (BuffCounter…, CooldownMultiplier, AbilityResource, unknown hashes, unknown `mStat`, breakpoint keys other than mLevel/mAdditionalBonusAtThisLevel) | unsupported |

A calc is `{parts: [node], pct: bool, mult: node|null, flags: []}`, built as follows:
- **GameCalculation:** `parts` is the sum, `pct` comes from `mDisplayAsPercent`, and `mult` comes from `mMultiplier`.
- **GameCalculationModified:** `{parts: [{t:'ref', name: mModifiedGameCalculation}], mult: node}`.
- **GameCalculationConditional:** `{parts: [{t:'ref', name: mDefaultGameCalculation}], flags: ['conditional']}`.

### Spell shape (`DATA.champions[id].spells`, keys P, Q, W, E, R in that order)

```js
{ key: 'Q', id: 'AnnieQ', name: {en, fr}, maxrank: 5,
  values: { BaseDamage: [..] /* only names referenced by calcs or lines */ },
  calcs: { TotalDamage: <calc> },
  lines: [ { type: 'magic'|'physical'|'true', terms: [ { calc|value: 'TotalDamage', kind: 'flat'|'targetMax'|'targetMissing'|'targetCurrent' } ] } ],
  flags: [ 'no_cdragon_spell' | 'unparsed_tooltip' | ... ] }
```

The passive (`key: 'P'`) has `maxrank: 1` and is evaluated at rank 1.

### Hand damage rules (`rules.py`, new keys)

`runeDamage` and `itemDamage` map an id to a list of effects. The effect kinds are a closed set:

| kind | When it applies in the combo | Fields |
|---|---|---|
| `proc` | once, at the step where the attacker's hit count reaches `hits` (1 = first hit) | `type`, `base`, `ratios` |
| `onHit` | each basic attack (every `every` attacks, default 1) | `type`, `base`, `ratios` |
| `spellblade` | the first basic attack after each spell, at most once per spell | `type`, `base`, `ratios` |
| `afterSpell` | once, after the first damaging spell | `type`, `base`, `ratios` |
| `amp` | multiplies the damage of each matching hit | `pct`, `condition`, `applies` |
| `shred` | after each matching hit, lowers the target's resist for later steps | `stat`, `pctPerStack`, `maxStacks`, `on` |

- **`base`:** a number, or `[atLevel1, atLevel18]` interpolated by attacker level.
- **`type`:** `physical|magic|true|adaptive`.
- **`ratios`** keys:
  - attacker: `ad`, `bonusAd`, `baseAd`, `ap`, `hp`, `bonusHp`,
  - target: `targetMaxHp`, `targetCurrentHp`, `targetMissingHp`.

  Values are fractions.
- **`amp.condition`:**
  - `always`
  - `targetBelow:<pct>`
  - `targetBonusHp:<capHp>`: pct scales 0→pct as target bonus HP goes 0→capHp
  - `targetMoreMaxHp`: pct is `[min, max]`, scaled 10%→100% max HP difference
  - `afterHits:<n>`
- **`amp.applies`:** `all|spells|autos|magicTrue`.
- **`shred.on`:** `physical|magic`.

Bookkeeping lists in the same file:
- `runeDamageNone` / `itemDamageNone`: flagged, but no damage inside one combo.
- `runeDamageUnknown` / `itemDamageUnknown`: shown with "check in game".

`check.py` requires every rune or item whose English description mentions damage to be sorted into one of the three. The stage 1 stale-rule check also covers the keys of `runeDamage` and `itemDamage`.

## Review Focus

1. **A spell not learned yet at this level** (e.g. R before 6): shown as "not learned", skipped in the combo, never counted as 0 damage silently. Tested in Task 4.
2. **Target resist pushed below 0** by shred: the `2 − 100/(100−R)` branch is used and damage goes above raw. Tested in Task 4.
3. **Current HP typed as 0, more than 100, or text:** clamped to 1–100. The combo stops counting once the target is dead and shows "kills at step N". Tested in Task 5.
4. **Champions with unusual skill ranks** (Udyr 6 ranks and no R, Jayce/Elise/Nidalee R from level 1, Aphelios with no basic ranks): ranks still follow `maxrank`, a `custom_skill_ranks` flag shows, and nothing crashes. Tested in Task 4 and `check.py`.
5. **A spell whose damage tags exist but whose numbers can't be read:** that spell's line is flagged "check in game", and the combo total states that it excludes it. Spells with no damage at all (e.g. Janna R) show "no damage" with no flag. Tested in Tasks 2 and 5.

---

### Task 1: Formula normalization

**Files:** Modify `prep.py`, test `test_prep.py`.

**Interfaces:**
- Produces `normalize_calc(calc: dict) -> dict` (the calc shape above) and `normalize_part(part: dict) -> dict` (node).

- [ ] **Step 1: Write the failing tests** (fixtures copied from real 16.23 data):

```python
ANNIE_Q = {"mFormulaParts": [{"mDataValue": "BaseDamage", "__type": "NamedDataValueCalculationPart"},
                             {"mDataValue": "APRatio", "__type": "StatByNamedDataValueCalculationPart"}],
           "__type": "GameCalculation"}
def test_annie_q(self):
    self.assertEqual(normalize_calc(ANNIE_Q), {"parts": [{"t": "v", "name": "BaseDamage"},
        {"t": "stat", "stat": "ap", "basis": "total", "coef": {"t": "v", "name": "APRatio"}}],
        "pct": False, "mult": None, "flags": []})
def test_bonus_ad_coefficient(self):   # {"mStat": 2, "mStatFormula": 2, "mCoefficient": 1.5, "__type": "StatByCoefficientCalculationPart"}
    → {"t": "stat", "stat": "ad", "basis": "bonus", "coef": {"t": "n", "n": 1.5}}
def test_max_health_code_12(self): → stat "hp"
def test_level_breakpoints(self):     # mLevel1Value 10, breakpoints (7, +5), (13, +5)
    → {"t": "lvlBp", "start": 10, "bps": [[7, 5], [13, 5]]}
def test_level_interpolation(self):   → {"t": "lvlLerp", "a": 40, "b": 210}
def test_sum_product_ref(self):       # Sum of [Number 1, Product(Value, {f3cbe7b2} key "MaxHPDamage")]
def test_modified_and_conditional(self):
    # GameCalculationModified → parts [ref], mult node; Conditional → parts [ref default], flags ["conditional"]
def test_unknown_part_and_stat_are_unsupported(self):
    # BuffCounterByCoefficientCalculationPart → {"t": "x", "what": "BuffCounterByCoefficientCalculationPart"}
    # StatByCoefficient with mStat 15 → {"t": "x", "what": "mStat 15"}
def test_percent_display(self):       # mDisplayAsPercent true → pct True
```

- [ ] **Step 2: Run them and confirm they fail.** Run `python3 -m unittest test_prep -v`. Expected: an `ImportError` for `normalize_calc`.
- [ ] **Step 3: Implement `normalize_part` and `normalize_calc` in `prep.py`.** Use a dict for the stat-code mapping, with the codes from Global Constraints.
- [ ] **Step 4: Run the tests and confirm they pass.** Expected: all OK.
- [ ] **Step 5: Commit.** `git commit -am "feat: normalize spell formulas"`

### Task 2: Tooltip damage lines, spells and passives in prep

**Files:**
- Modify `prep.py`, `check.py`.
- Test `test_prep.py`.
- Regenerate `data.js` and `data/`.

**Interfaces:**
- Consumes `normalize_calc` (Task 1).
- Produces:
  - `parse_damage_lines(tooltip: str, calc_names: set[str], value_names: set[str]) -> tuple[list[dict], list[str]]`, returning `(lines, flags)`.
  - `build_spells(dd_champ_en: dict, dd_champ_fr: dict, bin_data: dict, record: dict, strings: dict) -> list[dict]`, the spell list shape above (P, Q, W, E, R).
  - Every champion in `DATA.champions` gets a `spells` list.

- [ ] **Step 1: Write the failing tests:**

```python
def test_annie_q_line(self):
    lines, flags = parse_damage_lines("deals <magicDamage>{{ totaldamage }} magic damage</magicDamage>.", {"TotalDamage"}, set())
    self.assertEqual(lines, [{"type": "magic", "terms": [{"calc": "TotalDamage", "kind": "flat"}]}]); self.assertEqual(flags, [])
def test_garen_r_value_terms_and_missing_health(self):
    t = "dealing <trueDamage>{{ basedamage }} plus {{ executedamage*100 }}% missing Health true damage</trueDamage>."
    lines, _ = parse_damage_lines(t, set(), {"BaseDamage", "ExecuteDamage"})
    self.assertEqual(lines[0]["terms"], [{"value": "BaseDamage", "kind": "flat"}, {"value": "ExecuteDamage", "kind": "targetMissing"}])
def test_vayne_w_max_health(self):
    lines, _ = parse_damage_lines("<trueDamage>{{ totaldamage }} max Health true damage</trueDamage>", {"TotalDamage"}, set())
    self.assertEqual(lines[0]["terms"][0]["kind"], "targetMax")
def test_string_table_placeholders(self):   # "@TotalDamage@" syntax, same result as {{ totaldamage }}
def test_current_health(self):               # "{{ x }}% current Health" → targetCurrent
def test_unresolved_placeholder_flags(self):
    lines, flags = parse_damage_lines("<physicalDamage>{{ mystery }} physical damage</physicalDamage>", set(), set())
    self.assertEqual(lines, []); self.assertEqual(flags, ["unparsed_tooltip"])
def test_no_damage_tags_no_flag(self):       # utility tooltip → ([], [])
def test_build_spells_order_and_ranks(self):
    # fixture: record spellNames ["AnnieQAbility/AnnieQ", ...], passive "Characters/Annie/Spells/AnniePassiveAbility/AnniePassive",
    # bin with that spell path, DD spells with maxrank and tooltips; strings {"spell_anniepassive_tooltip": "..."}
    # → keys ["P", "Q", "W", "E", "R"]; Q maxrank 5; Q values trimmed to referenced names; P maxrank 1
def test_build_spells_missing_bin_spell_flags(self):   # → flags ["no_cdragon_spell"], lines from values only
```

- [ ] **Step 2: Run them and confirm they fail.** Expected: `ImportError`.
- [ ] **Step 3: Implement `parse_damage_lines` and `build_spells`.**
  - **Damage segments:** `<(physicalDamage|magicDamage|trueDamage)>(.*?)</\1>`.
  - **Placeholders:** `\{\{\s*([A-Za-z_]\w*)(\s*\*\s*[\d.]+)?\s*\}\}` or `@([A-Za-z_]\w*)(\*[\d.]+)?@`. The `*N` display scale is dropped.
  - **Name lookup:** case-insensitive, calc names first, then value names.
  - **`kind`:** taken from the text after the placeholder up to the next placeholder or the segment end:
    - `max(imum)? Health` → `targetMax`
    - `missing Health` → `targetMissing`
    - `current Health` → `targetCurrent`
    - otherwise `flat`
  - **Flag:** a segment with placeholders but no resolved term flags `unparsed_tooltip`.
  - **Bin spell lookup:** key `Characters/<Name>/Spells/<spellNames[i]>`, matched case-insensitively. `DataValues` entries use `name`/`values` or `mName`/`mValues`; read both.
  - **Passive tooltip:** string key `spell_<passive spell name lowercased>_tooltip`, resolving `{{ key }}` references to other string keys once.
  - **Ranks:** maxrank from Data Dragon. If R maxrank ≠ 3, or any basic maxrank ≠ 5, add `custom_skill_ranks` to the champion's `flags`.
  - **`main()`:**
    - downloads the per-champion Data Dragon files (en, fr) and the string table, with 8 threads, cached,
    - adds `spells`,
    - adds report sections "Spells with unparsed damage" and "Unsupported formula parts" (counts by `what`),
    - adds a coverage line: % of damage lines whose calcs have no `t:'x'` node.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Run the real prep.** Run `python3 prep.py 16.23.1`. Expected:
  - the counts print,
  - the report shows coverage,
  - `data.js` grows by less than 3 MB.
- [ ] **Step 6: Extend `check.py`.**
  - Annie Q: `values.BaseDamage[1] == 80`, and the Q lines have type `magic`.
  - Garen R has a `targetMissing` term.
  - Vayne W has a `targetMax` term.
  - Every champion has 5 spells.
  - Udyr, Jayce, Elise and Nidalee carry `custom_skill_ranks`.
  - Overall coverage is at least 80% (record the actual number in the commit message).
- [ ] **Step 7: Run `./update.sh 16.23.1` and confirm it passes.** Expected: All good.
- [ ] **Step 8: Commit** with the regenerated data. `git commit -am "feat: spell damage lines and formulas in data"`

### Task 3: Formula evaluation and skill ranks

**Files:** Modify `engine.js`, `fixture.js`, test `engine.test.js`.

**Interfaces:**
- Consumes the spell shape (Task 2) and `championStats` (stage 1).
- Produces:
  - `Engine.evalCalc(spell, name, ctx) -> {value: number, unsupported: string[]}` with `ctx = {rank, level, stats /* championStats result */, rules}`.
  - `Engine.skillRanks(champ, level, priority = ['Q','W','E']) -> {Q, W, E, R}`.

- [ ] **Step 1: Write the failing tests.** Add an `Annie`-like spell to `fixture.js`: `values.BaseDamage [35,80,125,…]`, `APRatio [0.8…]`, `calcs.TotalDamage` as normalized.

```js
test('annie q rank 1 no ap', () => near(Engine.evalCalc(QSPELL, 'TotalDamage', ctx({rank: 1})).value, 80));
test('annie q rank 1 with 100 ap', () => near(Engine.evalCalc(QSPELL, 'TotalDamage', ctx({rank: 1, ap: 100})).value, 160));
test('bonus ad basis', ...);                 // stat ad basis bonus reads stats.bonus.ad
test('crit damage reads total multiplier', ...); // critDmg → rules.critBase + bonus/100
test('level breakpoints and interpolation', ...); // lvlBp at level 13 = 20; lvlLerp(40,210) at 18 = 210
test('ref, sum, product, mult', ...);
test('unsupported node reported', () => assert.deepEqual(Engine.evalCalc(XSPELL, 'Bad', ctx({rank: 1})).unsupported, ['BuffCounterByCoefficientCalculationPart']));
test('default ranks level 1/6/18', () => {
  assert.deepEqual(Engine.skillRanks(STD, 1), {Q: 1, W: 0, E: 0, R: 0});
  assert.deepEqual(Engine.skillRanks(STD, 6), {Q: 3, W: 1, E: 1, R: 1});
  assert.deepEqual(Engine.skillRanks(STD, 18), {Q: 5, W: 5, E: 5, R: 3}); });
test('priority E first', () => assert.equal(Engine.skillRanks(STD, 9, ['E','Q','W']).E, 5));
test('basic rank cap by level', () => assert.ok(Engine.skillRanks(STD, 4).Q <= 2));
test('custom ranks follow maxrank', () => assert.ok(Engine.skillRanks(UDYR_LIKE /* 6 ranks, R maxrank 0 */, 18).Q <= 6));
```

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test`.
- [ ] **Step 3: Implement `evalCalc` and `skillRanks`.**
  - Recursive node evaluation with a visited set to stop ref cycles; a cycle counts as unsupported.
  - `pct` calcs return the raw fraction.
  - Ranks are clamped to each spell's `maxrank`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat: evaluate spell formulas and skill ranks"`

### Task 4: Resistances, basic attacks, single spell damage

**Files:** Modify `engine.js`, `rules.py` (`critBase: 1.75`, `lethalityFlat: True`), test `engine.test.js`.

**Interfaces:**
- Produces:
  - `Engine.mitigate(raw, type, attacker /* stats */, target /* stats */, shred = {armor: 0, mr: 0}) -> number`
  - `Engine.autoAttack(attacker, target, rules) -> {nonCrit, crit, average}` (after mitigation)
  - `Engine.spellDamage(data, side /* {champ, level, priority, stats} */, target /* {stats, currentHp} */, key, lineIndex = 0) -> {learned: bool, rank, raw, damage, type, unsupported: string[]}`.

- [ ] **Step 1: Write the failing tests:**

```js
test('armor 100 halves physical', () => near(Engine.mitigate(200, 'physical', A0, T({armor: 100})), 100));
test('true ignores resist', () => near(Engine.mitigate(200, 'true', A0, T({armor: 300})), 200));
test('pct pen then lethality', () => near(Engine.mitigate(100, 'physical', A({armorPenPct: 30, lethality: 10}), T({armor: 100})), 100 * 100 / (100 + 60)));
test('pen cannot go below zero', () => near(Engine.mitigate(100, 'physical', A({lethality: 500}), T({armor: 50})), 100));
test('negative resist amplifies', () => near(Engine.mitigate(100, 'magic', A0, T({mr: -20})), 100 * (2 - 100 / 120)));
test('shred applies before pen', () => near(Engine.mitigate(100, 'physical', A0, T({armor: 100}), {armor: 0.3, mr: 0}), 100 * 100 / 170));
test('auto attack crit average', () => { const r = Engine.autoAttack(A({ad: 100, crit: 50}), T({armor: 0}), RULES);
  near(r.nonCrit, 100); near(r.crit, 175); near(r.average, 137.5); });
test('spell not learned', () => assert.equal(Engine.spellDamage(D2, side({level: 3}), tgt(), 'R').learned, false));
test('missing health term uses current hp', () => near(Engine.spellDamage(D2, side({level: 6}), tgt({maxHp: 1000, currentHp: 400}), 'R').raw, BASE_R1 + 0.25 * 600));
test('max health term', ...);
test('unsupported spell reports what', ...);
```

- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - A term's value for a `target*` kind is a fraction: if the raw value is > 1, divide by 100.
  - `adaptive` is resolved with the Global Constraints rule.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat: resistances, basic attacks and spell damage"`

### Task 5: Combo with damage rules

**Files:** Modify `engine.js`, `fixture.js`, test `engine.test.js`.

**Interfaces:**
- Consumes `spellDamage`, `autoAttack` and `mitigate` (Task 4), plus `rules.runeDamage` and `rules.itemDamage`.
- Produces
  `Engine.runCombo(data, attacker /* {champ, level, priority, items, runes, stats} */, target /* {champ, stats, currentHpPct} */, steps) -> {rows: [{step, label, damage, hpAfter, note}], hpStart, hpLeft, killsAt: number|null, excluded: string[], flags: string[]}`.
  - `steps` is a list of `{spell: 'Q'}` or `{autos: n}`.
  - `Engine.DEFAULT_COMBO = [{spell:'Q'},{spell:'W'},{spell:'E'},{autos:3},{spell:'R'}]`.

- [ ] **Step 1: Write the failing tests** with fixture rules covering each effect kind:

```js
test('current hp clamped', () => { assert.equal(combo({currentHpPct: 0}).hpStart, maxHp * 0.01); assert.equal(combo({currentHpPct: 250}).hpStart, maxHp); });
test('kills at step and stops', () => { const r = combo({currentHpPct: 5}); assert.equal(r.killsAt, 1); assert.equal(r.rows.length, 1); });
test('missing health spell last sees damage already dealt', ...);
test('unlearned spell row says not learned and adds nothing', ...);
test('unsupported spell is excluded and listed', () => assert.deepEqual(combo({}, BAD_STEPS).excluded, ['Q']));
test('proc triggers once on third hit (electrocute-like)', ...);
test('onHit every 3rd attack (kraken-like)', ...);
test('spellblade after each spell, once', ...);
test('afterSpell once', ...);
test('amp targetBelow only under threshold', ...);
test('amp targetBonusHp scales', ...);
test('shred lowers resist for later steps only', ...);
test('adaptive proc picks physical for AD champion', ...);
test('unknown item or rune damage effect is flagged', ...);
```

- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement `runCombo`.**
  - Each step:
    1. computes raw damage per hit,
    2. applies matching `amp`s,
    3. mitigates with the current shred,
    4. subtracts it from the running HP,
    5. updates the hit count and shred stacks.
  - A basic-attack step of n attacks is n hits.
  - A spell step is 1 hit.
  - Proc and onHit damage shows as its own row note on the step that triggers it.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat: ordered combo with rune and item damage effects"`

### Task 6: Fill the damage rules from real data

**Files:**
- Modify `prep.py`, `rules.py`, `check.py`.
- Regenerate `data.js` and `data/`.

- [ ] **Step 1: Add review lists in prep.**
  - `DATA.review.possibleRuneDamage`: rune ids whose English description matches `/damage/i`.
  - `DATA.review.possibleItemDamage`: item ids whose description outside `<stats>` matches `/damage/i`.
  - Both are listed in the report.
- [ ] **Step 2: Extend `check.py`.**
  - Every id in the two lists must be in `runeDamage`/`runeDamageNone`/`runeDamageUnknown` (or the item equivalents). Otherwise print `REVIEW …` and exit 1.
  - The stale-rule check also covers `runeDamage` and `itemDamage` keys.
- [ ] **Step 3: Run the check and confirm it fails.** Run `./update.sh 16.23.1`. Expected: REVIEW lines (this is the failing step).
- [ ] **Step 4: Sort every listed id.**
  - Values come from CommunityDragon `mDataValues` (items: `cache/<patch>/cd/game/items.cdtb.bin.json`) and the rune descriptions in `DATA.runes.byId[id].desc.en`.
  - Cover at least:
    - Runes: Electrocute, Arcane Comet, Dark Harvest (with "assume fully stacked" souls = 0), First Strike, Press the Attack, Coup de Grace, Cut Down, Grasp of the Undying, Scorch.
    - Items: Kraken Slayer, Blade of the Ruined King, Nashor's Tooth, Wit's End, Guinsoo's (30 on-hit), Sheen, Trinity Force, Lich Bane, Iceborn Gauntlet, Luden's, Liandry's (6% max HP once per combo, plus up to 6% amp), Blackfire, Lord Dominik's, Shadowflame, Black Cleaver, Bloodletter's Curse, Riftmaker (8% amp), Stormsurge, Hullbreaker, Voltaic Cyclosword, Profane Hydra / Ravenous Hydra (cleave = not single target → None).
  - Anything that needs more than one combo, a second target or a timer goes to `…None` with a comment, or to `…Unknown` if it is real single-target damage the effect kinds can't express.
- [ ] **Step 5: Run the update and confirm it passes.** Run `./update.sh 16.23.1`. Expected: All good.
- [ ] **Step 6: Add a real-data test in `engine.real.test.js`.** Annie level 1, rank-1 Q, no items, against a target with 0 MR at 100% HP: Q deals exactly 80. Run `node --test`; it passes.
- [ ] **Step 7: Commit.** `git commit -am "feat: rune and item damage rules for 16.23"`

### Task 7: Enemy panel, combo UI, labels

**Files:** Modify `app.js`, `index.html`, `i18n.js`, `i18n.test.js`.

**Interfaces:**
- Consumes everything above.
- `createPanel(container, side)` gains these selection fields: `currentHpPct`, `priority`, `combo`.
- `getSelection()` returns them.
- A new `renderMatchup(you, enemy)` draws each side's results.

- [ ] **Step 1: Write the failing test.** `i18n.test.js`: the new keys exist in both languages:
  - `enemy`, `currentHp`, `skillOrder`, `combo`, `autos`, `notLearned`, `kills`, `hpLeft`,
  - `damageTo`, `noDamage`, `excludedNote`, `customRanks`,
  - `type_physical`, `type_magic`, `type_true`.
- [ ] **Step 2: Run it and confirm it fails.** Run `node --test i18n.test.js`.
- [ ] **Step 3: Implement.**
  - **Layout:** two panels side by side at ≥ 1100px, stacked below that. Each panel gets:
    - a current HP % input (1–100),
    - a skill priority select (the 6 orders of Q/W/E),
    - a combo editor: one row per step with up/down buttons, a remove button, and the attack count for basic-attack steps. Below it, an "add step" select (P, Q, W, E, R, basic attacks) with an add button, and a "reset" button that restores `DEFAULT_COMBO`.
  - **Under each panel, "Damage to <other champion>":**
    - basic attack (non-crit / crit / average),
    - each spell: rank (or "not learned"), its damage lines with type and amount after resistances, and % of target max HP,
    - the combo table: step, damage, HP left; then "kills at step N" or "leaves X HP (Y%)",
    - every flag as a notice, including excluded spells and `custom_skill_ranks`.
  - **Text:** all labels through `I18N`, with no tooltip text shown.
  - **Accessibility:** the move buttons have `aria-label`s.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Verify by hand in the browser**, served with `.claude/launch.json` "page":
  - Annie level 1 with rank-1 Q against an enemy with 0 bonus MR shows Q damage = 80 × 100/(100 + that enemy's MR).
  - Garen level 6 R against an enemy at 30% HP shows more damage than against 100% HP.
  - Setting current HP to 0 shows 1%.
  - Removing the R step updates the total.
  - FR labels work.
  - At 375px wide there's no horizontal scroll.
- [ ] **Step 6: Run the full suite.** Run `./update.sh 16.23.1`. Expected: All good.
- [ ] **Step 7: Commit.** `git commit -am "feat: enemy panel and combo view"`
