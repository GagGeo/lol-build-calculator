# Start order, chosen skill order, ranks table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Champion page shows the levels 1-3 order next to the max order, and an ability table (row = ability, column = rank) where the user can try another max order.

**Architecture:** Engine gains a start order (hand-written or defaulting to the max order), a forced-rank override on spell damage, and a per-rank table builder. `app.js` renders the left-card line and the table under the existing level slider. No new files besides tests' additions.

**Tech Stack:** Plain JS (no build), `node --test`, Python `rules.py` for hand-written data.

**Spec:** `docs/superpowers/specs/2026-11-25-skill-ranks-table-design.md`

## Global Constraints

- No new dependencies. Browser-native `<select>` for the order picker.
- The existing left-card line "Ordre des compétences : monter Q > E > W" keeps its wording; the start order is added to it.
- Unknown start order defaults to the advised max order and is labelled "(par défaut)" / "(default)".
- Every user-visible string goes through `i18n.js` in both `en` and `fr`.
- After editing `app.js`/`engine.js`/`i18n.js`: run `python3 stamp.py`, otherwise `node --test` fails.

## Review Focus

- A champion with 6 ranks on an ability (Udyr-like) → that row has 6 rank columns; shorter rows leave the extra cells empty. (Task 2 test)
- Cooldown/cost strings with one value ("7") → the same value in every rank; missing → no text. (Task 2 test)
- An ability the engine can't read → its cells say "illisible ici", never "0 dégâts". (Task 2 test)
- Switching champion → the order picker resets to the new champion's advised order. (Task 3 manual check)
- A hand-written start order repeating an ability ("QEQ") → at level 3, Q rank 2 and E rank 1. (Task 1 test)

---

### Task 1: Start order and forced ranks in the engine

**Files:**
- Modify: `engine.js:357-369` (`skillRanks`), `engine.js:371-395` (add `startOrder` after `skillOrder`), `engine.js:424-428` and `engine.js:476-482` (rank lookup), `engine.js:1130-1147` (`spellScaling`), export list at `engine.js:1202`
- Modify: `rules.py` (add `"startOrders": {}` right after `skillOrders`, with a comment like the one above `skillOrders`: levels 1-3 order as a 3-letter string, e.g. `"Lux": "QEW"`; repeats allowed)
- Test: `engine.test.js`, `engine.real.test.js`

**Interfaces:**
- Produces:
  - `skillRanks(champ, level, priority = ['Q','W','E'], start = priority)` — levels 1-3 take `start[l-1]` (if under its maxrank and under the level cap) instead of the hard-coded Q, W, E.
  - `startOrder(data, champId) -> {order: string[3], byDefault: boolean}` — `data.rules.startOrders[champId]` split into letters, else `skillOrder(data, champId).order` with `byDefault: true`.
  - `spellDamage` / `spellHeal`: when `side.ranks` has the key, use `side.ranks[key]` as the rank (0 = not learned). Otherwise `skillRanks(champ, level, side.priority || skillOrder(...).order, startOrder(...).order)`. Put this in one private `spellRank(data, side, key)` used by both; passive logic unchanged.
  - `spellScaling(data, champId, level, priority)` — `priority` optional, passed as `sel.priority`.

- [ ] **Step 1: Write the failing tests** (`engine.test.js`, next to the `skillRanks` tests)

```js
test('start order picks levels 1-3', () => {
  assert.deepEqual(Engine.skillRanks(STD, 1, ['Q', 'W', 'E'], ['E', 'Q', 'W']), {Q: 0, W: 0, E: 1, R: 0});
  assert.deepEqual(Engine.skillRanks(STD, 3, ['Q', 'W', 'E'], ['Q', 'E', 'Q']), {Q: 2, W: 0, E: 1, R: 0});
});
test('start order defaults to the max order', () => {
  assert.deepEqual(Engine.skillRanks(STD, 1, ['E', 'Q', 'W']), {Q: 0, W: 0, E: 1, R: 0});
  assert.deepEqual(Engine.skillRanks(STD, 2, ['E', 'Q', 'W']), {Q: 1, W: 0, E: 1, R: 0});
});
test('startOrder: hand-written, else the max order by default', () => {
  const d = {...D2, rules: {...D2.rules, skillOrders: {Annie: 'QWE'}, startOrders: {Annie: 'QEQ'}}};
  assert.deepEqual(Engine.startOrder(d, 'Annie'), {order: ['Q', 'E', 'Q'], byDefault: false});
  const d0 = {...d, rules: {...d.rules, startOrders: {}}};
  assert.deepEqual(Engine.startOrder(d0, 'Annie'), {order: ['Q', 'W', 'E'], byDefault: true});
});
test('forced rank overrides the level', () => {
  near(Engine.spellDamage(D2, {...side({level: 1}), ranks: {Q: 3}}, tgt(), 'Q').damage, 170);
  assert.equal(Engine.spellDamage(D2, {...side({level: 18}), ranks: {Q: 0}}, tgt(), 'Q').learned, false);
});
```
(Place the last two after `D2`/`side`/`tgt` are defined, around `engine.test.js:205`.)

