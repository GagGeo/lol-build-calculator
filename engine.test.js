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
const {QSPELL, MIXSPELL, STD, UDYR_LIKE} = require('./fixture.js');
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
test('custom ranks follow maxrank', () => {
  const r = Engine.skillRanks(UDYR_LIKE, 18);
  assert.ok(r.Q <= 6 && r.R <= 6);
  assert.equal(r.Q + r.W + r.E + r.R, 18);
});
