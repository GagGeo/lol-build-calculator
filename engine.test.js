const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('./engine.js');
const {D, VALID_PAGE} = require('./fixture.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
const stats = (o) => Engine.championStats(D, {champ: 'Testo', level: 1, items: [], runes: null,
                                              stacked: false, stacks: 0, ...o});
const pageWithShards = (shards) => ({...VALID_PAGE, shards});
const pageWith = (o) => ({...VALID_PAGE, ...o});

test('growth', () => { near(Engine.growth(1), 0); near(Engine.growth(18), 17); near(Engine.growth(2), 0.72); });
test('level 18 base hp', () => near(stats({level: 18}).total.hp, 2300));
test('item bonus ad', () => near(stats({level: 18, items: ['ls']}).total.ad, 121));
test('attack speed', () => near(stats({level: 1, items: ['bow']}).total.as, 0.80625));
test('attack speed cap', () => near(stats({level: 1, items: ['big']}).total.as, 2.5));
test('rabadon multiplies total ap incl. adaptive shard', () =>
  near(stats({items: ['cap'], runes: pageWithShards([5008, 5010, 5011])}).total.ap, 180.7));
test('adaptive goes AD for AD champ with no bonus', () => near(stats({runes: pageWithShards([5008, 5010, 5011])}).bonus.ad, 5.4));
test('health scaling shard', () => near(stats({level: 10, runes: pageWithShards([5005, 5001, 5011])}).bonus.hp, 100 + 65));
test('move speed soft cap', () => near(stats({items: ['boots']}).total.ms, 435));
test('stacks', () => near(stats({champ: 'Veigar', stacks: 50}).bonus.ap, 50));
test('level clamp', () => {
  assert.equal(Engine.clampLevel(0), 1); assert.equal(Engine.clampLevel(19), 18);
  assert.equal(Engine.clampLevel('7.6'), 8); assert.equal(Engine.clampLevel('x'), 1);
});
test('null slots are ignored', () => near(stats({items: [null, 'ls', null]}).bonus.ad, 10));

// Rule formats added in Task 3 (see ledger rulings).
test('convert from bonus stat', () => near(stats({items: ['ohp']}).bonus.ad, 12.5));
test('convert from item stat only', () =>
  near(stats({items: ['wm'], runes: pageWithShards([5005, 5010, 5011])}).bonus.hp, 1000 + 65 + 120));
test('unknown passive is flagged', () => assert.deepEqual(stats({items: ['eh']}).flags, ['unknown_passive:eh']));
test('stacker every n stacks', () => {
  const s = stats({champ: 'Senna', stacks: 45});
  near(s.bonus.crit, 20); near(s.bonus.ad, 33.75);
});
test('stacker by ultimate rank', () => {
  near(stats({champ: 'Chogath', level: 11, stacks: 10}).bonus.hp, 800);
  assert.equal(stats({champ: 'Chogath', level: 5, stacks: 10}).bonus.hp || 0, 0);
});
test('rune scaling by level only when stacked', () => {
  near(stats({level: 18, stacked: true, runes: pageWith({keystone: 101, shards: [5005, 5010, 5011]})}).bonus.ad, 28.8);
  assert.equal(stats({level: 18, runes: pageWith({keystone: 101, shards: [5005, 5010, 5011]})}).bonus.ad || 0, 0);
});
test('rune melee or ranged value', () => {
  const page = pageWith({primaryRunes: [111, 122, 132], shards: [5007, 5010, 5011]});
  near(stats({stacked: true, runes: page}).bonus.as, 36);
  near(stats({champ: 'Ranger', stacked: true, runes: page}).bonus.as, 24);
});
test('rune level steps always apply', () => {
  const page = pageWith({secondaryRunes: [211, 232], shards: [5005, 5010, 5011]});
  assert.equal(stats({level: 4, runes: page}).bonus.ah || 0, 0);
  near(stats({level: 7, runes: page}).bonus.ah, 5);
  near(stats({level: 8, runes: page}).bonus.ah, 10);
});
test('rune multiplies total', () =>
  near(stats({stacked: true, runes: pageWith({primaryRunes: [112, 121, 132], shards: [5005, 5010, 5013]})}).total.armor,
       (30 + 8) * 1.03));
test('jack of all trades counts item stats', () => {
  const s = stats({items: ['ls', 'bow', 'boots', 'ruby', 'mrI'],
                   runes: pageWith({secondaryRunes: [221, 232], shards: [5005, 5010, 5013]})});
  near(s.bonus.ah, 5); near(s.bonus.ad, 10 + 8 * 0.6);
});

// Legality and gold (Task 5).
test('two boots', () => assert.deepEqual(Engine.validateBuild(D, 'Testo', ['boots', 'boots2']), ['group_limit:Boots']));
test('seven items', () => assert.ok(Engine.validateBuild(D, 'Testo', Array(7).fill('ls')).includes('too_many_items')));
test('six items with empty slots is fine', () => assert.deepEqual(Engine.validateBuild(D, 'Testo', ['ls', null, 'ls']), []));
test('cassiopeia boots', () => assert.deepEqual(Engine.validateBuild(D, 'Cassiopeia', ['boots']), ['no_boots_champion']));
test('champion-only, case-insensitive', () => {
  assert.deepEqual(Engine.validateBuild(D, 'Fiddlesticks', ['effigy']), []);
  assert.deepEqual(Engine.validateBuild(D, 'Testo', ['effigy']), ['champion_only:effigy']);
});
test('allowedItems keeps swap in same slot', () => {
  assert.ok(!Engine.allowedItems(D, 'Testo', ['boots', null], 1).includes('boots2'));
  assert.ok(Engine.allowedItems(D, 'Testo', ['boots', null], 0).includes('boots2'));
  assert.ok(!Engine.allowedItems(D, 'Cassiopeia', [null], 0).includes('boots'));
});
test('pruneBuild on champion switch', () =>
  assert.deepEqual(Engine.pruneBuild(D, 'Cassiopeia', ['ls', 'boots']), {items: ['ls', null], removed: ['boots']}));
test('rune page valid', () => assert.deepEqual(Engine.validateRunePage(D, VALID_PAGE), []));
test('incomplete rune page is not an error', () =>
  assert.deepEqual(Engine.validateRunePage(D, {...VALID_PAGE, keystone: null, secondaryRunes: [212, null]}), []));
test('keystone from the wrong row or tree', () => {
  assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, keystone: 112}).includes('keystone'));
  assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, keystone: 201}).includes('keystone'));
});
test('primary rune in the wrong row', () =>
  assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, primaryRunes: [122, 122, 132]}).includes('primary_row:0')));
test('secondary same tree', () =>
  assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, secondary: VALID_PAGE.primary}).includes('secondary_same_tree')));
test('secondary keystone not allowed', () =>
  assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, secondaryRunes: [201, 232]}).includes('secondary_row')));
test('secondary same row', () =>
  assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, secondaryRunes: [211, 212]}).includes('secondary_same_row')));
test('shard in the wrong row', () =>
  assert.ok(Engine.validateRunePage(D, {...VALID_PAGE, shards: [5011, 5010, 5011]}).includes('shard:0')));
test('normalize clears dependents', () => {
  const p = Engine.normalizeRunePage(D, {...VALID_PAGE, primary: 200});
  assert.equal(p.keystone, null);
  assert.deepEqual(p.primaryRunes, [null, null, null]);
  assert.equal(p.secondary, null);
  assert.deepEqual(p.secondaryRunes, [null, null]);
  assert.deepEqual(p.shards, VALID_PAGE.shards);
});
test('normalize keeps a valid page', () => assert.deepEqual(Engine.normalizeRunePage(D, VALID_PAGE), VALID_PAGE));
test('normalize drops the second of two same-row secondary runes', () =>
  assert.deepEqual(Engine.normalizeRunePage(D, {...VALID_PAGE, secondaryRunes: [211, 212]}).secondaryRunes, [211, null]));
