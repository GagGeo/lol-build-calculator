# Stage 3: Buy Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** You enter the gold you're carrying. The page lists every purchase you can afford right now, including:
- single items,
- completing an item from components you own (at the shop's reduced price),
- 2–3 buys combined.

It ranks them by how much more of the enemy's health your combo removes (offense), or how much more of your health is left after their combo (defense), optionally per 100 gold. Clicking Apply puts the purchase into your panel. Items whose main value is healing, shields or survival effects are listed separately, not ranked.

**Architecture:**
- **`engine.js`** gains `purchase` (the shop's remaining-cost rule), `adviseBuys` (enumerate, score with the stage 2 `runCombo`, deduplicate) and `rankBuys` (sorting).
- **`prep.py`** adds each item's short Data Dragon description (`plaintext`, EN/FR) and a review list of survival items.
- **`rules.py`** sorts those items.
- **`app.js`** adds a gold field to your panel and an advisor section under the panels.

**Tech Stack:** unchanged.

**Spec:** `docs/superpowers/specs/2026-11-17-lol-build-calculator-design.md`, section "Buy advisor".
**Builds on:** stages 1 and 2, merged in `main`.

## Global Constraints

- Everything from the stage 1 and 2 Global Constraints still holds (no packages, `file://`, EN/FR, nothing silently dropped, no Co-Authored-By trailer).
- **Shop price rule.** Checked on 16.23 data: for every item, `gold.total = gold.base + Σ total(components)`, and `from` may repeat a component (e.g. `3006` = `1001 + 1042 + 1042`).
  - Remaining cost of buying item X with inventory S is `cost(X) = X.gold.base + Σ_{c in X.from} (c taken from S if present, else cost(c))`.
  - Components are taken recursively and each owned item is used at most once.
  - Taken components leave the inventory.
- **Items that can't be bought with gold are never suggested.** That means an item whose recipe contains an id missing from `DATA.items` (the 5 support upgrades of `3867`), or one that `validateBuild` rejects.
- **No selling.**
- **The buys stay legal:** the inventory after the buys has at most 6 items (consumed components free their slots) and passes `validateBuild`.
- **Scores, against the panels' current choices.** Level, runes, combos, current HP % and the enemy stay fixed.
  - `offense = hpLeft(before) − hpLeft(after)` for your combo against the enemy. Higher is better.
  - `defense = yourHpLeft(after) − yourHpLeft(before)` for the enemy combo against you. Higher is better.
  - `killsAt` and `enemyKillsAt` are kept from `runCombo`.
- **Ranking.** Sort by the chosen score, descending, then:
  - for offense: earlier `killsAt` (null last),
  - for defense: later `enemyKillsAt` (null first),
  - then lower cost.
- **Per 100 gold:** `score × 100 / max(cost, 1)`. Show the top 20.
- **Search.**
  - Every legal single buy within the gold.
  - Every pair within the gold: try a then b, and if that fails, b then a.
  - Triples only from the union of the top `tripleFrom` = 20 singles by offense and by defense.
  - Results with the same final inventory (as a sorted multiset) keep the cheapest.
  - Measured on 16.23: 0.09 ms per scored candidate, 183 legal singles for a two-item Garen, which keeps a click under about 2 s.
- **Not scored list.** An item in `rules.advisorNotScored` is not ranked, and neither is any combination containing it. It is listed once with its cost and its `plaintext` (or no note if empty) when it is buyable within the gold.
- **When suggestions run.** Only when the user clicks "Suggest purchases". Any later change to either panel marks the results as out of date and disables Apply until they're suggested again.

### Data additions

- `DATA.items[id].plaintext = {en, fr}` (may be `""`).
- `DATA.review.possibleSurvival`: legendary (tier 5) item ids whose description outside `<stats>` matches `/shield|heal|restore|stasis|revive|cleanse|Lifeline/i` (46 on 16.23).
- `rules.advisorNotScored` (main value is survival/healing/shields: ranked separately) and `rules.advisorScored` (the effect is minor; rank it normally). `check.py` requires every `possibleSurvival` id to be in one of them. The stale-rule check covers `advisorNotScored`.

## Review Focus

1. **Gold empty, 0, negative or text:** no suggestions, and a message asks for the gold you're carrying. Tested in Task 3.
2. **A full inventory (6 items):** only buys that free slots by consuming owned components are offered. If none fit, a message says so. Tested in Tasks 1 and 3.
3. **A recipe that uses the same component twice, or a component of a component** (e.g. owning one Long Sword towards an item that needs two): the right slots are freed and the cost is reduced exactly once per owned item. Tested in Task 1.
4. **Changing a panel after suggesting:** the results are marked out of date and Apply is disabled. Tested in Task 4.
5. **Your combo already kills before and after:** offense is 0 for all, the ranking falls back to the earlier kill step then cost, and nothing shows NaN or ∞. Tested in Task 3.

---

### Task 1: The shop's purchase rule

**Files:** Modify `engine.js` and `fixture.js`; test `engine.test.js`.

**Interfaces:**
- Produces `Engine.purchase(data, champ, items /* 6 slots, id|null */, itemId) -> null | {items: (string|null)[], cost: number, consumed: string[]}`.
- The new item goes in the first empty slot after the consumed components are removed. Consumed items are removed from their first matching slots.

- [ ] **Step 1: Write the failing tests.** Fixture recipe items:
  - `sword` (base 350, no `from`),
  - `pick` (base 875),
  - `dirk` (`from: [sword, sword]`, base 400, total 1100),
  - `blade` (`from: [dirk, pick]`, base 625, total 2600),
  - `quest` (`from: ['missing']`).

```js
test('buy a component outright', () => assert.deepEqual(Engine.purchase(R, 'Testo', [null, null], 'sword'), {items: ['sword', null], cost: 350, consumed: []}));
test('owned components reduce the price and free their slots', () =>
  assert.deepEqual(Engine.purchase(R, 'Testo', ['sword', 'sword', null], 'dirk'), {items: ['dirk', null, null], cost: 400, consumed: ['sword', 'sword']}));
test('each owned item is used once (one of two swords owned)', () =>
  assert.equal(Engine.purchase(R, 'Testo', ['sword', null], 'dirk').cost, 750));
test('components of components count', () =>
  assert.deepEqual(Engine.purchase(R, 'Testo', ['sword', 'pick', null], 'blade'), {items: ['blade', null, null], cost: 625 + 400 + 350, consumed: ['sword', 'pick']}));
test('full inventory: only a buy that frees a slot fits', () => {
  const full = ['sword', 'sword', 'ls', 'ls', 'ls', 'ls'];
  assert.equal(Engine.purchase(R, 'Testo', full, 'pick'), null);
  assert.equal(Engine.purchase(R, 'Testo', full, 'dirk').cost, 400); });
test('illegal result is null', () => assert.equal(Engine.purchase(R, 'Testo', ['boots', null], 'boots2'), null));
test('recipe with an unknown component is null', () => assert.equal(Engine.purchase(R, 'Testo', [null], 'quest'), null));
```

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test`.
- [ ] **Step 3: Implement `purchase`.** Write a recursive `remaining(id, pool)` over a multiset copy of the owned items. `pool` is a `Map` from id to count.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat: shop purchase rule with owned components"`

### Task 2: Item notes and survival-item review

**Files:**
- Modify `prep.py`, `rules.py`, `check.py`; test `test_prep.py`.
- Regenerate `data.js` and `data/`.

- [ ] **Step 1: Write the failing test.** In `test_prep.py`, `build_items` copies `plaintext` in both languages (fixture: EN "Shields against large bursts of damage", FR "Protège…"). A missing `plaintext` becomes `""`.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement.**
  - Add `plaintext` to items.
  - In `main()`, add `DATA.review.possibleSurvival` (Global Constraints) and a report section "Possible survival items (review in rules.py)".
  - Add the `check.py` gate and stale coverage.
- [ ] **Step 4: Run `./update.sh 16.23.1` and confirm it fails.** Expected: REVIEW lines for the 46 items.
- [ ] **Step 5: Sort them.**
  - **`advisorNotScored`:** items whose main value is a shield, heal, stasis, revive or cleanse. For example Sterak's, Maw, Death's Dance, Immortal Shieldbow, Guardian Angel, Zhonya's, Banshee's, Edge of Night, Mercurial, Spirit Visage, Kaenic Rookern, Locket, Redemption, Mikael's, Moonstone, Echoes of Helia, Bloodthirster.
  - **`advisorScored`:** items where such an effect is a side note to stats or damage that the scores already count.
  - Each entry gets a one-line comment.
- [ ] **Step 6: Run `./update.sh 16.23.1` and confirm it passes.** Expected: All good.
- [ ] **Step 7: Commit.** `git add -A . && git commit -m "feat: item notes and survival items for the advisor"`

### Task 3: Scoring and ranking purchases

**Files:** Modify `engine.js`; test `engine.test.js` and `engine.real.test.js`.

**Interfaces:**
- Consumes `purchase` (Task 1), `championStats` (stage 1), `runCombo` (stage 2), and `rules.advisorNotScored`, `itemDamageUnknown`, `itemStatPassivesUnknown`.
- Produces:
  - `Engine.adviseBuys(data, you, enemy, gold, opts = {tripleFrom: 20}) -> {rows: Row[], notScored: [{id, cost}], baseline: {hpLeft, killsAt, yourHpLeft, enemyKillsAt}, error: null|'no_gold'|'nothing_affordable'}`.
    - `you` and `enemy` are panel selections: `{champ, level, items, runes, stacked, stacks, priority, combo, currentHpPct}`.
    - `Row = {buys: string[], items, cost, consumed: string[], offense, killsAt, defense, enemyKillsAt, flags: string[]}`.
    - `flags` holds `partly_counted:<id>` for buys in `itemDamageUnknown` or `itemStatPassivesUnknown`.
  - `Engine.rankBuys(rows, by: 'offense'|'defense', perGold: bool, top = 20) -> Row[]`.

- [ ] **Step 1: Write the failing tests** with fixture items carrying stats and damage rules.
  - **Helpers:**
    - `advise(gold)` runs `Engine.adviseBuys(D6, YOU, FOE, gold)`, with YOU = Annie-like level 6 (`items: ['ls', null×5]`) and FOE = Testo level 6 (`items: []`), default combos, 100% HP.
    - `BASE` is `advise(…).baseline`.
    - `comboWith(items)` runs `runCombo` for YOU with those items against FOE.
  - **Fixture `D6`:** extends D3 with `shieldy` (in `advisorNotScored`), `eh` (in `itemDamageUnknown`), `bf` (1300) and `ruby` (hp 150, 400 gold).

```js
test('no gold', () => { for (const g of [0, -5, '', 'x']) assert.equal(advise(g).error, 'no_gold'); });
test('nothing affordable', () => assert.equal(advise(100).error, 'nothing_affordable'));
test('single buys scored against the baseline', () => {
  const r = advise(1300).rows.find((x) => x.buys.join() === 'bf');
  near(r.offense, BASE.hpLeft - comboWith(['bf']).hpLeft); assert.equal(r.cost, 1300); });
test('defense item raises your hp left', () => assert.ok(advise(1000).rows.find((x) => x.buys.join() === 'ruby').defense > 0));
test('pairs within gold, deduplicated by final inventory', () => {
  const rows = advise(2000).rows;
  assert.ok(rows.some((x) => x.buys.length === 2));
  assert.equal(new Set(rows.map((x) => [...x.items].filter(Boolean).sort().join())).size, rows.length); });
test('not-scored items are listed, never ranked', () => {
  const a = advise(3000);
  assert.ok(a.notScored.some((x) => x.id === 'shieldy')); assert.ok(!a.rows.some((x) => x.buys.includes('shieldy'))); });
test('partly counted flag', () => assert.ok(advise(3000).rows.find((x) => x.buys.join() === 'eh').flags.includes('partly_counted:eh')));
test('ranking ties: both kill → earlier kill step, then cheaper', () => {
  const rows = [{offense: 0, killsAt: 3, cost: 500}, {offense: 0, killsAt: 2, cost: 900}, {offense: 0, killsAt: 2, cost: 400}];
  assert.deepEqual(Engine.rankBuys(rows, 'offense', false).map((r) => r.cost), [400, 900, 500]); });
test('defense ties: surviving (null) beats dying later beats dying earlier', () => {
  const rows = [{defense: 0, enemyKillsAt: 2, cost: 1}, {defense: 0, enemyKillsAt: null, cost: 2}, {defense: 0, enemyKillsAt: 4, cost: 3}];
  assert.deepEqual(Engine.rankBuys(rows, 'defense', false).map((r) => r.cost), [2, 3, 1]); });
test('per 100 gold divides by cost and never by zero', () => {
  const rows = [{offense: 100, killsAt: null, cost: 1000}, {offense: 30, killsAt: null, cost: 100}, {offense: 5, killsAt: null, cost: 0}];
  assert.deepEqual(Engine.rankBuys(rows, 'offense', true).map((r) => r.cost), [0, 100, 1000]); });
test('no NaN anywhere', () => assert.ok(advise(5000).rows.every((r) => Number.isFinite(r.offense) && Number.isFinite(r.defense))));
```

- [ ] **Step 2: Add `engine.real.test.js`:**
  - Garen level 11 with Plated Steelcaps (`3047`) and Black Cleaver (`3071`), 3000 gold, against Annie level 11 with `3020` + `3089`, default combos.
  - `adviseBuys` finishes in under 3000 ms.
  - Every row's `cost` is at most 3000.
  - Every row's items pass `validateBuild`.
  - The top offense row has offense > 0.
- [ ] **Step 3: Run them and confirm they fail.**
- [ ] **Step 4: Implement.**
  - Gold goes through `Number`. A non-finite or ≤ 0 value gives `no_gold`.
  - Candidate ids are every item id that isn't in `advisorNotScored`.
  - The not-scored list uses `purchase` on the current items, filtered by gold.
- [ ] **Step 5: Run the tests and confirm they pass.**
- [ ] **Step 6: Commit.** `git commit -am "feat: score and rank purchases"`

### Task 4: Gold field and advisor section

**Files:** Modify `app.js`, `index.html`, `i18n.js`, `i18n.test.js`.

**Interfaces:**
- `createPanel` gains:
  - `state.gold` (the "you" panel only shows the field),
  - `setItems(items)`, which sets the items and renders,
  - an `onChange` call on every change. That call already exists and is reused to mark advice out of date.

- [ ] **Step 1: Write the failing test.** New keys exist in both languages:
  - `gold`, `advisor`, `suggest`, `sortBy`, `sortOffense`, `sortDefense`, `perGold`,
  - `buy`, `costCol`, `damageGain`, `killStep`, `survivalGain`, `apply`,
  - `notScored`, `stale`, `enterGold`, `nothingAffordable`, `partlyCounted`, `completes`, `baseline`.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement.**
  - **Gold field:** a "Gold in pocket" `<input type=number min=0 step=1>` on your panel, under Items.
  - **Advisor section:** `<section id="advisor">` after `#panels`, full width, containing:
    - a "Suggest purchases" button,
    - a sort select (damage to enemy / your survival),
    - a "per 100 gold" checkbox,
    - a baseline line: "Your combo leaves X HP / kills at step N; theirs leaves you Y HP",
    - a results table, top 20. Each row shows the buy (names joined with " + "), plus "completes Black Cleaver using your Long Sword" when components are consumed. Then the cost, the offense gain, the kill-step change ("kills at 4 → 3"), the defense gain, notes (partly counted) and an Apply button.
    - a "Not scored" list: name, cost and plaintext.
  - **Messages:** for `no_gold` and `nothing_affordable`.
  - **Stale results:** any panel change adds a "Your choices changed — suggest again" notice and disables the Apply buttons.
  - **Apply:** calls `panels[0].setItems(row.items)` and subtracts `row.cost` from the gold field.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Verify by hand in the browser.**
  - Garen with Black Cleaver against Annie at 3000 gold shows ranked rows, and sorting by survival changes the order.
  - Apply on a row updates your items and lowers your gold.
  - Changing the enemy's level marks the results out of date.
  - Gold empty shows the "enter your gold" message.
  - With a full inventory, only completing buys appear (or the message).
  - FR labels work.
  - At 375px wide there's no horizontal scroll.
- [ ] **Step 6: Run the full suite.** Run `./update.sh 16.23.1`. Expected: All good.
- [ ] **Step 7: Commit.** `git add -A . && git commit -m "feat: buy advisor section"`
