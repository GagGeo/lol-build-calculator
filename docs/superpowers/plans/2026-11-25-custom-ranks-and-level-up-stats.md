# Custom rank rules and level-up stats — design and plan

> Executed inline (superpowers:executing-plans). Follows `2026-11-25-skill-ranks-table.md`.

## Why
The rank table showed ranks the engine never reaches for 7 champions, and only damage per rank. The user wants
these champions ranked as in the game, and every stat that changes with rank (move speed, slow, shield…).

## Decided (approved with the Udyr mockup)
- **Rank rules** (wiki, 2026), in `rules.py` `skillRankRules`:
  - Udyr `{"basicR": true}`: R is a 6-rank basic, no 6/11/16 step; orders are the 24 orders of Q, W, E, R.
  - Jayce, Elise, Nidalee, Karma `{"free": {"R": 1}}`: R rank 1 from level 1, no point spent.
  - Yuumi `{"free": {"W": 1}}`.
  - Aphelios `{"noRanks": ["Q", "W", "E"]}`: those are rank 1 from level 1, points go to stats (not counted);
    the table shows no rank columns for them, and the calculator keeps its "estimated ranks" notice for him.
- **Level-up stats**: `prep.py` reads Data Dragon `leveltip` (EN/FR labels; first `{{ name[*mult] }}[%]` on the
  left of `->`), resolves `name` in the spell's CommunityDragon DataValues (case-insensitive), and stores
  `spell.levelUp = [{label: {en, fr}, values: [rank 1..maxrank], pct}]`. Skipped: cost/cooldown (shown from the
  cost/cooldown strings), names it can't resolve (~3%), values the damage lines already use (the engine's damage
  row shows them).
- **Table**: per ability, a header row (name, plus cooldown and cost when they don't change with rank), then rows:
  damage (engine, as now; hidden when the ability has no damage), cooldown and cost when they change, level-up
  rows. The current-rank column is highlighted on all of the ability's rows.
- One engine function gives the current ranks (`abilityRanks`), used by `spellRank` and by the page (removes the
  rule duplicated in app.js).

## Tasks
1. Engine: `skillRanks(champ, level, priority, start, rule)`; `orderChoices(data, id)` (6 orders, or 24 with
   `basicR`) used by `skillOrder`'s estimate and both pickers (calculator and champion page);
   `abilityRanks(data, champId, level, priority)`; `spellRankTable` rows get `noRanks` and `levelUp`.
   Tests: Udyr R ranks like a basic, free R for Elise-like, free W for Yuumi, Aphelios Q/W/E rank 1, Udyr order
   choices = 24, `abilityRanks` = `spellRank`.
2. Prep: `level_up(en, fr, values, used)` + test in `test_prep.py`; rebuild `data.js` from the 16.23.1 cache;
   `check.py` passes.
3. Page: grouped table, i18n (EN/FR), calculator picker and notice; browser check on Udyr, Aphelios, Ahri, Elise.