In `engine.real.test.js`, next to the skill-orders test:

```js
test('start orders: valid letters, champions exist', () => {
  for (const [id, o] of Object.entries(D.rules.startOrders || {})) {
    assert.ok(D.champions[id], id);
    assert.match(o, /^[QWE]{3}$/, id);
  }
  for (const id of Object.keys(D.champions)) assert.equal(Engine.startOrder(D, id).order.length, 3, id);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test engine.test.js engine.real.test.js`
Expected: FAIL (`Engine.startOrder is not a function`, wrong ranks at level 1).

- [ ] **Step 3: Implement the interfaces above** in `engine.js`, add `startOrder` to the export list, add `startOrders` to `rules.py`.

Note: the existing test `default ranks level 1/6/18` must still pass unchanged (default start = default priority = Q, W, E).

- [ ] **Step 4: Run all tests**

Run: `python3 stamp.py && node --test`
Expected: PASS. If an `engine.real.test.js` damage snapshot changes at level 1-2 for a champion whose max order doesn't start with Q, that's the intended fix: update the expected value and say so in the commit.

- [ ] **Step 5: Commit**

```bash
git add engine.js engine.test.js engine.real.test.js rules.py index.html
git commit -m "feat: levels 1-3 start order and forced ability ranks in the engine"
```

---

### Task 2: Per-rank ability table in the engine

**Files:**
- Modify: `engine.js` (add `spellRankTable` after `spellScaling`, export it)
- Test: `engine.test.js`

**Interfaces:**
- Consumes: `side.ranks` override from Task 1.
- Produces: `spellRankTable(data, champId, level) -> [{key, name, cells: [{rank, damage, type, perHit, unreadable, noDamage, cooldown, cost}]}]` for Q, W, E, R in that order (no passive). One cell per rank `1..spell.maxrank`. Same target as `spellScaling` (3000 health, no resists, no items). `damage` is 0 when `unreadable` or `noDamage`. `cooldown`/`cost`: the rank's part of the `"a/b/c"` string (`split('/')[rank-1]`, else the first part), `null` when the spell has none.

- [ ] **Step 1: Write the failing tests**

```js
test('rank table: one cell per rank, damage at each rank', () => {
  const D3 = {...D2, champions: {...D2.champions, Annie: {...D2.champions.Annie,
    spells: D2.champions.Annie.spells.map((s) => (s.key === 'Q' ? {...s, cooldown: '7', cost: '55/65/75/85/95'} : s))}}};
  const rows = Engine.spellRankTable(D3, 'Annie', 1);
  assert.deepEqual(rows.map((r) => r.key), ['Q', 'W', 'E', 'R']);
  const q = rows[0];
  assert.equal(q.cells.length, 5);
  near(q.cells[2].damage, 170);
  assert.equal(q.cells[4].cooldown, '7');
  assert.equal(q.cells[1].cost, '65');
  assert.equal(rows[3].cells.length, 3);
  assert.equal(rows[3].cells[0].cooldown, null);
});
test('rank table: unreadable ability has no damage', () => {
  const w = Engine.spellRankTable(D2, 'Annie', 1)[1];
  assert.ok(w.cells.every((c) => c.unreadable && c.damage === 0));
});
test('rank table: six-rank abilities get six cells', () => {
  const d = {...D2, champions: {...D2.champions, Annie: {...D2.champions.Annie,
    spells: D2.champions.Annie.spells.map((s) => (s.key === 'Q' ? {...s, maxrank: 6} : s))}}};
  assert.equal(Engine.spellRankTable(d, 'Annie', 18)[0].cells.length, 6);
});
```

