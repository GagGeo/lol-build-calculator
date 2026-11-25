# Champion page: start order, chosen skill order, ranks table

## Why
The champion page gives a skill order ("monter Q > E > W") and lists abilities at one level. The user wants the
advice to say what to take at levels 1-3 too, and wants to see each ability rank by rank and try another order
than the advised one.

## Goals
- Left (card): add the levels 1-3 order next to the existing max order, e.g.
  "Ordre des compétences : niveaux 1 à 3 : Q, E, W ; monter Q > E > W". The existing line stays as it is.
- Right (Abilities block): keep the level slider and the ability descriptions. Add a table: one row per ability
  (Q, W, E, R), one column per rank. Each cell: damage at that rank and the slider's level, plus that rank's
  cooldown and cost (from the "9/8/7/6/5" strings).
- An order picker above the table (one `<select>` with the 6 max orders, the advised one preselected and marked).
  Level + order give each ability's current rank; that cell is highlighted. Changing the order or the level moves
  the highlight.

## Non-goals
- No picker for the levels 1-3 order: it stays the advised one.
- No greying out of ranks that can't be reached at the slider's level.
- The passive stays in the descriptions only (one rank, no table row).

## Approaches
- **Chosen: table computed by the engine at a forced rank.** `spellDamage` takes an optional `side.ranks` override
  (one line); the table calls it per rank. Matches the engine everywhere else (same numbers as the calculator).
- Rejected: read the raw per-rank values (`BaseDamage: [10, 35, ...]`) straight into the table. Simpler but shows
  base numbers only, without AD/AP/level scaling, and wouldn't match the rest of the page.

## Start order data (my call)
- `rules.startOrders[champ]` (rules.py, like `skillOrders`), hand-written. When missing, the default is the max
  order itself (Q > E > W gives Q, E, W at levels 1-3), shown with "(par défaut)" so the advice stays honest.
- `skillRanks` uses this start order instead of the hard-coded Q, W, E. This also fixes the calculator at
  levels 1-2.
- The file starts with no hand-written entries; they get filled in the way `skillOrders` was.

## Left to the builder
- Exact cell layout (damage on top, cooldown and cost underneath, smaller) and FR/EN strings in i18n.js.
- Tests: `skillRanks` with a start order, and a forced-rank `spellDamage`, in engine.test.js.
