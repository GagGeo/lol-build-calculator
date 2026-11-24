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

test('rankings on real data (any patch): fast, legal, sorted, sensible', () => {
  for (const stat of ['hp', 'ms', 'ap']) {
    const t0 = Date.now();
    const {rows} = Engine.rankStat(D, {stat, level: 18});
    assert.ok(Date.now() - t0 < 3000, `${stat} took ${Date.now() - t0} ms`);
    assert.equal(rows.length, 10);
    for (let i = 0; i < rows.length; i++) {
      assert.deepEqual(Engine.validateBuild(D, rows[i].champ, rows[i].items), [], `${stat} ${rows[i].champ}`);
      if (i) assert.ok(rows[i - 1].value >= rows[i].value);
    }
    if (stat === 'hp') {
      const bestBase = Math.max(...Object.keys(D.champions).map((c) =>
        Engine.championStats(D, {champ: c, level: 18, items: [], runes: null, stacked: false, stacks: 0}).total.hp));
      assert.ok(rows[0].value >= bestBase + 4000, `${rows[0].value} vs base ${bestBase}`);
    }
  }
});

test('rankings: no gold limit is never worse than a gold limit (any patch)', () => {
  for (const stat of ['hpregen', 'mpregen', 'ms', 'hp', 'armor']) {
    const free = Engine.rankStat(D, {stat, level: 18, count: 1}).rows[0].value;
    const capped = Engine.rankStat(D, {stat, level: 18, count: 1, maxGold: 3000}).rows[0].value;
    assert.ok(free >= capped - 1e-9, `${stat}: ${free} < ${capped}`);
  }
});

// --- Champion passives and level growth (feedback from a Grandmaster player) ------------------------
const at = (champ, level, o = {}) => Engine.championStats(D, {champ, level, items: o.items || [], runes: null,
  stacked: !!o.stacked, stacks: o.stacks || 0});
test('every champion but a few gains attack damage per level', () =>
  assert.ok(Object.values(D.champions).filter((c) => at(c.id, 18).total.ad <= at(c.id, 1).total.ad).length <= 3));
test('Tristana: AD and attack range grow with level', pinned, () => {
  assert.equal(Math.round(at('Tristana', 18).total.ad * 10) / 10, 117.8);
  assert.equal(at('Tristana', 1).total.range, 550);
  assert.equal(at('Tristana', 18).total.range, 700);
});
test('Kayle: range 525 from level 6, 625 from 16', pinned, () =>
  assert.deepEqual([5, 6, 15, 16].map((l) => at('Kayle', l).total.range), [175, 525, 525, 625]));
test('Pyke: bonus health becomes AD (14 to 1)', pinned, () => {
  const bare = at('Pyke', 1), cleaver = at('Pyke', 1, {items: ['3071']});
  assert.equal(cleaver.total.hp, bare.total.hp);
  assert.ok(Math.abs(cleaver.total.ad - bare.total.ad - 45 - 400 / 14) < 1e-9);
});
test('Yasuo: crit chance doubled, crit over 100% becomes AD', pinned, () => {
  const s = at('Yasuo', 1, {items: ['3031', '3046', '3094']}); // 25 + 25 + 25 crit -> 150%
  assert.equal(s.total.crit, 100);
  assert.ok(Math.abs(s.total.ad - (at('Yasuo', 1).total.ad + 75 + 25)) < 1e-9); // IE 75 AD, 50% excess x 0.5
});
test('stat passives that cannot be read are flagged, never silently zero', () => {
  for (const c of Object.keys(D.rules.championPassiveStats)) {
    for (const stacked of [false, true]) assert.deepEqual(at(c, 18, {stacked}).flags, [], c);
  }
});
test('Sona: Ability Haste stacks stop at 60', () => assert.equal(at('Sona', 1, {stacks: 500}).bonus.ah, 60));
test('default combo has the passive after the autos when it deals damage', () => {
  assert.deepEqual(Engine.defaultCombo(D, 'Quinn').map((s) => s.spell || 'A'), ['Q', 'W', 'E', 'A', 'P', 'R']);
  assert.ok(!Engine.defaultCombo(D, 'Tristana').some((s) => s.spell === 'P'));
  assert.ok(!Engine.defaultCombo(D, 'Sion').some((s) => s.spell === 'P')); // only after death
});
test('Quinn combo counts Harrier', pinned, () => {
  const side = (champ) => {
    const sel = {champ, level: 9, items: [], runes: null, stacked: false, stacks: 0};
    return {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(D, sel), currentHpPct: 100};
  };
  const r = Engine.runCombo(D, side('Quinn'), side('Garen'), Engine.defaultCombo(D, 'Quinn'));
  const p = r.rows.find((row) => row.label === 'P');
  assert.ok(p && p.damage > 0 && !p.notes.includes('excluded'), JSON.stringify(p));
});
test('Kayle passive waves only from level 11', () => {
  const side = (level) => {
    const sel = {champ: 'Kayle', level, items: [], runes: null, stacked: false, stacks: 0};
    return {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(D, sel)};
  };
  const target = {stats: {base: {}, bonus: {}, total: {hp: 1000, armor: 0, mr: 0}}};
  assert.equal(Engine.spellDamage(D, side(10), target, 'P').learned, false);
  assert.ok(Engine.spellDamage(D, side(11), target, 'P').damage > 0);
});

