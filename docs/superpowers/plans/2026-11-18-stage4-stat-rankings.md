# Stage 4: Stat Rankings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Rankings" tab where the user picks one stat (e.g. Health or Move Speed). It shows the N best combinations (champion, level, 6 items, rune page) that maximize that stat, one row per champion. A button opens a row's build in the calculator.

**Architecture:**
- `engine.js` gains three functions:
  - `bestBuilds`: a beam search over items, scored by the real `championStats`, on a reference champion.
  - `bestRunePage`: the rune page and shards that add the most to the stat.
  - `rankStat`: re-scores the top builds on every champion exactly, adds their best runes, then ranks.
- `app.js` gains tabs and the rankings view.

No prep or data changes.

**Tech Stack:** unchanged.

**Spec:** `docs/superpowers/specs/2026-11-17-lol-build-calculator-design.md`, section "Stage 4: stat rankings".
**Builds on:** stages 1–3 (merged), and the live site and workflow.

## Global Constraints

- Stage 1–3 constraints still hold: no packages, works from `file://`, EN/FR, nothing silently dropped, no Co-Authored-By trailer.
- **Rankable stats** (`Engine.RANKABLE_STATS`): `hp, mp, ad, ap, armor, mr, as, ah, ms, crit, lethality, armorPenPct, magicPen, magicPenPct, lifesteal, omnivamp, hsp, tenacity, hpregen, mpregen`.
  - The value ranked is `championStats(...).total[stat]`: attack speed in attacks per second (capped), move speed after soft caps, crit capped at 100.
  - `mp` only ranks champions whose `resource` is `"Mana"`.
- **Options:**

  | Option | Default | Range |
  |---|---|---|
  | `stat` | — | one of the above |
  | `level` | 18 | 1–18, `clampLevel` |
  | `count` | 10 | 1–50 |
  | `maxGold` | `null` (no limit) | — |
  | `stacked` | `true` | — |
  | `stacks` | 0 | — |

  `stacked` matches the calculator's "assume fully stacked". `stacks` applies only to `rules.stackers` champions.
- **Beam search (`bestBuilds`).**
  - **Candidates** are every item with a non-zero contribution to the stat on the reference champion (the champion with id `Annie` if present, else the first id). That covers base stats, `add`/`stacked` passives, and any `mulTotal`/`convert` passive targeting the stat. Keep at most the top 30 by contribution, plus, with `maxGold`, the top 15 by contribution per gold.
  - **Start** from the empty build. Run 6 rounds. Each round adds one candidate to every kept build, keeping a build only if it:
    - passes `validateBuild` on the reference champion,
    - has total gold within `maxGold`,
    - is new as a sorted multiset.

    Score with `championStats`, keep the best `beam` = 200 builds, and also keep every finished build seen.
  - **Return** the best `keep` = 60 builds by score, any size from 0 to 6 items.
