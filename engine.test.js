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
