// Engine checks against the real generated data. Exact values are pinned to 16.23.1 and only run on that patch;
// the other tests run on every patch.
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis.window || {};
require('./data.js');
const Engine = require('./engine.js');
const D = window.DATA;
const pinned = {skip: D.patch !== '16.23.1' && 'exact values are for 16.23.1'};

test('Jinx level 18 base stats', pinned, () => {
  const s = Engine.championStats(D, {champ: 'Jinx', level: 18, items: [], runes: null, stacked: false, stacks: 0});
  assert.equal(Math.round(s.total.hp), 2395);
  assert.equal(Math.round(s.total.armor * 10) / 10, 97.4);
});
test('two Rabadon is illegal', pinned, () =>
  assert.ok(Engine.validateBuild(D, 'Annie', ['3089', '3089']).some((e) => e.startsWith('group_limit'))));
test('Ravenous Hydra and Stridebreaker share a group', pinned, () =>
  assert.ok(Engine.validateBuild(D, 'Darius', ['3074', '6631']).includes('group_limit:CleaveItems')));
test('two pairs of boots is illegal', pinned, () =>
  assert.ok(Engine.validateBuild(D, 'Jinx', ['3006', '3020']).includes('group_limit:Boots')));
test('Cassiopeia cannot buy boots', pinned, () =>
  assert.deepEqual(Engine.validateBuild(D, 'Cassiopeia', ['3020']), ['no_boots_champion']));
test('a normal build is legal', pinned, () =>
  assert.deepEqual(Engine.validateBuild(D, 'Annie', ['3020', '3089', '3135', '3157', '4645', '3165']), []));

test('Annie rank 1 Q deals 80 to a target with no magic resist', pinned, () => {
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

test('advisor on real data: fast, within gold, legal, useful', pinned, () => {
  const sel = (champ, items) => ({champ, level: 11, items, runes: null, stacked: false, stacks: 0, priority: ['Q', 'W', 'E'],
    combo: Engine.DEFAULT_COMBO, currentHpPct: 100});
  const t0 = Date.now();
  const a = Engine.adviseBuys(D, sel('Garen', ['3047', '3071', null, null, null, null]), sel('Annie', ['3020', '3089', null, null, null, null]), 3000);
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, `${ms} ms`);
  assert.ok(a.rows.length > 0);
  for (const r of a.rows) {
    assert.ok(r.cost <= 3000);
    assert.deepEqual(Engine.validateBuild(D, 'Garen', r.items), []);
  }
  assert.ok(Engine.rankBuys(a.rows, 'offense', false)[0].offense > 0);
});

test('every champion gives real numbers at levels 1 and 18, alone and in a combo (any patch)', () => {
  for (const champ of Object.keys(D.champions)) {
    for (const level of [1, 18]) {
      const sel = {champ, level, items: [], runes: null, stacked: false, stacks: 0, priority: ['Q', 'W', 'E'],
        combo: Engine.DEFAULT_COMBO, currentHpPct: 100};
      const stats = Engine.championStats(D, sel);
      for (const v of Object.values(stats.total)) assert.ok(Number.isFinite(v), `${champ} ${level}`);
      const r = Engine.runCombo(D, {...sel, stats}, {champ, stats, currentHpPct: 100}, sel.combo);
      assert.ok(Number.isFinite(r.hpLeft), `${champ} ${level} combo`);
    }
  }
});