// --- Spell heals and Grievous Wounds ------------------------------------------------------------------
const healSide = (champ, level = 9, o = {}) => {
  const sel = {champ, level, items: o.items || [], runes: null, stacked: false, stacks: 0};
  return {...sel, priority: ['Q', 'W', 'E'], stats: Engine.championStats(D, sel), currentHpPct: o.hpPct ?? 50};
};
test('% of damage dealt heals scale with the damage (Warwick Q)', () => {
  const s = healSide('Warwick');
  const a = Engine.spellHeal(D, s, 'Q', {damage: 100}), b = Engine.spellHeal(D, s, 'Q', {damage: 200});
  assert.ok(a.heal > 0 && Math.abs(b.heal - 2 * a.heal) < 1e-9, JSON.stringify(a));
});
test('% of missing health heals read your current health (Darius Q)', () => {
  const s = healSide('Darius'), max = s.stats.total.hp;
  const half = Engine.spellHeal(D, s, 'Q', {selfHp: max / 2}).heal, quarter = Engine.spellHeal(D, s, 'Q', {selfHp: max * 0.75}).heal;
  assert.ok(half > 0 && Math.abs(half - 2 * quarter) < 1e-9);
});
test('heals that need something outside the combo are not counted (Garen passive)', () =>
  assert.equal(Engine.spellHeal(D, healSide('Garen'), 'P', {}).heal, 0));
test('a heal that cannot be read is flagged, not guessed (Camille W)', () =>
  assert.ok(Engine.spellHeal(D, healSide('Camille'), 'W', {damage: 100}).unsupported.length > 0));
test('Heal and Shield Power boosts spell heals', () => {
  const s = healSide('Warwick'), base = Engine.spellHeal(D, s, 'Q', {damage: 100}).heal;
  const boosted = {...s, stats: {...s.stats, total: {...s.stats.total, hsp: 20}}};
  assert.ok(Math.abs(Engine.spellHeal(D, boosted, 'Q', {damage: 100}).heal - base * 1.2) < 1e-9);
});
test('Grievous Wounds on the enemy cuts all your healing by 40%', () => {
  const target = (items) => ({champ: 'Garen', stats: Engine.championStats(D, {champ: 'Garen', level: 9, items, runes: null}),
    currentHpPct: 100, items});
  const steps = [{spell: 'Q'}, {autos: 3}];
  const you = healSide('Warwick', 9, {items: ['3072'], hpPct: 10}); // Bloodthirster: life steal too
  const plain = Engine.runCombo(D, you, target([]), steps);
  const wounded = Engine.runCombo(D, you, target(['3916']), steps); // Oblivion Orb: AP only, same defenses
  assert.ok(plain.healed > 0);
  assert.equal(wounded.grievous, 0.4);
  assert.ok(Math.abs(wounded.healed - 0.6 * plain.healed) < 1e-9);
});
test('spell heals land in the combo row of that spell', () => {
  const r = Engine.runCombo(D, healSide('Warwick'), healSide('Garen'), [{spell: 'Q'}]);
  assert.ok(r.rows[0].healed > 0 && Math.abs(r.healed - r.rows[0].healed) < 1e-9);
});

