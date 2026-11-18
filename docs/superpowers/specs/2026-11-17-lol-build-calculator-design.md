# LoL build calculator: design

Date: 2026-11-17. Data checked against patch 16.23.1.

## Intent

Help League of Legends players decide what to buy **during a game**. They pick a
champion, level, runes, items and an enemy champion with its own build, and see:

- their own stats at that level,
- what their basic attacks and spells do to that enemy, and what the enemy does to them,
- which purchase, given the items they already own and the gold they're carrying,
  helps most against that enemy.

## Goals

1. **Stat calculator.** Champion, level (1 to 18), rune page and up to 6 items give
   the final stats. Only legal builds can be entered.
2. **Damage against an enemy.** A second panel with the same choices. Shows per-hit
   and per-spell damage after resistances, as numbers and as a % of the target's
   health, plus a combo (each spell once, plus N basic attacks) and whether it
   kills. Shown in both directions.
3. **Buy advisor.** Takes the items you own and the gold you're carrying, lists
   every purchase you can afford, and ranks them by impact against the selected
   enemy.

Each stage is usable on its own and is built in this order.

## Non-goals

- Fight simulation over time: cooldowns, DPS, mana, positioning.
- Shields, heals, crowd control, summoner spells.
- Selling items in the advisor.
- Player accounts, match history, live game reading. This means no Riot API key
  is needed.
- Ranking by maximizing a raw stat. The advisor ranks by impact against the enemy.

## Anti-goals (failure even if it "works")

- **A confidently wrong number.** Anything the tool can't compute correctly
  (unsupported spell mechanics, unknown item effects) is shown with a visible
  "check in game" flag. It is never silently dropped or guessed.
- **Letting an illegal build through.**
- **Needing a server, account or install** just to use the page.

## Constraints

- **Data sources:**
  - Riot's Data Dragon (`ddragon.leagueoflegends.com`): versions, champion stats,
    items, runes. Public, no key.
  - CommunityDragon (`raw.communitydragon.org`): spell formulas from the game's own
    files, per champion `game/data/characters/<name>/<name>.bin.json`, with
    `DataValues` and `mSpellCalculations`. Fan-run and unofficial, so it can lag a
    patch or change format.
- **Patch cadence:** a patch about every two weeks. Hand-written rules can go
  stale.
- **Riot's fan-content policy:** free to publish. A public page must show the
  "not endorsed by Riot Games" notice.
- **Facts found while checking the data:**
  - Data Dragon's `stats` object on items lacks ability haste, lethality,
    penetration, omnivamp, tenacity, heal/shield power and adaptive force. These
    only appear in the item description's `<stats>` block, in a regular format.
  - Champion-only items are flagged in `requiredChampion`, e.g. Kalista's Black
    Spear (Kalista, Sylas) and Scarecrow Effigy (Fiddlesticks).
  - Rune data is text only.
  - Data Dragon's spell `effect`/`vars` are empty. Spell numbers come from
    CommunityDragon only.

## Approaches considered

- **A. A single HTML file that loads and parses all data live.** Nothing to run per
  patch, but every parsing problem shows up as a wrong number mid-game. Rejected.
- **B. A prep script that runs each patch and produces one clean data file, plus a
  plain HTML/JS page.** **Chosen.** All the messy parsing happens once per patch,
  where it can be checked and diffed. The page is fast and works offline.
- **C. A web app framework (React, etc.).** No accounts, saved builds or multiple
  pages are planned, so it would be weight with no payoff. Rejected.

## Decisions made with the user

- Approach B.
- The advisor starts from the **items you currently own plus the gold in your
  pocket**, not a whole build from a budget.
- The advisor ranks purchases by **impact against the selected enemy**.
- Level is selectable 1 to 18. The game has no rule tying items to level; gold is
  the real limit. Entered items are **not blocked** by gold. Instead, a
  **warning** appears when the total cost of the entered items is well above the
  typical gold earned by that level. The threshold comes from a hand-made table,
  since Riot publishes no such numbers, so the warning can't stop a real
  situation like a fed player or a long game.