test('build cost', () => assert.equal(Engine.buildCost(D, ['ls', null, 'bf']), 1650));
test('gold warning', () => {
  assert.deepEqual(Engine.goldWarning(D, 1, ['bf']), {cost: 1300, typical: 500});
  assert.equal(Engine.goldWarning(D, 18, ['bf']), null);
  assert.equal(Engine.goldWarning(D, 1, []), null);
});

// Final-review fixes.
test('item passive adds a flat stat', () => near(stats({items: ['horn']}).total.hpregen, 20));
test('stacking item counts only when stacked', () => {
  assert.equal(stats({items: ['tear']}).bonus.mp || 0, 0);
  near(stats({items: ['tear'], stacked: true}).bonus.mp, 360);
});
test('convert from base stat', () => near(stats({level: 1, items: ['sg']}).bonus.ad, 30));
test('champion with an uncounted passive is flagged', () =>
  assert.deepEqual(stats({champ: 'Ranger'}).flags, ['unknown_champion:Ranger']));
test('base health regen percent multiplies base regen', () => {
  const s = Engine.championStats({...D, champions: {...D.champions, Testo: {...D.champions.Testo,
    base: {...D.champions.Testo.base, hpregen: 5}}}}, {champ: 'Testo', level: 1, items: ['regen'], runes: null, stacked: false, stacks: 0});
  near(s.total.hpregen, 10);
});
test('crit chance is capped at 100', () => near(stats({items: ['critI', 'critI']}).total.crit, 100));

// Stage 2, Task 3: formulas and skill ranks.
const {QSPELL, MIXSPELL, STD, UDYR_LIKE, champWithSpells} = require('./fixture.js');
const ctx = (o = {}) => ({rank: o.rank ?? 1, level: o.level ?? 1, rules: {...D.rules, critBase: 1.75},
  stats: {base: {ad: 60, hp: 600}, bonus: {ad: o.bonusAd || 0, critDmg: o.critDmg || 0, hp: o.bonusHp || 0},
          total: {ad: 60 + (o.bonusAd || 0), ap: o.ap || 0, hp: 600 + (o.bonusHp || 0)}}});
const calc = (spellObj, name, o) => Engine.evalCalc(spellObj, name, ctx(o));
test('annie q rank 1 no ap', () => near(calc(QSPELL, 'TotalDamage', {rank: 1}).value, 80));
test('annie q rank 1 with 100 ap', () => near(calc(QSPELL, 'TotalDamage', {rank: 1, ap: 100}).value, 160));
test('bonus ad basis', () => near(calc(MIXSPELL, 'Bonus', {bonusAd: 40}).value, 60));
test('crit damage reads total multiplier', () => near(calc(MIXSPELL, 'Crit', {critDmg: 40}).value, 2.15));
test('level breakpoints', () => { near(calc(MIXSPELL, 'Steps', {level: 6}).value, 10); near(calc(MIXSPELL, 'Steps', {level: 13}).value, 20); });
test('per level breakpoint counts from that level', () => { near(calc(MIXSPELL, 'PerLevel', {level: 1}).value, 0); near(calc(MIXSPELL, 'PerLevel', {level: 4}).value, 9); });
test('a later per-level breakpoint replaces the earlier rate, and one without a rate ends it', () => {
  // Ivern passive shape: 40, -3/level from 7, -4/level from 12, -2/level from 15, flat from 16.
  const sp = {calcs: {Ivern: {parts: [{t: 'lvlBp', start: 40, bps: [[7, 0, -3], [12, 0, -4], [15, 0, -2], [16, 0]]}]}}, values: {}};
  near(calc(sp, 'Ivern', {level: 11}).value, 40 - 3 * 5);
  near(calc(sp, 'Ivern', {level: 14}).value, 40 - 3 * 5 - 4 * 3);
  near(calc(sp, 'Ivern', {level: 18}).value, 40 - 3 * 5 - 4 * 3 - 2);
});
test('level interpolation', () => { near(calc(MIXSPELL, 'Lerp', {level: 1}).value, 40); near(calc(MIXSPELL, 'Lerp', {level: 18}).value, 210); });
test('ref, sum, product, mult', () => near(calc(MIXSPELL, 'Combined', {rank: 1, level: 18}).value, (1 + 0.5 * 210) * 2));
test('stat of subpart', () => near(calc(MIXSPELL, 'MaxHp', {bonusHp: 500}).value, 50));
test('unsupported node reported', () => assert.deepEqual(calc(MIXSPELL, 'Bad').unsupported, ['BuffCounterByCoefficientCalculationPart']));
test('ref loop is unsupported, not a crash', () => assert.ok(calc(MIXSPELL, 'Loop').unsupported.length > 0));
test('missing calc is unsupported', () => assert.deepEqual(calc(MIXSPELL, 'Nope').unsupported, ['missing calc Nope']));
test('default ranks level 1/6/18', () => {
  assert.deepEqual(Engine.skillRanks(STD, 1), {Q: 1, W: 0, E: 0, R: 0});
  assert.deepEqual(Engine.skillRanks(STD, 6), {Q: 3, W: 1, E: 1, R: 1});
  assert.deepEqual(Engine.skillRanks(STD, 18), {Q: 5, W: 5, E: 5, R: 3});
});
test('priority E first', () => assert.equal(Engine.skillRanks(STD, 9, ['E', 'Q', 'W']).E, 5));
test('basic rank cap by level', () => assert.ok(Engine.skillRanks(STD, 4).Q <= 2));
test('start order picks levels 1-3', () => {
  assert.deepEqual(Engine.skillRanks(STD, 1, ['Q', 'W', 'E'], ['E', 'Q', 'W']), {Q: 0, W: 0, E: 1, R: 0});
  assert.deepEqual(Engine.skillRanks(STD, 3, ['Q', 'W', 'E'], ['Q', 'E', 'Q']), {Q: 2, W: 0, E: 1, R: 0});
});
test('rank rules: Udyr-like R ranks like a basic, all four learned by level 4', () => {
  assert.deepEqual(Engine.skillRanks(UDYR_LIKE, 4, ['R', 'Q', 'W', 'E'], undefined, {basicR: true}), {Q: 1, W: 1, E: 1, R: 1});
  assert.deepEqual(Engine.skillRanks(UDYR_LIKE, 6, ['R', 'Q', 'W', 'E'], undefined, {basicR: true}), {Q: 1, W: 1, E: 1, R: 3});
  assert.deepEqual(Engine.skillRanks(UDYR_LIKE, 18, ['R', 'Q', 'W', 'E'], undefined, {basicR: true}), {Q: 6, W: 5, E: 1, R: 6});
  assert.deepEqual(Engine.skillRanks(UDYR_LIKE, 4, ['Q', 'W', 'E'], ['Q', 'W', 'E'], {basicR: true}), {Q: 1, W: 1, E: 1, R: 1});
});
test('rank rules: free R rank 1 (Elise-like)', () => {
  const elise = champWithSpells({R: 4});
  assert.deepEqual(Engine.skillRanks(elise, 1, ['Q', 'W', 'E'], undefined, {free: {R: 1}}), {Q: 1, W: 0, E: 0, R: 1});
  assert.deepEqual(Engine.skillRanks(elise, 6, ['Q', 'W', 'E'], undefined, {free: {R: 1}}), {Q: 3, W: 1, E: 1, R: 2});
  assert.deepEqual(Engine.skillRanks(elise, 18, ['Q', 'W', 'E'], undefined, {free: {R: 1}}), {Q: 5, W: 5, E: 5, R: 4});
});
test('rank rules: free W rank 1 (Yuumi-like), the opening learns the other two', () => {
  const yuumi = champWithSpells({Q: 6});
  assert.deepEqual(Engine.skillRanks(yuumi, 1, ['Q', 'W', 'E'], undefined, {free: {W: 1}}), {Q: 1, W: 1, E: 0, R: 0});
  assert.deepEqual(Engine.skillRanks(yuumi, 2, ['Q', 'W', 'E'], undefined, {free: {W: 1}}), {Q: 1, W: 1, E: 1, R: 0});
  assert.deepEqual(Engine.skillRanks(yuumi, 3, ['Q', 'W', 'E'], undefined, {free: {W: 1}}), {Q: 2, W: 1, E: 1, R: 0});
  assert.deepEqual(Engine.skillRanks(yuumi, 3, ['Q', 'E', 'W'], undefined, {free: {W: 1}}), {Q: 2, W: 1, E: 1, R: 0});
});
test('rank rules: abilities without ranks stay rank 1 (Aphelios-like)', () => {
  const rule = {noRanks: ['Q', 'W', 'E']};
  assert.deepEqual(Engine.skillRanks(UDYR_LIKE, 1, ['Q', 'W', 'E'], undefined, rule), {Q: 1, W: 1, E: 1, R: 0});
  assert.deepEqual(Engine.skillRanks(STD, 18, ['Q', 'W', 'E'], undefined, rule), {Q: 1, W: 1, E: 1, R: 3});
});
test('start order respects the per-level rank cap', () => {
  assert.deepEqual(Engine.skillRanks(STD, 2, ['Q', 'W', 'E'], ['Q', 'Q', 'E']), {Q: 1, W: 1, E: 0, R: 0});
  assert.deepEqual(Engine.skillRanks(STD, 3, ['Q', 'W', 'E'], ['Q', 'Q', 'Q']), {Q: 2, W: 1, E: 0, R: 0});
});
test('start order defaults to the max order', () => {
  assert.deepEqual(Engine.skillRanks(STD, 1, ['E', 'Q', 'W']), {Q: 0, W: 0, E: 1, R: 0});
  assert.deepEqual(Engine.skillRanks(STD, 2, ['E', 'Q', 'W']), {Q: 1, W: 0, E: 1, R: 0});
});
test('custom ranks follow maxrank', () => {
  const r = Engine.skillRanks(UDYR_LIKE, 18);
  assert.ok(r.Q <= 6 && r.R <= 6);
  assert.equal(r.Q + r.W + r.E + r.R, 18);
});

