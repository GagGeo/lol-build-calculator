// Engine checks against the real generated data (patch 16.23.1). Update pinned values when a patch changes them.
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis.window || {};
require('./data.js');
const Engine = require('./engine.js');
const D = window.DATA;

test('Jinx level 18 base stats', () => {
  const s = Engine.championStats(D, {champ: 'Jinx', level: 18, items: [], runes: null, stacked: false, stacks: 0});
  assert.equal(Math.round(s.total.hp), 2395);
  assert.equal(Math.round(s.total.armor * 10) / 10, 97.4);
});
test('two Rabadon is illegal', () =>
  assert.ok(Engine.validateBuild(D, 'Annie', ['3089', '3089']).some((e) => e.startsWith('group_limit'))));
test('Ravenous Hydra and Stridebreaker share a group', () =>
  assert.ok(Engine.validateBuild(D, 'Darius', ['3074', '6631']).includes('group_limit:CleaveItems')));
test('two pairs of boots is illegal', () =>
  assert.ok(Engine.validateBuild(D, 'Jinx', ['3006', '3020']).includes('group_limit:Boots')));
test('Cassiopeia cannot buy boots', () =>
  assert.deepEqual(Engine.validateBuild(D, 'Cassiopeia', ['3020']), ['no_boots_champion']));
test('a normal build is legal', () =>
  assert.deepEqual(Engine.validateBuild(D, 'Annie', ['3020', '3089', '3135', '3157', '4645', '3165']), []));

test('Annie rank 1 Q deals 80 to a target with no magic resist', () => {
  const sel = {champ: 'Annie', level: 1, items: [], runes: null, stacked: false, stacks: 0};
  const side = {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(D, sel)};
  const target = {stats: {base: {}, bonus: {}, total: {hp: 1000, armor: 0, mr: 0}}, currentHp: 1000};
  const r = Engine.spellDamage(D, side, target, 'Q');
  assert.equal(r.rank, 1);
  assert.equal(r.type, 'magic');
  assert.ok(Math.abs(r.damage - 80) < 1e-9, String(r.damage));
});
test('every real damage rule uses a known effect kind', () => {
  const kinds = new Set(['proc', 'onHit', 'spellblade', 'afterSpell', 'amp', 'shred']);
  for (const list of [D.rules.runeDamage, D.rules.itemDamage]) {
    for (const [id, effects] of Object.entries(list)) for (const e of effects) assert.ok(kinds.has(e.kind), id);
  }
});