- **Per champion (`rankStat`).**
  1. Score each of the 60 builds that is legal for that champion (`validateBuild`: Cassiopeia's no-boots rule, champion-only items) with `runes: null`.
  2. Take the best 3.
  3. For each, add `bestRunePage`.
  4. Keep the best total.

  If none of the 60 is legal for the champion, run `bestBuilds` with that champion as the reference.
- **Rune page (`bestRunePage`).**
  - **Shards:** each shard row picks the shard with the highest value, rows evaluated in order with the others fixed.
  - **Contributing runes:** runes whose `rules.runeStats` entries apply (`always`, or `stacked` when the option is on) and touch the stat (`adaptive` counts for `ad` and `ap`).
  - **Page search:** enumerate legal pages using any subset of contributing runes. Every row without one is filled with that row's first rune. The best is kept.
  - **No contributing runes:** the page is the first legal page plus the best shards.
- **Rows:**

  ```
  {rank, champ, level, value, items: (id|null)[6], runes: page, flags: string[]}
  ```

  - **Order:** `value` descending, ties by champion name.
  - **Equal rank:** equal values (rounded to 0.1) share a rank.
  - **`flags`:** `partly_counted:item:<id>` for items in `itemStatPassivesUnknown`, and `partly_counted:champion:<id>` for `championStatsUnknown`.
- **Run on click only.** The target is under 2 s for any stat at level 18 with no gold limit. The real-data test asserts under 3 s.

## Review Focus

1. **Capped stats** (crit 100, attack speed 2.5, move speed soft caps): many champions tie. They share a rank, nothing shows over the cap, and no NaN. Tested in Task 2.
2. **Cassiopeia (no boots) and other champion-specific legality:** her row never contains boots, and every row passes `validateBuild` for its champion. Tested in Task 2.
3. **A gold limit lower than any useful item:** rows show champions with base stats only (empty items), not an error. Tested in Task 2.
4. **Stacking champions:** with stacks at 0, Veigar isn't boosted. With stacks at 100, Veigar's AP includes them. Tested in Task 2.
5. **Opening a row in the calculator:** the "You" panel gets exactly that champion, level, items, runes and stacked setting, and the stats shown match the row's value. Tested in Task 3.

---

### Task 1: Beam search over items

**Files:** Modify `engine.js` and `fixture.js`; test `engine.test.js`.

**Interfaces:**
- Produces:
  - `Engine.RANKABLE_STATS: string[]`
  - `Engine.bestBuilds(data, {stat, level, maxGold, stacked, stacks}, refChamp?) -> {items: (string|null)[6], value: number, cost: number}[]` (sorted by value, descending, at most 60)

- [ ] **Step 1: Write the failing tests.**
  - **Fixture:** items `hp1` (hp 400, 900 g), `hp2` (hp 300, 600 g), `hp3` (hp 200, 400 g), `ruby` (hp 150, 400 g, repeatable), the existing boots, `cap` (ap 130, Rabadon-like `mulTotal` 0.3), `apc` (ap 60, 400 g).
  - **Unique groups:** give `hp1`, `hp2` and `hp3` each their own group with max 1, so they're unique like legendaries.
  - **Helper:** `bruteBest(stat, maxGold)` enumerates every multiset of up to 6 fixture items, filtered by `validateBuild` and gold, and returns the best `championStats` value.

```js
test('beam finds the brute-force best health build', () => near(Engine.bestBuilds(DR, {stat: 'hp', level: 18})[0].value, bruteBest('hp')));
test('beam finds the brute-force best with a gold limit', () => near(Engine.bestBuilds(DR, {stat: 'hp', level: 18, maxGold: 2000})[0].value, bruteBest('hp', 2000)));
test('multipliers are counted (ability power picks the Rabadon-like item)', () => assert.ok(Engine.bestBuilds(DR, {stat: 'ap', level: 18})[0].items.includes('cap')));
test('builds are legal and at most 6 items', () => { for (const b of Engine.bestBuilds(DR, {stat: 'hp', level: 18})) {
  assert.ok(b.items.filter(Boolean).length <= 6); assert.deepEqual(Engine.validateBuild(DR, 'Annie', b.items), []); } });
test('repeatable items can repeat', () => assert.ok(Engine.bestBuilds(DR, {stat: 'hp', level: 18})[0].items.filter((i) => i === 'ruby').length >= 1));
test('gold limit below every item gives the empty build', () => assert.deepEqual(Engine.bestBuilds(DR, {stat: 'hp', level: 18, maxGold: 100})[0].items.filter(Boolean), []));
```

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test`.
- [ ] **Step 3: Implement `bestBuilds`** as specified in Global Constraints. The item contribution is `championStats(ref with [id]).total[stat] − championStats(ref with []).total[stat]`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat: beam search for the best builds for one stat"`

### Task 2: Rank champions

**Files:** Modify `engine.js`; test `engine.test.js` and `engine.real.test.js`.

**Interfaces:**
- Consumes `bestBuilds` (Task 1), `championStats`, `validateBuild`, `normalizeRunePage` and `validateRunePage`.
- Produces:
  - `Engine.bestRunePage(data, sel /* championStats selection without runes */, stat) -> page`
  - `Engine.rankStat(data, {stat, level, count, maxGold, stacked, stacks}) -> {rows: Row[], ms: number}`, with `Row` as in Global Constraints.

- [ ] **Step 1: Write the failing tests:**

```js
test('one row per champion, best champion first, count honoured', () => {
  const r = Engine.rankStat(DR, {stat: 'hp', level: 18, count: 3}).rows;
  assert.equal(r.length, 3); assert.equal(new Set(r.map((x) => x.champ)).size, 3);
  assert.equal(r[0].champ, 'Tanky'); });                       // fixture champion with the highest base hp
test('health shards: level-scaling health beats flat at level 18', () =>
  assert.deepEqual(Engine.rankStat(DR, {stat: 'hp', level: 18, count: 1}).rows[0].runes.shards.slice(1), [5001, 5001]));
test('rows are legal for their champion (no boots for Cassiopeia)', () => {
  for (const row of Engine.rankStat(DR, {stat: 'ms', level: 18, count: 50}).rows) assert.deepEqual(Engine.validateBuild(DR, row.champ, row.items), []);
  assert.ok(!Engine.rankStat(DR, {stat: 'ms', level: 18, count: 50}).rows.find((r) => r.champ === 'Cassiopeia').items.some((i) => i && DR.items[i].boots)); });
test('capped stat: ties share a rank, nothing over the cap', () => {
  const rows = Engine.rankStat(DR, {stat: 'crit', level: 18, count: 50}).rows;
  assert.ok(rows.every((r) => r.value <= 100)); assert.equal(rows[0].rank, rows[1].rank); });
test('stacks off by default, on when asked', () => {
  const off = Engine.rankStat(DR, {stat: 'ap', level: 18, count: 50}).rows.find((r) => r.champ === 'Veigar').value;
  const on = Engine.rankStat(DR, {stat: 'ap', level: 18, count: 50, stacks: 100}).rows.find((r) => r.champ === 'Veigar').value;
  assert.ok(on > off); });
test('mana ranks only mana users', () => assert.ok(Engine.rankStat(DR, {stat: 'mp', level: 18, count: 50}).rows.every((r) => DR.champions[r.champ].resource === 'Mana')));
test('gold limit below every item: base stats, no error', () => assert.ok(Engine.rankStat(DR, {stat: 'hp', level: 18, maxGold: 100}).rows.every((r) => r.items.every((i) => !i))));
test('partly counted flags', () => {                            // 'eh' (ad 50) is in itemStatPassivesUnknown
  const row = Engine.rankStat(DR, {stat: 'ad', level: 18, count: 1}).rows[0];
  assert.ok(row.items.includes('eh')); assert.ok(row.flags.includes('partly_counted:item:eh')); });
test('no NaN for any rankable stat', () => { for (const stat of Engine.RANKABLE_STATS) assert.ok(Engine.rankStat(DR, {stat, level: 18}).rows.every((r) => Number.isFinite(r.value))); });
```

  The fixture `DR` adds the champions `Tanky` (hp 900 / 120) and `Mana` (resource Mana) to `D3`'s, and gives the non-mana fixture champions `resource: 'Energy'`.
- [ ] **Step 2: Add `engine.real.test.js` (any patch):**
  - for `hp`, `ms` and `ap` at level 18: `rankStat` takes less than 3000 ms,
  - every row passes `validateBuild`,
  - row values are non-increasing,
  - the `hp` top row's value is at least the best champion's base HP at 18 plus 4000.
- [ ] **Step 3: Run them and confirm they fail.**
- [ ] **Step 4: Implement `bestRunePage` and `rankStat`.**
- [ ] **Step 5: Run the tests and confirm they pass.** Then print the real top 5 for `hp`, `ms`, `ap` and `as` with timings, and paste them into the commit message.
- [ ] **Step 6: Commit.** `git commit -am "feat: rank champions by one stat"`

### Task 3: Rankings tab

**Files:** Modify `app.js`, `index.html`, `i18n.js`, `i18n.test.js` and `README.md` (both languages).

**Interfaces:**
- `createPanel` gains `setBuild({champ, level, items, runes, stacked, stacks})`, which sets those fields, prunes nothing (rows are legal) and renders.
- A new `createRankings(section)`.

- [ ] **Step 1: Write the failing test.** New keys exist in both languages:
  - `tabCalculator`, `tabRankings`, `rankStat`, `rankCount`, `rankLevel`, `rankMaxGold`, `rankMaxGoldHint`, `rankStacks`,
  - `rankButton`, `rankCol`, `valueCol`, `itemsCol`, `runesCol`, `openInCalculator`, `rankNote`, `rankEmpty`, `rankTime`.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement.**
  - **Tabs:** a `role="tablist"` with two `role="tab"` buttons in the header area ("Calculator", "Rankings"). They show or hide `#calculator` (the current `<main>` content) and `#rankings` (a new section). The selected tab is remembered in local storage under `tab`, with try/catch.
  - **Rankings form:**
    - a stat select (the stats table names, in the current language),
    - level (default 18) and number of results (default 10, 1–50),
    - a gold limit (empty means none),
    - the "assume fully stacked" checkbox (default on) and champion stacks (default 0),
    - a "Rank" button.
  - **Results table:** rank, champion, value (formatted like the stats table), items (names joined with ", "), runes (keystone name and the 3 shard labels), and a button "Open in calculator". The button calls `panels[0].setBuild(row)` and switches to the calculator tab.
  - **Under the table:** the note "Best found by searching the most useful items; ties share a rank." and "Computed in X s".
  - **Flags:** a "partly counted" marker with the same notes as the calculator.
  - **Responsive:** at 375px wide the table scrolls inside `.table-scroll`.
  - **README:** a short "Rankings" paragraph in each language.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Verify by hand in the browser.**
  - Health at level 18 shows 10 rows in about 1 s.
  - "Open in calculator" on row 1 shows the same health total in the "You" panel.
  - Move speed with a 3000 gold limit shows cheaper builds.
  - Cassiopeia's row has no boots.
  - FR labels work.
  - The tab choice survives a reload.
  - At 375px wide there's no horizontal page scroll.
- [ ] **Step 6: Run the full suite.** Run `./update.sh 16.23.1`. Expected: All good.
- [ ] **Step 7: Commit.** `git add -A . && git commit -m "feat: rankings tab"`