- Spell damage is in scope. Mechanics that can't be computed get flagged.
- **Item effects that aren't stats** (e.g. Liandry's burn, Black Cleaver's shred,
  Lord Dominik's bonus damage) are **hand-coded** when they apply within one
  combo, so the advisor scores them. Items whose value is healing, shields or
  survival effects (e.g. Sterak's, Maw, Death's Dance) appear in a separate
  **"not scored"** list under the advisor table, not ranked on stats alone.
  Expected size: about 25 to 35 item rules.
- **Damage runes** (about 8: Electrocute, Arcane Comet, Dark Harvest, First Strike,
  Press the Attack, Coup de Grace, Cut Down, and similar) are hand-coded into the
  combo. **Champion innate passives** are read from CommunityDragon the same way as
  spells. Ones that can't be read get the "check in game" flag.
- Order of work: stat calculator, then damage vs enemy, then advisor.

## Design (calls made by Claude, open to correction)

### Data prep script

- Python 3, standard library only. One command: `python3 prep.py`.
- Picks the latest Data Dragon version, or a version passed as an argument.
- Downloads `champion.json`, every `champion/<Name>.json` (spell names, rank
  count, damage type from tooltip tags like `<magicDamage>`), `item.json`,
  `runesReforged.json`, and each champion's CommunityDragon `.bin.json`.
- Produces `data.js` (`window.DATA = {...}`), so `index.html` opens straight from
  disk with no server. Also writes `data/<patch>.json` for diffing.
- Items: keeps only Summoner's Rift (map `11`), purchasable, not
  `requiredAlly`-only. Merges the `stats` object with the stats read from the
  description text. Keeps the build tree (`from`/`into`) and gold (`total`,
  `base`) for the advisor's "remaining cost" pricing.
- Spells: converts each spell's calculations into a small formula per rank: base
  values plus ratios to named stats. A spell whose calculation uses a part type
  the script doesn't understand is marked `unsupported` with the reason.
- **Report** printed and saved as `data/<patch>-report.txt`:
  - counts of items, champions and spells parsed,
  - every item stat or spell part not understood,
  - items and spells whose numbers changed since the last saved patch, which
    shows which hand rules to re-check.
- Hand-written rules live in one file, `rules.py` (or `rules.json`), merged into
  the output (see Hand rules below).

### Page

- `index.html` + `app.js` + `data.js`, plain JavaScript, no build step, no
  framework.
- Two side-by-side panels, **You** and **Enemy**, each with:
  - champion, level, rune page,
  - 6 item slots,
  - skill order,
  - stack count for stacking champions.
- Your panel also has a **gold in pocket** field.
- A results area with:
  - stats,
  - per-ability damage both ways,
  - the combo,
  - the advisor table.
- The Riot disclaimer in the footer.
- **Languages:** English and French, with a switch button in the header.
  - The choice is remembered in the browser's local storage, with English as the
    default.
  - Champion, item, rune and spell names and descriptions come from Data Dragon's
    `en_US` and `fr_FR` files, both downloaded by `prep.py`.
  - Stats are always parsed from the English files, so parsing has one format to
    handle.
  - The page's own labels come from a small two-language table in `app.js`.

### Stats engine

- Growth per level `n`: `base + growth × (n − 1) × (0.7025 + 0.0175 × (n − 1))`.
- Attack speed: `base AS + attack speed ratio × (bonus AS% + level growth%)`. The
  attack speed ratio comes from CommunityDragon, since it differs from base AS for
  some champions.
- Item stats are additive, then hand-coded item passives that change stats are
  applied.
- Rune stat shards are exact and hand-coded. Other runes count only where they
  give a stat, with an "assume fully stacked" toggle.
- Adaptive force becomes AD or AP following the game's rule: whichever bonus is
  higher. On a tie it follows the champion's adaptive type, which CommunityDragon
  gives as `mAdaptiveForceToAbilityPowerWeight`.

### Build legality

- 6 item slots. The trinket is ignored.
- At most one pair of boots. No boots for champions that can't buy them
  (Cassiopeia).