// --- Advisor by stat, champion optimization -----------------------------------------------------------
test('advisor ranks by any stat, with or without an enemy', () => {
  const sel = (champ) => ({champ, level: 9, items: [null, null, null, null, null, null], runes: null, stacked: false,
    stacks: 0, combo: Engine.DEFAULT_COMBO, currentHpPct: 100});
  for (const enemy of [null, sel('Annie')]) {
    const a = Engine.adviseBuys(D, sel('Garen'), enemy, 3000, {by: 'armor'});
    const top = Engine.rankBuys(a.rows, 'armor', false);
    assert.ok(top[0].gains.armor > 0);
    assert.ok(top.every((r, i) => !i || r.gains.armor <= top[i - 1].gains.armor));
    assert.ok(top[0].cost <= 3000);
  }
  assert.equal(Engine.adviseBuys(D, sel('Garen'), null, 3000, {by: 'offense'}).error, 'no_enemy');
});
test('champion optimization: best build first, legal, within gold, full stats', () => {
  const r = Engine.optimizeChampion(D, {champ: 'Garen', level: 18, stat: 'hp', maxGold: 10000, count: 5});
  assert.ok(r.rows.length >= 1 && r.rows.length <= 5);
  for (const row of r.rows) {
    assert.deepEqual(Engine.validateBuild(D, 'Garen', row.items), []);
    assert.deepEqual(Engine.validateRunePage(D, row.runes), []);
    assert.ok(row.cost <= 10000);
    assert.equal(row.value, row.stats.total.hp);
  }
  assert.ok(r.rows.every((row, i) => !i || row.value <= r.rows[i - 1].value));
  const bare = Engine.championStats(D, {champ: 'Garen', level: 18, items: [], runes: null}).total.hp;
  assert.ok(r.rows[0].value > bare + 2000);
});
test('champion optimization counts champion stacks', () => {
  const at = (stacks) => Engine.optimizeChampion(D, {champ: 'Veigar', level: 18, stat: 'ap', maxGold: 3000, stacks, count: 1}).rows[0].value;
  assert.ok(Math.abs(at(200) - at(0)) >= 200);
});

// --- Per-item breakdown and gold efficiency ----------------------------------------------------------
test('breakdown: each item column is what you lose without it; plain stats add up exactly', () => {
  const sel = {champ: 'Garen', level: 18, items: ['3068', '3065', null, null, null, null], runes: null, stacked: false, stacks: 0};
  const b = Engine.statBreakdown(D, sel);
  assert.deepEqual(b.columns.map((c) => c.kind), ['item', 'item', 'runes', 'champion']);
  const sunfire = b.columns[0];
  assert.equal(sunfire.id, '3068');
  assert.equal(sunfire.values.armor, D.items['3068'].stats.armor);
  const s = Engine.championStats(D, sel);
  const sum = b.columns.reduce((t, c) => t + (c.values.armor || 0), 0);
  assert.ok(Math.abs(s.base.armor + sum - s.total.armor) < 1e-9);
  assert.deepEqual(b.notAdditive, []);
});
test('breakdown: a multiplier item counts its share of everything (Rabadon), and the mismatch is reported', () => {
  const sel = {champ: 'Annie', level: 18, items: ['3089', '1058', null, null, null, null], // Rabadon's Deathcap + Needlessly Large Rod
    runes: null, stacked: false, stacks: 0};
  const b = Engine.statBreakdown(D, sel);
  const rod = D.items['1058'].stats.ap, cap = D.items['3089'].stats.ap;
  const rabadon = b.columns.find((c) => c.id === '3089').values.ap;
  assert.ok(rabadon > cap + 0.3 * rod, String(rabadon));
  assert.ok(b.notAdditive.includes('ap'));
});
test('breakdown: champion column has the passive and stacks', () => {
  const b = Engine.statBreakdown(D, {champ: 'Tristana', level: 18, items: [], runes: null, stacked: false, stacks: 0});
  assert.equal(b.columns.find((c) => c.kind === 'champion').values.range, 150);
  const v = Engine.statBreakdown(D, {champ: 'Veigar', level: 1, items: [], runes: null, stacked: false, stacks: 40});
  assert.equal(v.columns.find((c) => c.kind === 'champion').values.ap, 40);
});
test('gold efficiency: reference items are 100%, others priced from them', () => {
  const ruby = Engine.goldEfficiency(D, '1028');
  assert.ok(Math.abs(ruby.efficiency - 1) < 1e-9 && ruby.unpriced.length === 0);
  const prices = Engine.statGoldPrices(D);
  assert.ok(prices.hp > 0 && prices.armor > 0 && !('lethality' in prices));
  const cleaver = Engine.goldEfficiency(D, '3071');
  const value = Object.entries(D.items['3071'].stats).reduce((t, [k, v]) => t + v * (prices[k] || 0), 0);
  assert.ok(Math.abs(cleaver.value - value) < 1e-9 && Math.abs(cleaver.efficiency - value / 3000) < 1e-9);
});