- [ ] **Step 2: Run and see them fail** — `node --test engine.test.js`, expected `Engine.spellRankTable is not a function`.
- [ ] **Step 3: Implement `spellRankTable`** (build the side once per level like `spellScaling`'s `side({})`, then `spellDamage(d0, {...s0, ranks: {[key]: rank}}, target, key)` per cell).
- [ ] **Step 4: Run** `python3 stamp.py && node --test` — PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: per-rank ability table in the engine"`

---

### Task 3: Champion page — start order line, order picker, ranks table

**Files:**
- Modify: `app.js:1110-1136` (`abilities`), `app.js:1159-1161` (left-card skill order line)
- Modify: `i18n.js` (en near line 85-95, fr near line 256-266)
- Modify: `index.html` (CSS next to `.ability-desc`, line 99)
- Test: manual in the browser preview; `node --test` (i18n key parity test)

**Interfaces:**
- Consumes: `Engine.startOrder`, `Engine.skillRanks`, `Engine.spellScaling(data, id, level, priority)`, `Engine.spellRankTable` (Tasks 1-2).

**New i18n keys** (en / fr):
- `skillStart`: `'levels 1-3: {order}; '` / `'niveaux 1 à 3 : {order} ; '`
- `skillStartDefault`: `'(default)'` / `'(par défaut)'`
- `abilityOrder`: `'Max order'` / `'Ordre de max'`
- `abilityOrderAdvised`: `'{order} (advised)'` / `'{order} (conseillé)'`
- `abilityRanks`: `'Rank by rank'` / `'Rang par rang'`

- [ ] **Step 1: Left card.** At `app.js:1160`, the paragraph becomes: bold `t('skillOrder') + ': '`, then `t('skillStart', {order: start.order.join(', ')})` with `' ' + t('skillStartDefault')` inserted before the `; ` when `start.byDefault`, then the existing `t('skillOrderMax', ...)` + estimated note. FR result: « Ordre des compétences : niveaux 1 à 3 : Q, E, W (par défaut) ; monter Q > E > W ».
- [ ] **Step 2: Order picker.** In `abilities(id)`: a `<select id="champ-ability-order">` with the 6 orders (`QWE … EWQ`) labelled `Q > W > E`; the advised one (`Engine.skillOrder(DATA, id).order`) uses `abilityOrderAdvised` and is preselected. Keep the chosen order in a closure variable keyed by champion (`{champ, order}`) so a new champion resets to its advised order. Put it in a second `guide-row` under the level slider, with a label.
- [ ] **Step 3: Description list.** Pass the chosen order to `Engine.spellScaling(DATA, id, abilityLevel, order)` so the existing "(rang N)" matches the picker. Otherwise unchanged.
- [ ] **Step 4: Table.** After the list: `h4`/caption `abilityRanks`, then a `<table class="rank-table">`: header row `''` + `t('rank') + ' ' + n` for n = 1..max maxrank; one row per `Engine.spellRankTable(DATA, id, abilityLevel)` entry, first cell `key · name`. Each cell: damage (`fmt(damage, 0)` + `t('type_' + type)`, or `abilityUnreadable` / `abilityNoDamage` text as in the list), then a small muted line with `cooldown + ' s'` and `cost + ' ' + resName` when present. Highlight the cell where `n === Engine.skillRanks(champ, abilityLevel, order, Engine.startOrder(DATA, id).order)[key]` with class `current`. Rebuild the table in `update()` (level or order change).
- [ ] **Step 5: CSS** in `index.html`: `.rank-table` scrolls horizontally inside its block (`display: block; overflow-x: auto`), tabular numbers, `td.current` with the gold accent border/background already used by `output.strong` (`var(--gold)`), the small line reusing `.ability-desc` styling.
- [ ] **Step 6: Verify.** `python3 stamp.py && node --test` PASS. Then in the browser preview, on the Champions tab, open Ahri: left line shows the start order with "(par défaut)"; slider at 9 highlights Q rank 5, E rank 2, W rank 1 for Q > E > W (start Q, E, W); switching the picker to W > Q > E moves the highlights; picking another champion resets the picker; no console errors. Check FR and EN.
- [ ] **Step 7: Commit**

```bash
git add app.js i18n.js index.html
git commit -m "feat: champion page shows levels 1-3 order, a max order picker and a rank-by-rank ability table"
```