// Stage 2, Task 4: resistances, basic attacks, single spell damage.
const {spell} = require('./fixture.js');
const A = (o = {}) => ({base: {}, bonus: {...o}, total: {...o}});
const A0 = A();
const T = (o = {}) => ({base: {}, bonus: {}, total: {armor: 0, mr: 0, hp: 1000, ...o}});
const RULES2 = {...D.rules, critBase: 1.75};
test('armor 100 halves physical', () => near(Engine.mitigate(200, 'physical', A0, T({armor: 100})), 100));
test('magic uses magic resist', () => near(Engine.mitigate(200, 'magic', A0, T({armor: 300, mr: 100})), 100));
test('true ignores resist', () => near(Engine.mitigate(200, 'true', A0, T({armor: 300})), 200));
test('pct pen then lethality', () =>
  near(Engine.mitigate(100, 'physical', A({armorPenPct: 30, lethality: 10}), T({armor: 100})), 100 * 100 / 160));
test('magic pen pct and flat', () =>
  near(Engine.mitigate(100, 'magic', A({magicPenPct: 40, magicPen: 10}), T({mr: 100})), 100 * 100 / 150));
test('pen cannot go below zero', () => near(Engine.mitigate(100, 'physical', A({lethality: 500}), T({armor: 50})), 100));
test('negative resist amplifies', () => near(Engine.mitigate(100, 'magic', A0, T({mr: -20})), 100 * (2 - 100 / 120)));
test('shred applies before pen', () => near(Engine.mitigate(100, 'physical', A0, T({armor: 100}), {armor: 0.3, mr: 0}), 100 * 100 / 170));
test('auto attack crit average', () => {
  const r = Engine.autoAttack(A({ad: 100, crit: 50}), T(), RULES2);
  near(r.nonCrit, 100); near(r.crit, 175); near(r.average, 137.5);
});
test('auto attack crit damage bonus and armor', () => {
  const r = Engine.autoAttack(A({ad: 100, crit: 100, critDmg: 40}), T({armor: 100}), RULES2);
  near(r.crit, 107.5); near(r.average, 107.5);
});

const RSPELL = spell('R', {values: {BaseDamage: [0, 150, 300, 450], ExecuteDamage: [0, 0.25, 0.3, 0.35]},
  lines: [{type: 'true', terms: [{value: 'BaseDamage', kind: 'flat'},
                                 {value: 'ExecuteDamage', kind: 'targetMissing', mult: 100, percent: true}]}]});
const ESPELL = spell('E', {values: {Pct: [0, 4, 5, 6, 7, 8]},
  lines: [{type: 'true', terms: [{value: 'Pct', kind: 'targetMax', percent: true}]}]});
const WSPELL = spell('W', {calcs: {Bad: {parts: [{t: 'x', what: 'CooldownMultiplierCalculationPart'}], pct: false, mult: null, flags: []}},
  lines: [{type: 'magic', terms: [{calc: 'Bad', kind: 'flat'}]}]});
const D2 = {...D, rules: RULES2, champions: {...D.champions,
  Annie: {...D.champions.Testo, id: 'Annie', spells: [spell('P'), QSPELL, WSPELL, ESPELL, RSPELL]}}};
const side = (o = {}) => ({champ: 'Annie', level: o.level ?? 1, priority: ['Q', 'W', 'E'],
  stats: Engine.championStats(D2, {champ: 'Annie', level: o.level ?? 1, items: [], runes: null, stacked: false, stacks: 0})});