test('counter items named in guide.js exist in this patch', () => {
  const GUIDE = require('./guide.js');
  const entries = [...GUIDE.GROUPS.flatMap((g) => g.stats.flatMap((c) => c.counter || [])), ...Object.values(GUIDE.ITEM_COUNTERS)];
  for (const c of entries) if (Array.isArray(c.items)) c.items.forEach((id) => assert.ok(D.items[id], `item ${id}`));
});

test('counter advice reads both combos', () => {
  const sel = (champ, items) => ({champ, level: 18, items, runes: null, stacked: false, stacks: 0, combo: Engine.defaultCombo(D, champ)});
  // Lux deals magic damage; a tanky enemy Malphite with armor items.
  const ids = (re) => Object.keys(D.items).filter((id) => re.test(D.items[id].name.en)).slice(0, 1);
  const advice = Engine.counterAdvice(D, sel('Lux', []), sel('Malphite', [...ids(/^Thornmail$/), ...ids(/^Warmog/), ...ids(/^Randuin/)]));
  const by = Object.fromEntries(advice.map((a) => [a.id, a]));
  assert.ok(by.physical || by.magic || by.mixed, 'enemy damage split');
  assert.ok(by.mrLow || by.mrHigh, 'Lux is magic, so magic pen advice');
  assert.ok(by.tanky, 'Malphite with health items is tanky');
  const vamp = Engine.counterAdvice(D, sel('Lux', []), sel('Jinx', ids(/^Bloodthirster$/)));
  assert.ok(vamp.some((a) => a.id === 'heals'), 'life steal: Grievous Wounds');
});

test('kit scaling: the best stat for a few clear-cut kits', () => {
  assert.equal(Engine.kitScaling(D, 'Annie').stats[0].stat, 'ap');
  assert.equal(Engine.kitScaling(D, 'Lux').stats[0].stat, 'ap');
  assert.equal(Engine.kitScaling(D, 'Garen').stats[0].stat, 'ad');
  for (const id of Object.keys(D.champions)) assert.ok(Array.isArray(Engine.kitScaling(D, id).stats), id);
});

test('champion roles come with the data', () => {
  assert.ok(D.champions.Jinx.positions.includes('BOTTOM'));
  assert.ok(D.champions.Garen.positions.includes('TOP'));
  assert.ok(Object.values(D.champions).filter((c) => c.positions.length).length > 150);
});

test('class items: a few picks any player would expect', () => {
  const GUIDE = require('./guide.js');
  const of = (tag) => Engine.classItems(D, GUIDE.CLASSES.find((c) => c.tag === tag).keyStats);
  const name = (id) => D.items[id].name.en;
  assert.ok(of('Mage').items.map(name).includes("Rabadon's Deathcap"));
  assert.equal(name(of('Mage').boots), "Sorcerer's Shoes");
  assert.equal(name(of('Marksman').boots), "Berserker's Greaves");
  assert.ok(of('Marksman').items.map(name).includes('Infinity Edge'));
  for (const c of GUIDE.CLASSES) assert.equal(of(c.tag).items.length, 6, c.tag);
  // Every class has champions in the data.
  for (const c of GUIDE.CLASSES) assert.ok(Object.values(D.champions).some((ch) => ch.tags.includes(c.tag)), c.tag);
});

test('build path: Infinity Edge from scratch adds up to its price', () => {
  const id = Object.keys(D.items).find((x) => D.items[x].name.en === 'Infinity Edge');
  const steps = Engine.buildPath(D, id);
  assert.equal(steps.at(-1).id, id);
  assert.ok(steps.at(-1).combine);
  assert.equal(steps.at(-1).total, D.items[id].gold.total);
  assert.equal(steps.reduce((s, x) => s + x.cost, 0), D.items[id].gold.total);
});