- Each legendary item at most once.
- Unique-group exclusions come from the game's own item groups, with no hand list.
  CommunityDragon's `items.cdtb.bin.json` lists each item's `mItemGroups`, and
  each group has a `mMaxGroupOwnable`. Examples: `Boots` 1, `CleaveItems` 1,
  `LifelineItems` 1, `APMultiplier` 1, `DoransItems` 1, `JungleItems` 1, plus one
  group per legendary.
- `requiredChampion` is respected.
- Rune page:
  - one primary tree: keystone plus one rune from each of its three rows,
  - one different secondary tree: two runes from different rows,
  - three stat shards, one per shard row.
- Illegal choices are **not offered** in the pickers, rather than shown with an
  error after the fact.

### Damage

- Resistance multiplier: `100 / (100 + R)` for `R ≥ 0`, `2 − 100 / (100 − R)` for
  negative.
- Effective resistance after the attacker's reductions, in game order: flat
  reduction, % reduction, % penetration, flat penetration and lethality.
  Penetration doesn't take resistance below 0.
- **Basic attack:**
  - total AD,
  - plus average crit damage, shown separately as "non-crit / crit / average",
  - plus on-hit item effects from the hand list.
- **Damage runes and item effects** from the hand lists are applied in the combo
  where they trigger: a keystone proc, an execute below an HP threshold, a damage
  amp against a target with more max HP, armor shred affecting later hits.
- **Champion passives** are evaluated like spells when their formula can be read,
  otherwise flagged.
- **Spells:** the formula at the rank given by the skill order at that level. The
  default skill order is R at 6/11/16, then max Q, then W, then E; editable.
  % of the target's max, current or missing health uses the enemy panel's stats.
- **Combo:** every spell once, plus N basic attacks (N set by the user, default 3).
  The result is the target's remaining HP, or "kills". Unsupported spells are
  excluded from the total, with a visible warning.
- *(Claude's call)* **The target's current HP** is a "current HP %" field on each
  panel, default 100%. The combo is applied **in order**, because spells based on
  current or missing health depend on it. The order is editable, default Q, W, E,
  autos, R, which puts execute-style ultimates last. The advisor's "HP left"
  scores use these same starting values.

### Buy advisor

- **Candidates:**
  - every legal item or component with remaining cost ≤ gold in pocket, with
    remaining cost = full price minus components you already own that go into it,
    as the shop does it,
  - plus combinations of 2 to 3 buys that fit the gold and the free slots.
- **Two scores per candidate:**
  - **Offense:** reduction in the enemy's HP left after your combo.
  - **Defense:** increase in your HP left after the enemy's combo.

  Both are shown. Sort by either, with an optional "per 100 gold" view.
- **Result:** a ranked table, the top 20, each row clickable to apply it to your
  panel.
- **Not scored:** below the table, a list of affordable items whose main value is
  healing, shields or survival effects. These are listed, not ranked, with a
  one-line note on what they do.

### Hand rules (maintained per patch)

- Stat shard values.
- Item passives that change stats (e.g. Rabadon's % AP, Seraph's mana-to-AP,
  Titanic Hydra HP-to-AD).
- Item effects that apply within one combo: on-hit, burns, shred, damage amps.
  About 25 to 35 items.
- The "not scored" item list: healing, shield and survival items.
- About 8 damage runes.
- Typical gold earned by level, used for the unusual-build warning.
- Champion exceptions: no boots, stat conversions like Jhin attack speed to AD.
- Stacking champions and their stack stat.
- Starting list is to be built from the current patch. The prep report flags the
  ones whose source text changed.

### Checks

- `check.py` runs after `prep.py` and asserts a handful of known values. For
  example:
  - Annie Q rank 1 with 0 AP = 80 magic damage (game value lists are indexed by rank; index 0 is unused),
  - a level 18 champion's HP matches the growth formula,
  - a known item's ability haste is read from its description,
  - Kalista's Black Spear is unavailable to Annie.
- Updated when a value legitimately changes.

## Left to the builder

- Exact layout and styling of the page, as long as both panels and the results
  fit on one laptop screen.
- How CommunityDragon formula part types are mapped. Cover the common ones, flag
  the rest.
- The first version of the hand-rule lists.
- Automating `prep.py` with a scheduled GitHub job. Optional, and only after it
  runs cleanly by hand.