const tgt = (o = {}) => ({stats: T({hp: o.maxHp ?? 1000, mr: o.mr ?? 0}), currentHp: o.currentHp ?? o.maxHp ?? 1000});
test('spell not learned', () => {
  const r = Engine.spellDamage(D2, side({level: 3}), tgt(), 'R');
  assert.equal(r.learned, false); assert.equal(r.damage, 0);
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
test('order choices: 6 orders, or 24 when R ranks like a basic', () => {
  assert.equal(Engine.orderChoices(D2, 'Annie').length, 6);
  const d = {...D2, rules: {...D2.rules, skillRankRules: {Annie: {basicR: true}}}};
  assert.equal(Engine.orderChoices(d, 'Annie').length, 24);
  assert.equal(Engine.skillOrder(d, 'Annie').order.length, 4);
});
test('abilityRanks gives the ranks spellDamage uses', () => {
  const d = {...D2, rules: {...D2.rules, skillRankRules: {Annie: {free: {R: 1}}}}};
  const ranks = Engine.abilityRanks(d, 'Annie', 1, ['Q', 'W', 'E']);
  assert.equal(ranks.R, 1);
  assert.equal(Engine.spellDamage(d, side({level: 1}), tgt(), 'R').rank, 1);
});
test('rank table: abilities without ranks are marked', () => {
  const d = {...D2, rules: {...D2.rules, skillRankRules: {Annie: {noRanks: ['Q', 'W', 'E']}}}};
  const rows = Engine.spellRankTable(d, 'Annie', 9);
  assert.ok(rows[0].noRanks && !rows[3].noRanks);
});
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
test('annie-like q after magic resist', () => near(Engine.spellDamage(D2, side(), tgt({mr: 100}), 'Q').damage, 40));
test('missing health term uses current hp', () =>
  near(Engine.spellDamage(D2, side({level: 6}), tgt({maxHp: 1000, currentHp: 400}), 'R').raw, 150 + 0.25 * 600));
test('percent-shown max health term is divided by 100', () =>
  near(Engine.spellDamage(D2, side({level: 3}), tgt({maxHp: 2000}), 'E').raw, 0.04 * 2000));
test('unsupported spell reports what', () =>
  assert.deepEqual(Engine.spellDamage(D2, side({level: 2}), tgt(), 'W').unsupported, ['CooldownMultiplierCalculationPart']));
test('spell without damage lines', () => {
  const r = Engine.spellDamage(D2, side(), tgt(), 'P');
  assert.equal(r.noDamage, true); assert.equal(r.damage, 0);
});

// Stage 2, Task 5: combo.
const plainItem = (id) => ({id, name: {en: id, fr: id}, desc: {en: '', fr: ''}, gold: {total: 0, base: 0}, from: [], into: [],
  tier: 5, groups: [], boots: false, requiredChampion: null, stats: {}});
const D3 = {...D2,
  items: {...D2.items, ...Object.fromEntries(['kraken', 'sheen', 'luden', 'cdg', 'ldr', 'cleaver'].map((id) => [id, plainItem(id)]))},
  rules: {...D2.rules,
    runeDamage: {101: [{kind: 'proc', hits: 3, type: 'true', base: 100}], 102: [{kind: 'proc', hits: 1, type: 'adaptive', base: 100}]},
    itemDamage: {
      kraken: [{kind: 'onHit', every: 3, type: 'true', base: 50}],
      sheen: [{kind: 'spellblade', type: 'physical', base: 0, ratios: {baseAd: 1}}],
      luden: [{kind: 'afterSpell', type: 'magic', base: 40}],
      cdg: [{kind: 'amp', pct: 0.1, condition: 'targetBelow:40', applies: 'all'}],
      ldr: [{kind: 'amp', pct: 0.15, condition: 'targetBonusHp:1500', applies: 'all'}],
      cleaver: [{kind: 'shred', stat: 'armor', pctPerStack: 0.06, maxStacks: 5, on: 'physical'}],
    },
    runeDamageNone: [], runeDamageUnknown: [], itemDamageNone: [], itemDamageUnknown: ['eh'],
  }};
const attackerSide = (o = {}) => {
  const sel = {champ: 'Annie', level: o.level ?? 1, items: o.items || [], runes: o.runes || null, stacked: false, stacks: 0};
  return {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(D3, sel)};
};
const combo = (o = {}, steps = Engine.DEFAULT_COMBO) => Engine.runCombo(D3, attackerSide(o),
  {champ: 'Testo', stats: {base: {}, bonus: {hp: o.bonusHp || 0}, total: {hp: o.maxHp ?? 1000, armor: o.armor || 0, mr: 0}},
   currentHpPct: o.currentHpPct ?? 100}, steps);
const keystonePage = (id) => ({...VALID_PAGE, keystone: id, shards: [5005, 5010, 5011]}); // no adaptive shard

test('current hp clamped', () => {
  near(combo({currentHpPct: 0}).hpStart, 10);
  near(combo({currentHpPct: 250}).hpStart, 1000);
  near(combo({currentHpPct: 'x'}).hpStart, 1000);
});
test('kills at step and stops', () => {
  const r = combo({currentHpPct: 5});
  assert.equal(r.killsAt, 1); assert.equal(r.rows.length, 1); assert.equal(r.hpLeft, 0);
});
test('missing health spell last sees damage already dealt', () =>
  near(combo({level: 6, maxHp: 2000}, [{spell: 'Q'}, {spell: 'R'}]).rows[1].damage, 150 + 0.25 * 170)); // Q is rank 3 at level 6
test('unlearned spell row says not learned and adds nothing', () => {
  const r = combo({}, [{spell: 'R'}]);
  assert.ok(r.rows[0].notes.includes('not_learned')); near(r.hpLeft, 1000);
});
test('unsupported spell is excluded and listed', () => {
  const r = combo({level: 2}, [{spell: 'W'}]);
  assert.deepEqual(r.excluded, ['W']); near(r.hpLeft, 1000);
});
test('proc triggers once on third hit', () => near(combo({runes: keystonePage(101)}, [{autos: 5}]).hpLeft, 1000 - 300 - 100));
test('onHit every 3rd attack', () => near(combo({items: ['kraken']}, [{autos: 6}]).hpLeft, 1000 - 360 - 100));
test('spellblade after each spell, once', () =>
  near(combo({items: ['sheen']}, [{spell: 'Q'}, {autos: 2}, {spell: 'Q'}, {autos: 1}]).hpLeft, 1000 - 460));
test('afterSpell once', () => near(combo({items: ['luden']}, [{spell: 'Q'}, {spell: 'Q'}]).hpLeft, 1000 - 200));
test('amp targetBelow only under threshold', () => {
  near(combo({items: ['cdg'], currentHpPct: 30}, [{spell: 'Q'}]).rows[0].damage, 88);
  near(combo({items: ['cdg']}, [{spell: 'Q'}]).rows[0].damage, 80);
});
test('amp targetBonusHp scales', () => near(combo({items: ['ldr'], bonusHp: 750}, [{autos: 1}]).rows[0].damage, 64.5));
test('shred lowers resist for later steps only', () =>
  near(combo({items: ['cleaver'], armor: 100}, [{autos: 2}]).rows[0].damage, 30 + 60 * 100 / 194));
test('adaptive proc picks physical for AD champion', () =>
  near(combo({items: ['ls'], runes: keystonePage(102), armor: 100}, [{autos: 1}]).rows[0].damage, 70 * 100 / 200 + 50));
test('unknown item damage effect is flagged', () => assert.ok(combo({items: ['eh']}).flags.includes('unknown_damage:item:eh')));

// Stage 2, Task 6: effect options needed by the real rules.
const D4 = {...D3, champions: {...D3.champions, Ranged: {...D3.champions.Annie, id: 'Ranged', base: {...D3.champions.Annie.base, range: 550}}},
  items: {...D3.items, ...Object.fromEntries(['botrk', 'hob', 'mask', 'cutdown'].map((id) => [id, plainItem(id)]))},
  rules: {...D3.rules, itemDamage: {...D3.rules.itemDamage,
    botrk: [{kind: 'onHit', type: 'true', ratios: {targetCurrentHp: 0.09}, only: 'melee'},
            {kind: 'onHit', type: 'true', ratios: {targetCurrentHp: 0.06}, only: 'ranged'}],
    hob: [{kind: 'onHit', type: 'true', base: 10, limit: 3}],
    mask: [{kind: 'amp', pct: 0.12, condition: 'always', applies: 'magic'}],
    cutdown: [{kind: 'amp', pct: 0.08, condition: 'targetAbove:60', applies: 'all'}]}}};
const combo4 = (o = {}, steps) => {
  const sel = {champ: o.champ || 'Annie', level: 1, items: o.items || [], runes: null, stacked: false, stacks: 0};
  return Engine.runCombo(D4, {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(D4, sel)},
    {champ: 'Testo', stats: {base: {}, bonus: {}, total: {hp: 1000, armor: 0, mr: 0}}, currentHpPct: o.currentHpPct ?? 100}, steps);
};
test('melee and ranged effect values', () => {
  near(combo4({items: ['botrk']}, [{autos: 1}]).rows[0].damage, 60 + 90);
  near(combo4({champ: 'Ranged', items: ['botrk']}, [{autos: 1}]).rows[0].damage, 60 + 60);
});
test('on-hit limit', () => near(combo4({items: ['hob']}, [{autos: 5}]).hpLeft, 1000 - 300 - 30));
test('amp applies to magic only', () => {
  near(combo4({items: ['mask']}, [{spell: 'Q'}]).rows[0].damage, 80 * 1.12);
  near(combo4({items: ['mask']}, [{autos: 1}]).rows[0].damage, 60);
});
test('amp targetAbove', () => {
  near(combo4({items: ['cutdown']}, [{autos: 1}]).rows[0].damage, 60 * 1.08);
  near(combo4({items: ['cutdown'], currentHpPct: 50}, [{autos: 1}]).rows[0].damage, 60);
});
test('per-hit lines are reported by spellDamage and noted in the combo', () => {
  const PH = {...D3, champions: {...D3.champions, Annie: {...D3.champions.Annie, spells: D3.champions.Annie.spells.map((s) =>
    s.key === 'Q' ? {...s, lines: [{...s.lines[0], perHit: true}]} : s)}}};
  const sel = {champ: 'Annie', level: 1, items: [], runes: null, stacked: false, stacks: 0};
  const sideQ = {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(PH, sel)};
  const tgtQ = {champ: 'Testo', stats: {base: {}, bonus: {}, total: {hp: 1000, armor: 0, mr: 0}}, currentHpPct: 100};
  assert.equal(Engine.spellDamage(PH, sideQ, {stats: tgtQ.stats, currentHp: 1000}, 'Q').perHit, true);
  assert.ok(Engine.runCombo(PH, sideQ, tgtQ, [{spell: 'Q'}]).rows[0].notes.includes('per_hit'));
});
test('spells see shred from earlier hits', () => {
  const BL = {...D3, items: {...D3.items, bl: plainItem('bl')}, rules: {...D3.rules, itemDamage: {...D3.rules.itemDamage,
    bl: [{kind: 'shred', stat: 'mr', pctPerStack: 0.075, maxStacks: 4, on: 'magic'}]}}};
  const sel = {champ: 'Annie', level: 1, items: ['bl'], runes: null, stacked: false, stacks: 0};
  const r = Engine.runCombo(BL, {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(BL, sel)},
    {champ: 'Testo', stats: {base: {}, bonus: {}, total: {hp: 1000, armor: 0, mr: 100}}, currentHpPct: 100}, [{spell: 'Q'}, {spell: 'Q'}]);
  near(r.rows[0].damage, 40);
  near(r.rows[1].damage, 80 * 100 / 192.5);
});

// Stage 2 final-review fixes: how target-health numbers are scaled, and flags.
const scaleSpell = (terms, extra = {}) => spell('Q', {values: {V: [0, 1, 2], H: [0, 0.5]},
  calcs: {Pct: {parts: [{t: 'n', n: 0.04}], pct: true, mult: null, flags: []}}, lines: [{type: 'true', terms}], ...extra});
const D5 = (q) => ({...D3, champions: {...D3.champions, Annie: {...D3.champions.Annie,
  spells: D3.champions.Annie.spells.map((s) => (s.key === 'Q' ? q : s))}}});
const qDamage = (q, currentHp = 1000) => Engine.spellDamage(D5(q), side(), {stats: T({hp: 1000}), currentHp}, 'Q');
test('a 1 shown as "1%" is one percent', () => near(qDamage(scaleSpell([{value: 'V', kind: 'targetMax', percent: true}])).raw, 10));
test('a percentage formula is a fraction', () => near(qDamage(scaleSpell([{calc: 'Pct', kind: 'targetMax'}])).raw, 40));
test('the display multiplier applies to flat terms', () => near(qDamage(scaleSpell([{value: 'H', kind: 'flat', mult: 0.5}])).raw, 0.25));
test('a target-health term without % or percentage formula is unsupported', () =>
  assert.ok(qDamage(scaleSpell([{value: 'V', kind: 'targetMax'}])).unsupported.length > 0));
test('a percentage of another base is unsupported', () =>
  assert.ok(qDamage(scaleSpell([{value: 'V', kind: 'unsupported', percent: true}])).unsupported.length > 0));
test('a line whose damage varies is unsupported', () =>
  assert.ok(qDamage(scaleSpell([{value: 'V', kind: 'flat'}], {lines: [{type: 'true', varies: true, terms: [{value: 'V', kind: 'flat'}]}]}))
    .unsupported.length > 0));
test('a spell with no description or no game data is unsupported', () => {
  assert.ok(qDamage(scaleSpell([{value: 'V', kind: 'flat'}], {flags: ['no_tooltip']})).unsupported.length > 0);
  assert.ok(qDamage(scaleSpell([{value: 'V', kind: 'flat'}], {flags: ['no_cdragon_spell']})).unsupported.length > 0);
});
test('empty current health means full health', () => assert.equal(Engine.clampPct(''), 100));
test('afterAutos amp counts only basic attacks', () => {
  const PTA = {...D3, items: {...D3.items, pta: plainItem('pta')}, rules: {...D3.rules, itemDamage: {...D3.rules.itemDamage,
    pta: [{kind: 'amp', pct: 0.08, condition: 'afterAutos:3', applies: 'all'}]}}};
  const sel = {champ: 'Annie', level: 1, items: ['pta'], runes: null, stacked: false, stacks: 0};
  const run = (steps) => Engine.runCombo(PTA, {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(PTA, sel)},
    {champ: 'Testo', stats: {base: {}, bonus: {}, total: {hp: 5000, armor: 0, mr: 0}}, currentHpPct: 100}, steps);
  near(run([{spell: 'Q'}, {spell: 'Q'}, {spell: 'Q'}, {spell: 'Q'}]).rows[3].damage, 80);
  near(run([{autos: 3}, {spell: 'Q'}]).rows[1].damage, 80 * 1.08);
});
test('a spell with no readable line but an unparsed description is unsupported, not "no damage"', () => {
  const r = qDamage(scaleSpell([], {lines: [], flags: ['unparsed_tooltip']}));
  assert.ok(r.unsupported.length > 0); assert.notEqual(r.noDamage, true);
});

// Stage 3, Task 1: the shop's purchase rule.
const recipe = (id, base, from = [], extra = {}) => ({...plainItem(id), gold: {base, total: base}, from, tier: null, ...extra});
const R = {...D3, items: {...D3.items,
  sword: recipe('sword', 350), pick: recipe('pick', 875),
  dirk: recipe('dirk', 400, ['sword', 'sword']), blade: recipe('blade', 625, ['dirk', 'pick']),
  quest: recipe('quest', 100, ['missing'])}};
test('buy a component outright', () =>
  assert.deepEqual(Engine.purchase(R, 'Testo', [null, null], 'sword'), {items: ['sword', null], cost: 350, consumed: []}));
test('owned components reduce the price and free their slots', () =>
  assert.deepEqual(Engine.purchase(R, 'Testo', ['sword', 'sword', null], 'dirk'),
    {items: ['dirk', null, null], cost: 400, consumed: ['sword', 'sword']}));
test('each owned item is used once (one of two swords owned)', () =>
  assert.equal(Engine.purchase(R, 'Testo', ['sword', null], 'dirk').cost, 750));
test('components of components count', () =>
  assert.deepEqual(Engine.purchase(R, 'Testo', ['sword', 'pick', null], 'blade'),
    {items: ['blade', null, null], cost: 625 + 400 + 350, consumed: ['sword', 'pick']}));
test('full inventory: only a buy that frees a slot fits', () => {
  const full = ['sword', 'sword', 'ls', 'ls', 'ls', 'ls'];
  assert.equal(Engine.purchase(R, 'Testo', full, 'pick'), null);
  assert.equal(Engine.purchase(R, 'Testo', full, 'dirk').cost, 400);
});
test('illegal result is null', () => assert.equal(Engine.purchase(R, 'Testo', ['boots', null], 'boots2'), null));
test('recipe with an unknown component is null', () => assert.equal(Engine.purchase(R, 'Testo', [null], 'quest'), null));

// Stage 3, Task 3: scoring and ranking purchases.
const shopItem = (id, stats, total) => ({...plainItem(id), stats, gold: {base: total, total}});
const D6 = {...D3,
  champions: {...D3.champions, Foe: {...D3.champions.Annie, id: 'Foe'}},
  items: {ls: shopItem('ls', {ad: 10}, 350), bf: shopItem('bf', {ad: 40}, 1300), ruby: shopItem('ruby', {hp: 150}, 400),
          cap: shopItem('cap', {ap: 130}, 1000), shieldy: shopItem('shieldy', {hp: 100}, 1000), eh: shopItem('eh', {ad: 50}, 1000)},
  rules: {...D3.rules, advisorNotScored: ['shieldy']}};
const sel6 = (champ, items) => ({champ, level: 6, items, runes: null, stacked: false, stacks: 0, priority: ['Q', 'W', 'E'],
  combo: Engine.DEFAULT_COMBO, currentHpPct: 100});
const YOU = sel6('Annie', ['ls', null, null, null, null, null]);
const FOE = sel6('Foe', [null, null, null, null, null, null]);
const advise = (gold) => Engine.adviseBuys(D6, YOU, FOE, gold);
const comboWith = (items) => Engine.runCombo(D6, {...YOU, items, stats: Engine.championStats(D6, {...YOU, items})},
  {champ: 'Foe', stats: Engine.championStats(D6, FOE), currentHpPct: 100}, YOU.combo);
test('no gold: no limit, single buys only', () => {
  for (const g of [0, -5, '', 'x']) {
    const a = advise(g);
    assert.ok(a.unlimited && a.rows.length && a.rows.every((r) => r.buys.length === 1), String(g));
    assert.ok(a.rows.some((r) => r.cost > 3000) || a.rows.some((r) => r.buys.join() === 'bf'), String(g));
  }
});
test('cheapest first: cost, then value, and buys that add nothing are left out', () => {
  const rows = [{offense: 50, killsAt: null, cost: 900}, {offense: 10, killsAt: null, cost: 300},
    {offense: 40, killsAt: null, cost: 300}, {offense: 0, killsAt: null, cost: 100}];
  assert.deepEqual(Engine.rankBuys(rows, 'offense', false, 20, true).map((r) => r.offense), [40, 10, 50]);
});
test('nothing affordable', () => assert.equal(advise(100).error, 'nothing_affordable'));
test('single buys scored against the baseline', () => {
  const a = advise(1300);
  const r = a.rows.find((x) => x.buys.join() === 'bf');
  near(r.offense, a.baseline.hpLeft - comboWith(['ls', 'bf', null, null, null, null]).hpLeft);
  assert.equal(r.cost, 1300);
  assert.ok(r.offense > 0);
});
test('defense item raises your hp left', () => assert.ok(advise(1000).rows.find((x) => x.buys.join() === 'ruby').defense > 0));
test('pairs within gold, deduplicated by final inventory', () => {
  const rows = advise(2000).rows;
  assert.ok(rows.some((x) => x.buys.length === 2));
  assert.ok(rows.every((x) => x.cost <= 2000));
  assert.equal(new Set(rows.map((x) => x.items.filter(Boolean).sort().join())).size, rows.length);
});
test('triples are built', () => assert.ok(advise(5000).rows.some((x) => x.buys.length === 3)));
test('not-scored items are listed, never ranked', () => {
  const a = advise(3000);
  assert.ok(a.notScored.some((x) => x.id === 'shieldy' && x.cost === 1000));
  assert.ok(!a.rows.some((x) => x.buys.includes('shieldy')));
});
test('partly counted flag', () => assert.ok(advise(3000).rows.find((x) => x.buys.join() === 'eh').flags.includes('partly_counted:eh')));
test('ranking ties: both kill → earlier kill step, then cheaper', () => {
  const rows = [{offense: 0, killsAt: 3, cost: 500}, {offense: 0, killsAt: 2, cost: 900}, {offense: 0, killsAt: 2, cost: 400}];
  assert.deepEqual(Engine.rankBuys(rows, 'offense', false).map((r) => r.cost), [400, 900, 500]);
});
test('defense ties: surviving (null) beats dying later beats dying earlier', () => {
  const rows = [{defense: 0, enemyKillsAt: 2, cost: 1}, {defense: 0, enemyKillsAt: null, cost: 2}, {defense: 0, enemyKillsAt: 4, cost: 3}];
  assert.deepEqual(Engine.rankBuys(rows, 'defense', false).map((r) => r.cost), [2, 3, 1]);
});
test('per 100 gold divides by cost and never by zero', () => {
  const rows = [{offense: 100, killsAt: null, cost: 1000}, {offense: 30, killsAt: null, cost: 100}, {offense: 5, killsAt: null, cost: 0}];
  assert.deepEqual(Engine.rankBuys(rows, 'offense', true).map((r) => r.cost), [0, 100, 1000]);
});
test('rankBuys keeps the top N', () =>
  assert.equal(Engine.rankBuys(Array.from({length: 30}, (_, i) => ({offense: i, killsAt: null, cost: 1})), 'offense', false).length, 20));
test('no NaN anywhere', () =>
  assert.ok(advise(5000).rows.every((r) => Number.isFinite(r.offense) && Number.isFinite(r.defense) && Number.isFinite(r.cost))));
test('ties at equal value and cost prefer fewer buys', () => {
  const rows = [{offense: 5, killsAt: null, cost: 100, buys: ['a', 'b']}, {offense: 5, killsAt: null, cost: 100, buys: ['a']}];
  assert.deepEqual(Engine.rankBuys(rows, 'offense', false).map((r) => r.buys.length), [1, 2]);
});
test('tier-3 boot upgrades (unlocked in game, not bought) are not suggested', () => {
  const T7 = {...D6, items: {...D6.items, t3: {...shopItem('t3', {ms: 10}, 0), tier: 7}}};
  assert.ok(!Engine.adviseBuys(T7, YOU, FOE, 1000).rows.some((r) => r.buys.includes('t3')));
});

// Stage 3 final-review fixes: the search.
const D7 = {...D6, items: {...D6.items, bigsword: {...shopItem('bigsword', {ad: 35}, 1000), gold: {base: 650, total: 1000}, from: ['ls']}}};
const EMPTY = sel6('Annie', [null, null, null, null, null, null]);
const inventories = (gold) => Engine.adviseBuys(D7, EMPTY, FOE, gold).rows.map((r) => r.items.filter(Boolean).sort().join(','));
test('the same item twice is a candidate', () => assert.ok(inventories(700).includes('ls,ls')));
test('an item plus a spare copy of its own component is a candidate', () => assert.ok(inventories(1350).includes('bigsword,ls')));
test('three of the same is a candidate', () => assert.ok(inventories(1050).includes('ls,ls,ls')));

// Stage 4, Task 1: beam search over items for one stat.
const rItem = (id, stats, gold, extra = {}) => ({...plainItem(id), stats, gold: {base: gold, total: gold}, ...extra});
const DR = {...D3,
  champions: {
    ...Object.fromEntries(Object.entries(D3.champions).map(([k, c]) => [k, {...c, resource: 'Energy'}])),
    Tanky: {...D3.champions.Annie, id: 'Tanky', name: {en: 'Tanky', fr: 'Tanky'}, resource: 'Energy',
            base: {...D3.champions.Annie.base, hp: 900, hpperlevel: 120}},
    Manny: {...D3.champions.Annie, id: 'Manny', name: {en: 'Manny', fr: 'Manny'}, resource: 'Mana',
            base: {...D3.champions.Annie.base, mp: 400, mpperlevel: 30}},
  },
  items: {
    hp1: rItem('hp1', {hp: 400}, 900, {groups: ['U1']}), hp2: rItem('hp2', {hp: 300}, 600, {groups: ['U2']}),
    hp3: rItem('hp3', {hp: 200}, 400, {groups: ['U3']}), ruby: rItem('ruby', {hp: 150}, 400),
    boots: rItem('boots', {ms: 45}, 300, {groups: ['Boots'], boots: true}),
    boots2: rItem('boots2', {ms: 60}, 1000, {groups: ['Boots'], boots: true}),
    cap: rItem('cap', {ap: 130}, 3600, {groups: ['Cap']}), apc: rItem('apc', {ap: 60}, 400),
    critI: rItem('critI', {crit: 60}, 1200), eh: rItem('eh', {ad: 50}, 1000, {groups: ['U4']}),
    ls: rItem('ls', {ad: 10}, 350), bow: rItem('bow', {as: 25}, 900),
  },
  groups: {U1: 1, U2: 1, U3: 1, U4: 1, Boots: 1, Cap: 1},
};
// Every multiset of up to 6 items, legal and within gold: the true best value on the reference champion.
function bruteBest(stat, maxGold = Infinity) {
  const ids = Object.keys(DR.items);
  let best = -Infinity;
  const walk = (start, build, cost) => {
    if (Engine.validateBuild(DR, 'Annie', build).length === 0 && cost <= maxGold) {
      best = Math.max(best, Engine.championStats(DR, {champ: 'Annie', level: 18, items: build, runes: null, stacked: true, stacks: 0}).total[stat] || 0);
    }
    if (build.length === 6) return;
    for (let i = start; i < ids.length; i++) walk(i, [...build, ids[i]], cost + DR.items[ids[i]].gold.total);
  };
  walk(0, [], 0);
  return best;
}
test('beam finds the brute-force best health build', () => near(Engine.bestBuilds(DR, {stat: 'hp', level: 18})[0].value, bruteBest('hp')));
test('beam finds the brute-force best with a gold limit', () =>
  near(Engine.bestBuilds(DR, {stat: 'hp', level: 18, maxGold: 2000})[0].value, bruteBest('hp', 2000)));
test('beam finds the brute-force best ability power (multiplier counted)', () => {
  const top = Engine.bestBuilds(DR, {stat: 'ap', level: 18})[0];
  near(top.value, bruteBest('ap')); assert.ok(top.items.includes('cap'));
});
test('builds are legal, padded to 6 slots, at most 6 items', () => {
  for (const b of Engine.bestBuilds(DR, {stat: 'hp', level: 18})) {
    assert.equal(b.items.length, 6);
    assert.ok(b.items.filter(Boolean).length <= 6);
    assert.deepEqual(Engine.validateBuild(DR, 'Annie', b.items), []);
  }
});
test('repeatable items can repeat', () =>
  assert.ok(Engine.bestBuilds(DR, {stat: 'hp', level: 18})[0].items.filter((i) => i === 'ruby').length >= 2));
test('gold limit below every item gives the empty build', () =>
  assert.deepEqual(Engine.bestBuilds(DR, {stat: 'hp', level: 18, maxGold: 100})[0].items.filter(Boolean), []));
test('at most 60 builds, best first', () => {
  const b = Engine.bestBuilds(DR, {stat: 'hp', level: 18});
  assert.ok(b.length <= 60);
  for (let i = 1; i < b.length; i++) assert.ok(b[i - 1].value >= b[i].value);
});

// Stage 4, Task 2: rank champions.
test('one row per champion, best champion first, count honoured', () => {
  const r = Engine.rankStat(DR, {stat: 'hp', level: 18, count: 3}).rows;
  assert.equal(r.length, 3);
  assert.equal(new Set(r.map((x) => x.champ)).size, 3);
  assert.equal(r[0].champ, 'Tanky');
  assert.equal(r[0].rank, 1);
});
test('health shards: level-scaling health beats flat at level 18', () =>
  assert.deepEqual(Engine.rankStat(DR, {stat: 'hp', level: 18, count: 1}).rows[0].runes.shards.slice(1), [5001, 5001]));
test('rune pages are legal and complete', () => {
  for (const row of Engine.rankStat(DR, {stat: 'hp', level: 18, count: 50}).rows) {
    assert.deepEqual(Engine.validateRunePage(DR, row.runes), []);
    assert.ok(row.runes.keystone !== null && row.runes.secondaryRunes.every((r) => r !== null));
  }
});
test('rows are legal for their champion (no boots for Cassiopeia)', () => {
  const rows = Engine.rankStat(DR, {stat: 'ms', level: 18, count: 50}).rows;
  for (const row of rows) assert.deepEqual(Engine.validateBuild(DR, row.champ, row.items), []);
  assert.ok(!rows.find((r) => r.champ === 'Cassiopeia').items.some((i) => i && DR.items[i].boots));
});
test('capped stat: ties share a rank, nothing over the cap', () => {
  const rows = Engine.rankStat(DR, {stat: 'crit', level: 18, count: 50}).rows;
  assert.ok(rows.every((r) => r.value <= 100));
  assert.equal(rows[0].rank, rows[1].rank);
});
test('stacks off by default, on when asked', () => {
  const ap = (o) => Engine.rankStat(DR, {stat: 'ap', level: 18, count: 50, ...o}).rows.find((r) => r.champ === 'Veigar').value;
  assert.ok(ap({stacks: 100}) > ap({}));
});
test('mana ranks only mana users', () =>
  assert.ok(Engine.rankStat(DR, {stat: 'mp', level: 18, count: 50}).rows.every((r) => DR.champions[r.champ].resource === 'Mana')));
test('gold limit below every item: base stats, no error', () =>
  assert.ok(Engine.rankStat(DR, {stat: 'hp', level: 18, maxGold: 100}).rows.every((r) => r.items.every((i) => !i))));
test('partly counted flags', () => {
  const row = Engine.rankStat(DR, {stat: 'ad', level: 18, count: 1}).rows[0];
  assert.ok(row.items.includes('eh'));
  assert.ok(row.flags.includes('partly_counted:item:eh'));
});
test('count is clamped to 1..50 and defaults to 10', () => {
  assert.equal(Engine.rankStat(DR, {stat: 'hp'}).rows.length, 10);
  assert.equal(Engine.rankStat(DR, {stat: 'hp', count: 0}).rows.length, 1);
});
test('no NaN for any rankable stat', () => {
  for (const stat of Engine.RANKABLE_STATS) {
    assert.ok(Engine.rankStat(DR, {stat, level: 18}).rows.every((r) => Number.isFinite(r.value)), stat);
  }
});

// Stage 4 final-review fixes.
test('attack speed ties use the displayed precision (3 decimals)', () => {
  const two = {Slow: {...DR.champions.Annie, id: 'Slow', name: {en: 'Slow', fr: 'Slow'}, base: {...DR.champions.Annie.base, as: 0.64, asperlevel: 0}},
               Quick: {...DR.champions.Annie, id: 'Quick', name: {en: 'Quick', fr: 'Quick'}, base: {...DR.champions.Annie.base, as: 0.66, asperlevel: 0}}};
  const rows = Engine.rankStat({...DR, champions: two}, {stat: 'as', level: 1, count: 2, maxGold: 100}).rows;
  assert.notEqual(rows[0].value.toFixed(3), rows[1].value.toFixed(3));
  assert.deepEqual(rows.map((r) => r.rank), [1, 2]);
});
test('move speed rune pages try Base % move speed runes (Celerity-like)', () => {
  const DM = {...DR, rules: {...DR.rules, runeStats: {...DR.rules.runeStats, 222: [{stat: 'msPct', value: 1, always: true}]}}};
  const page = Engine.bestRunePage(DM, {champ: 'Annie', level: 18, items: [], runes: null, stacked: true, stacks: 0}, 'ms');
  assert.ok([page.keystone, ...page.primaryRunes, ...page.secondaryRunes].includes(222));
});
test('mana regen ranks only mana users', () =>
  assert.ok(Engine.rankStat(DR, {stat: 'mpregen', level: 18, count: 50}).rows.every((r) => DR.champions[r.champ].resource === 'Mana')));
test('tenacity from several items stacks multiplicatively', () => {
  const DT = {...DR, items: {...DR.items, merc: rItem('merc', {tenacity: 30}, 100), sterak: rItem('sterak', {tenacity: 20}, 100)}};
  const t = Engine.championStats(DT, {champ: 'Annie', level: 18, items: ['merc', 'sterak'], runes: null, stacked: false, stacks: 0}).total.tenacity;
  assert.ok(Math.abs(t - 44) < 1e-9, String(t)); // 1 - 0.7 x 0.8
});
test('tenacity is capped at 100', () => {
  const DT = {...DR, items: {...DR.items, ten: rItem('ten', {tenacity: 40}, 100)}};
  assert.ok(Engine.championStats(DT, {champ: 'Annie', level: 18, items: ['ten', 'ten', 'ten'], runes: null, stacked: false, stacks: 0}).total.tenacity <= 100);
});
test('a stat that scales with the champion: the best champion gets its own best build', () => {
  // 'pct' adds Base Health Regen %: worth a lot only on a champion with high base regen.
  const DH = {...DR,
    champions: {...DR.champions, Regen: {...DR.champions.Annie, id: 'Regen', name: {en: 'Regen', fr: 'Regen'},
      base: {...DR.champions.Annie.base, hpregen: 50, hpregenperlevel: 0}}},
    items: {...DR.items, flat: rItem('flat', {}, 300), pct: rItem('pct', {hpRegenPct: 100}, 300)},
    rules: {...DR.rules, itemStatPassives: {...DR.rules.itemStatPassives, flat: [{op: 'add', stat: 'hpregen', value: 10}]}}};
  const regen = Engine.rankStat(DH, {stat: 'hpregen', level: 18, count: 50}).rows.find((r) => r.champ === 'Regen');
  near(regen.value, 50 * 7);   // 6 × 'pct' = +600% of 50, better than any 'flat' mix on this champion
});

// Healing from life steal (basic attacks and on-hit) and omnivamp (all damage).
const vampCombo = (vamp, steps, o = {}) => {
  const side = attackerSide(o);
  side.stats.total.lifesteal = vamp.lifesteal || 0;
  side.stats.total.omnivamp = vamp.omnivamp || 0;
  side.currentHpPct = o.yourHpPct ?? 50;
  return Engine.runCombo(D3, side, {champ: 'Testo', stats: {base: {}, bonus: {}, total: {hp: o.maxHp ?? 1000, armor: 0, mr: 0}},
    currentHpPct: 100}, steps);
};
test('life steal heals from basic attacks only, omnivamp from everything', () => {
  const autos = vampCombo({lifesteal: 20}, [{autos: 2}]);
  near(autos.healed, 0.2 * autos.rows[0].damage);
  near(autos.rows[0].healed, autos.healed);
  assert.equal(vampCombo({lifesteal: 20}, [{spell: 'Q'}]).healed, 0);
  const q = vampCombo({omnivamp: 10}, [{spell: 'Q'}]);
  near(q.healed, 0.1 * q.rows[0].damage);
});
test('on-hit item damage counts for life steal', () => {
  const plain = vampCombo({lifesteal: 10}, [{autos: 3}]);
  const kraken = vampCombo({lifesteal: 10}, [{autos: 3}], {items: ['kraken']});
  near(kraken.healed - plain.healed, 0.1 * 50);
});
test('no healing from damage past the target\'s remaining health', () => {
  const r = vampCombo({omnivamp: 10}, [{autos: 20}], {maxHp: 30});
  near(r.healed, 3);
});
test('healing counted only up to your missing health', () => {
  const side = attackerSide();
  const missing = side.stats.total.hp * 0.02;
  assert.equal(vampCombo({lifesteal: 100}, [{autos: 3}], {yourHpPct: 100}).healedUsed, 0);
  near(vampCombo({lifesteal: 100}, [{autos: 3}], {yourHpPct: 98}).healedUsed, missing);
});

test('temporary buffs', () => {
  const B = {...D, rules: {...D.rules, buffs: [
    {id: 'baron', byMinute: [20, 40], add: {ad: [12, 48], ap: [20, 80]}}, {id: 'ghost', byLevel: true, add: {msPct: [24, 50.82]}},
    {id: 'elixirIron', add: {hp: 300, tenacity: 25}}, {id: 'elixirSorcery', add: {ap: 50, mpregen: 15}},
    {id: 'elixirWrath', add: {ad: 30}}, {id: 'infernal', max: 4, mulTotal: {ad: 0.03, ap: 0.03}},
    {id: 'chemtech', max: 4, add: {tenacity: 6, hsp: 6}}]}};
  const s = (o) => Engine.championStats(B, {champ: 'Testo', level: 1, items: [], runes: null, stacked: false, stacks: 0, ...o});
  const none = s({});
  near(s({buffs: {elixirWrath: 1}}).total.ad - none.total.ad, 30);
  near(s({buffs: {baron: 30}}).bonus.ad, 30);                 // halfway from 12 to 48
  near(s({buffs: {baron: 50}}).bonus.ap, 80);                 // capped at 40 min
  near(s({buffs: {infernal: 2}}).total.ad, none.total.ad * 1.06);
  near(s({items: ['cap'], buffs: {infernal: 4}}).total.ap, s({items: ['cap']}).total.ap / 1.3 * 1.42); // adds to Rabadon's 30%
  near(s({buffs: {elixirSorcery: 1}}).total.mpregen - none.total.mpregen, 15);
  near(s({buffs: {elixirIron: 1, chemtech: 1}}).total.tenacity, 100 - 75 * 0.94); // sources multiply
  near(s({level: 18, buffs: {ghost: 1}}).bonus.msPct, 50.82);
  assert.ok(Engine.statBreakdown(B, {champ: 'Testo', level: 1, items: [], runes: null, buffs: {elixirWrath: 1}})
    .columns.find((c) => c.kind === 'buffs').values.ad > 29);
});