test('beginner build: starter, boots and three core items that exist', () => {
  const GUIDE = require('./guide.js');
  for (const s of [...GUIDE.STARTERS.lane, ...Object.values(GUIDE.STARTERS.jungle), GUIDE.STARTERS.support]) assert.ok(D.items[s], s);
  for (const id of Object.keys(D.champions)) {
    const b = Engine.beginnerBuild(D, id, GUIDE.CLASSES, GUIDE.STARTERS);
    assert.ok(b.starter && b.boots && b.core.length === 3, id);
  }
  const b = (id) => Engine.beginnerBuild(D, id, GUIDE.CLASSES, GUIDE.STARTERS);
  assert.equal(D.items[b('Annie').boots].name.en, "Sorcerer's Shoes");
  assert.equal(D.items[b('Thresh').starter].name.en, 'World Atlas');
  assert.equal(b('Jinx').profile, 'Marksman');
});

test('spell scaling: Annie Q scales with AP, damage grows with level', () => {
  const q = (lvl) => Engine.spellScaling(D, 'Annie', lvl).find((s) => s.key === 'Q');
  assert.equal(q(9).ratios[0].stat, 'ap');
  assert.ok(q(9).ratios[0].ratio > 0.5 && q(9).ratios[0].ratio < 1.2);
  assert.ok(q(18).damage > q(1).damage);
  assert.ok(!Engine.spellScaling(D, 'Annie', 1).find((s) => s.key === 'R').learned);
});

test('matchup by level: 18 verdicts; a full build beats no items', () => {
  const sel = (champ, items) => ({champ, level: 1, items, runes: null, stacked: false, stacks: 0, combo: Engine.defaultCombo(D, champ)});
  const rabadon = Object.keys(D.items).filter((x) => /^(Rabadon|Shadowflame|Void Staff|Sorcerer)/.test(D.items[x].name.en));
  const r = Engine.matchupByLevel(D, sel('Annie', rabadon), sel('Annie', []));
  assert.equal(r.length, 18);
  assert.ok(r.every((w) => ['you', 'them', 'even'].includes(w)));
  assert.equal(r[17], 'you');
});

test('skill orders: hand-written ones are used by default, the rest are estimated', () => {
  for (const [id, o] of Object.entries(D.rules.skillOrders)) {
    assert.ok(D.champions[id], id);
    assert.deepEqual([...o].sort(), ['E', 'Q', 'W'], id);
  }
  assert.deepEqual(Engine.skillOrder(D, 'Garen'), {order: ['E', 'Q', 'W'], estimated: false});
  for (const id of Object.keys(D.champions)) assert.equal(Engine.skillOrder(D, id).order.length, 3, id);
  assert.ok(Engine.skillOrder(D, 'Locke').estimated);
  // Garen maxes E first: at level 9 his E is rank 5 without any priority given.
  const sel = {champ: 'Garen', level: 9, items: [], runes: null, stacked: false, stacks: 0};
  assert.equal(Engine.spellDamage(D, {...sel, stats: Engine.championStats(D, sel)}, {stats: Engine.championStats(D, sel), currentHp: 2000}, 'E').rank, 5);
});

test('class rune pages: every rune name exists and every page is complete and valid', () => {
  const GUIDE = require('./guide.js');
  for (const c of GUIDE.CLASSES) {
    const p = Engine.runePageFrom(D, c.runes);
    assert.ok(p.keystone && p.primary && p.secondary, c.tag);
    assert.ok([...p.primaryRunes, ...p.secondaryRunes, ...p.shards].every(Boolean), `${c.tag}: every slot filled`);
    assert.deepEqual(Engine.validateRunePage(D, p), [], c.tag);
  }
  for (const t of D.runes.trees) assert.ok(GUIDE.TREES[t.id], `tree ${t.id} described`);
  for (const r of Object.values(D.runes.byId)) assert.ok(r.icon, `rune ${r.id} icon`);
});

test('new-player data: summoner spells, difficulty, ratings, ability texts', () => {
  const GUIDE = require('./guide.js');
  for (const r of GUIDE.ROLES) r.spells.forEach((s) => assert.ok(D.summoners[s], `${r.key}: ${s}`));
  assert.ok(D.summoners.SummonerFlash.name.fr && D.summoners.SummonerFlash.cooldown);
  const champs = Object.values(D.champions);
  assert.ok(champs.filter((c) => c.difficulty >= 1 && c.difficulty <= 10).length > 160);
  assert.ok(champs.filter((c) => Object.keys(c.ratings).length === 5).length > 160);
  for (const c of champs) for (const s of c.spells) assert.ok(s.desc && typeof s.desc.en === 'string', `${c.id} ${s.key}`);
  assert.equal(D.champions.Ahri.spells.find((s) => s.key === 'W').cooldown, '9/8/7/6/5');
  assert.ok(Array.isArray(D.review.changes));
});
