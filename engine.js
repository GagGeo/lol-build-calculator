// Pure game-math functions shared by the page and the tests. No DOM access here.
const Engine = (() => {
  const BASE_KEYS = ['hp', 'mp', 'armor', 'mr', 'ad', 'hpregen', 'mpregen'];

  const growth = (level) => (level - 1) * (0.7025 + 0.0175 * (level - 1));

  // Move speed soft caps: 80% of the speed above 415 counts, 50% above 490.
  const capMoveSpeed = (ms) => (ms > 490 ? 415 + 75 * 0.8 + (ms - 490) * 0.5 : ms > 415 ? 415 + (ms - 415) * 0.8 : ms);

  const clampLevel = (level) => {
    const n = Math.round(Number(level));
    return Number.isFinite(n) ? Math.min(18, Math.max(1, n)) : 1;
  };

  const add = (obj, key, value) => { obj[key] = (obj[key] || 0) + value; };

  const ultRank = (level) => (level >= 16 ? 3 : level >= 11 ? 2 : level >= 6 ? 1 : 0);

  // Value of one runeStats entry at this level (ignores "only" and "always").
  const runeEntryValue = (entry, level) => {
    if (entry.steps) {
      let value = 0;
      for (const [at, v] of entry.steps) if (level >= at) value = v;
      return value;
    }
    if (entry.min !== undefined) return entry.min + (entry.max - entry.min) * (level - 1) / 17;
    return entry.value;
  };

  const pageRunes = (page) => [page.keystone, ...(page.primaryRunes || []), ...(page.secondaryRunes || [])]
    .filter((id) => id !== null && id !== undefined);

  // Stats with the champion's own passive (rules.championPassiveStats). Its formulas read the stats
  // without the passive (as the game's "avoiding recursion" formulas do), then the result is added.
  function championStats(data, sel) {
    const entries = (data.rules.championPassiveStats || {})[sel.champ];
    if (!entries) return coreStats(data, sel, null);
    return coreStats(data, sel, passiveStats(data, sel, entries, coreStats(data, sel, null)));
  }

  function passiveStats(data, sel, entries, first) {
    const champ = data.champions[sel.champ];
    const spell = champ.spells.find((s) => s.key === 'P');
    const level = clampLevel(sel.level);
    // Bonus move speed for formulas = everything above base, after % bonuses and soft caps.
    const stats = {...first, bonus: {...first.bonus, ms: first.total.ms - first.base.ms}};
    const out = {add: {}, mul: [], ops: [], unsupported: []};
    for (const e of entries) {
      if (e.stacked !== undefined && e.stacked !== !!sel.stacked) continue;
      if (e.op) { out.ops.push(e); continue; }
      if (e.mulTotal !== undefined) { out.mul.push({stat: e.stat, value: e.mulTotal}); continue; }
      let v;
      if (e.calc) {
        const r = evalCalc(spell, e.calc, {rank: 1, level, stats, rules: data.rules});
        out.unsupported.push(...r.unsupported);
        v = r.value;
        if (e.ofTotal) v *= first.total[e.ofTotal] || 0;
        else if ((spell.calcs[e.calc] || {}).pct) v *= 100; // fraction shown as a percentage
        v *= e.mult ?? 1;
      } else {
        v = runeEntryValue(e, level);
      }
      if (e.asMulTotal) out.mul.push({stat: e.stat, value: v / 100}); else add(out.add, e.stat, v);
    }
    return out;
  }

  function coreStats(data, sel, passive) {
    const level = clampLevel(sel.level);
    const champ = data.champions[sel.champ];
    const b = champ.base;
    const rules = data.rules;
    const g = growth(level);
    const items = (sel.items || []).filter(Boolean);

    const base = {ms: b.ms, range: b.range, as: b.as + b.asratio * (b.asperlevel / 100) * g};
    for (const k of BASE_KEYS) base[k] = b[k] + (b[k + 'perlevel'] || 0) * g;

    const bonus = {};
    // Tenacity from items and stat shards stacks multiplicatively (30% and 20% make 44%); everything else adds.
    const addBonus = (k, v) => {
      if (k === 'tenacity') bonus.tenacity = 100 - (100 - (bonus.tenacity || 0)) * (1 - v / 100); else add(bonus, k, v);
    };
    const fromItems = {};
    for (const id of items) {
      for (const [k, v] of Object.entries(data.items[id].stats)) { addBonus(k, v); add(fromItems, k, v); }
      // Flat passive stats ("add") and stacking items ("stacked", only when fully stacked) count as item stats.
      for (const p of rules.itemStatPassives[id] || []) {
        if (p.op === 'add' || (p.op === 'stacked' && sel.stacked)) { addBonus(p.stat, p.value); add(fromItems, p.stat, p.value); }
      }
    }

    const runeMuls = [];
    if (sel.runes) {
      for (const shard of sel.runes.shards || []) {
        const s = rules.shards[shard];
        if (!s) continue;
        for (const [k, v] of Object.entries(s)) {
          if (k === 'hpPerLevel') addBonus('hp', v * level); else addBonus(k, v);
        }
      }
      const melee = b.range < 300;
      for (const id of pageRunes(sel.runes)) {
        for (const entry of rules.runeStats[id] || []) {
          if (!entry.always && !sel.stacked) continue;
          if (entry.only && (entry.only === 'melee') !== melee) continue;
          if (entry.op === 'jack') {
            const n = Object.values(fromItems).filter((v) => v).length;
            addBonus('ah', n);
            addBonus('adaptive', n >= 10 ? 20 : n >= 5 ? 8 : 0);
          } else if (entry.mulTotal !== undefined) {
            runeMuls.push({stat: entry.stat, value: entry.mulTotal});
          } else {
            addBonus(entry.stat, runeEntryValue(entry, level));
          }
        }
      }
    }

    const stacker = rules.stackers[sel.champ];
    if (stacker && sel.stacks > 0) {
      for (const [k, v] of Object.entries(stacker)) {
        if (typeof v === 'number') addBonus(k, v * sel.stacks);
        else if (v.max !== undefined) addBonus(k, Math.min(v.max, v.value * sel.stacks));
        else if (v.per) addBonus(k, Math.floor(sel.stacks / v.per) * v.value);
        else if (v.byRRank) { const r = ultRank(level); if (r) addBonus(k, v.byRRank[r - 1] * sel.stacks); }
      }
    }

    const REGEN = ['hpregen', 'mpregen'];
    for (const [k, v] of Object.entries(passive ? passive.add : {})) if (!REGEN.includes(k)) addBonus(k, v);

    // Temporary buffs (rules.buffs): sel.buffs maps a buff id to its stacks (drakes), game minute (Baron) or 1.
    const buffMuls = [], buffRegen = {};
    for (const b of rules.buffs || []) {
      const n = (sel.buffs || {})[b.id];
      if (!(n > 0)) continue;
      const f = b.byMinute ? Math.min(1, Math.max(0, (n - b.byMinute[0]) / (b.byMinute[1] - b.byMinute[0])))
        : b.byLevel ? (level - 1) / 17 : 0;
      const val = (v) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * f : v * (b.max > 1 ? n : 1));
      for (const [k, v] of Object.entries(b.add || {})) if (REGEN.includes(k)) add(buffRegen, k, val(v)); else addBonus(k, val(v));
      for (const [k, v] of Object.entries(b.mulTotal || {})) buffMuls.push({stat: k, value: val(v)});
    }

    // Adaptive force: 1 AP or 0.6 AD, toward the larger bonus; ties follow the champion's type.
    const adaptive = bonus.adaptive || 0;
    delete bonus.adaptive;
    if (adaptive) {
      const ap = bonus.ap || 0, ad = bonus.ad || 0;
      if (ap > ad || (ap === ad && champ.adaptiveAP)) add(bonus, 'ap', adaptive); else add(bonus, 'ad', adaptive * 0.6);
    }

    const total = {};
    for (const k of new Set([...BASE_KEYS, ...Object.keys(bonus)])) total[k] = (base[k] || 0) + (bonus[k] || 0);
    if (total.ap === undefined) total.ap = 0;

    // Item passives: multipliers first, then conversions (conversions are not multiplied).
    const passives = items.flatMap((id) => rules.itemStatPassives[id] || []);
    const muls = [...passives.filter((p) => p.op === 'mulTotal').map((m) => ({...m})), ...runeMuls, ...(passive ? passive.mul : [])];
    // The Infernal drake's AP % adds to other AP % (Rabadon's) instead of multiplying it; everything else multiplies.
    for (const m of buffMuls) { const same = m.stat === 'ap' && muls.find((x) => x.stat === 'ap'); if (same) same.value += m.value; else muls.push(m); }
    for (const m of muls) {
      total[m.stat] = (total[m.stat] || 0) * (1 + m.value);
    }
    for (const c of passives.filter((p) => p.op === 'convert')) {
      const source = c.basis === 'items' ? fromItems[c.from] || 0
        : c.basis === 'total' ? total[c.from] || 0
          : c.basis === 'base' ? base[c.from] || 0 : bonus[c.from] || 0;
      total[c.to] = (total[c.to] || 0) + source * c.value;
    }
    for (const o of passive ? passive.ops : []) {
      if (o.op === 'convertBonus') { // Pyke: bonus Health becomes Attack Damage
        const moved = total[o.from] - (base[o.from] || 0);
        total[o.from] -= moved;
        total[o.to] = (total[o.to] || 0) + moved / o.per;
      } else if (o.op === 'intent') { // Yasuo, Yone: crit chance doubled, crit above 100% becomes AD
        total.crit = (total.crit || 0) * o.critMul;
        if (total.crit > 100) total.ad += (total.crit - 100) * o.adPerExcessCrit;
      }
    }
    for (const k of Object.keys(total)) {
      if (BASE_KEYS.includes(k) || k === 'ap') bonus[k] = total[k] - (base[k] || 0);
    }

    // Base Health/Mana Regen % multiplies the champion's base regen only.
    total.hpregen = base.hpregen * (1 + (bonus.hpRegenPct || 0) / 100) + (fromItems.hpregen || 0);
    total.mpregen = base.mpregen * (1 + (bonus.mpRegenPct || 0) / 100) + (fromItems.mpregen || 0);
    for (const k of REGEN) total[k] += ((passive && passive.add[k]) || 0) + (buffRegen[k] || 0);
    bonus.hpregen = total.hpregen - base.hpregen;
    bonus.mpregen = total.mpregen - base.mpregen;
    if (total.crit !== undefined) total.crit = Math.min(100, total.crit);
    if (total.tenacity !== undefined) total.tenacity = Math.min(100, total.tenacity);
    total.as = Math.min(rules.asCap, b.as + b.asratio * ((bonus.as || 0) / 100 + (b.asperlevel / 100) * g));
    total.ms = capMoveSpeed((b.ms + (bonus.ms || 0)) * (1 + (bonus.msPct || 0) / 100));
    total.range = b.range + (bonus.range || 0);

    const flags = items.filter((id) => (rules.itemStatPassivesUnknown || []).includes(id))
      .map((id) => 'unknown_passive:' + id);
    if ((rules.championStatsUnknown || []).includes(sel.champ) || (passive && passive.unsupported.length)) {
      flags.push('unknown_champion:' + sel.champ);
    }
    return {base, bonus, total, flags};
  }

  const sameChamp = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  function validateBuild(data, champ, items) {
    const owned = items.filter(Boolean);
    const errors = [];
    if (owned.length > 6) errors.push('too_many_items');
    if (data.rules.noBoots.some((c) => sameChamp(c, champ)) && owned.some((id) => data.items[id].boots)) {
      errors.push('no_boots_champion');
    }
    for (const id of new Set(owned)) {
      const req = data.items[id].requiredChampion;
      if (req && !sameChamp(req, champ)) errors.push('champion_only:' + id);
    }
    const counts = {};
    for (const id of owned) for (const gid of data.items[id].groups) counts[gid] = (counts[gid] || 0) + 1;
    for (const [gid, n] of Object.entries(counts)) {
      if (data.groups[gid] !== undefined && n > data.groups[gid]) errors.push('group_limit:' + gid);
    }
    return errors;
  }

  function allowedItems(data, champ, items, slot) {
    return Object.keys(data.items).filter((id) => {
      const build = items.slice();
      build[slot] = id;
      return validateBuild(data, champ, build).length === 0;
    });
  }

  function pruneBuild(data, champ, items) {
    const kept = [], removed = [];
    for (const id of items) {
      if (id && validateBuild(data, champ, [...kept, id]).length) { kept.push(null); removed.push(id); }
      else kept.push(id || null);
    }
    return {items: kept, removed};
  }

  const findTree = (data, id) => data.runes.trees.find((t) => t.id === id);
  const isSet = (v) => v !== null && v !== undefined;

  function validateRunePage(data, page) {
    const errors = [];
    const primary = isSet(page.primary) ? findTree(data, page.primary) : null;
    if (isSet(page.primary) && !primary) errors.push('primary');
    if (primary) {
      if (isSet(page.keystone) && !primary.slots[0].includes(page.keystone)) errors.push('keystone');
      (page.primaryRunes || []).forEach((r, i) => {
        if (isSet(r) && !primary.slots[i + 1].includes(r)) errors.push('primary_row:' + i);
      });
    }
    const secondary = isSet(page.secondary) ? findTree(data, page.secondary) : null;
    if (isSet(page.secondary) && !secondary) errors.push('secondary');
    if (secondary && primary && secondary.id === primary.id) errors.push('secondary_same_tree');
    if (secondary) {
      const rows = (page.secondaryRunes || []).filter(isSet).map((r) => secondary.slots.findIndex((s) => s.includes(r)));
      if (rows.some((row) => row < 1)) errors.push('secondary_row');
      else if (rows.length === 2 && rows[0] === rows[1]) errors.push('secondary_same_row');
    }
    (page.shards || []).forEach((s, i) => {
      if (isSet(s) && !data.rules.shardRows[i].includes(s)) errors.push('shard:' + i);
    });
    return errors;
  }

  function normalizeRunePage(data, page) {
    const p = {primary: page.primary ?? null, keystone: page.keystone ?? null,
               primaryRunes: [0, 1, 2].map((i) => (page.primaryRunes || [])[i] ?? null),
               secondary: page.secondary ?? null,
               secondaryRunes: [0, 1].map((i) => (page.secondaryRunes || [])[i] ?? null),
               shards: [0, 1, 2].map((i) => (page.shards || [])[i] ?? null)};
    const primary = isSet(p.primary) ? findTree(data, p.primary) : null;
    if (!primary) p.primary = null;
    if (!primary || !primary.slots[0].includes(p.keystone)) p.keystone = null;
    p.primaryRunes = p.primaryRunes.map((r, i) => (primary && primary.slots[i + 1].includes(r) ? r : null));
    const secondary = isSet(p.secondary) ? findTree(data, p.secondary) : null;
    if (!secondary || (primary && secondary.id === primary.id)) {
      p.secondary = null;
      p.secondaryRunes = [null, null];
    } else {
      const rowOf = (r) => secondary.slots.findIndex((s) => s.includes(r));
      const first = rowOf(p.secondaryRunes[0]) >= 1 ? p.secondaryRunes[0] : null;
      const second = rowOf(p.secondaryRunes[1]) >= 1 && (first === null || rowOf(p.secondaryRunes[1]) !== rowOf(first))
        ? p.secondaryRunes[1] : null;
      p.secondaryRunes = [first, second];
    }
    p.shards = p.shards.map((s, i) => (data.rules.shardRows[i].includes(s) ? s : null));
    return p;
  }

  const buildCost = (data, items) => items.filter(Boolean).reduce((sum, id) => sum + data.items[id].gold.total, 0);

  function goldWarning(data, level, items) {
    const cost = buildCost(data, items);
    const typical = data.rules.typicalGoldByLevel[clampLevel(level) - 1];
    return cost > typical * data.rules.goldWarningFactor ? {cost, typical} : null;
  }

  // --- Stage 2: spell formulas -------------------------------------------------------------------
  // A stat as formulas read it: attack speed bonus and crit as fractions, crit damage as the total multiplier.
  function formulaStat(stat, basis, stats, rules) {
    const part = stats[basis] || {};
    if (stat === 'as') return basis === 'bonus' ? (part.as || 0) / 100 : part.as || 0;
    if (stat === 'crit') return (part.crit || 0) / 100;
    if (stat === 'critDmg') {
      const bonus = (stats.bonus.critDmg || 0) / 100;
      return basis === 'bonus' ? bonus : basis === 'base' ? rules.critBase : rules.critBase + bonus;
    }
    return part[stat] || 0;
  }

  function evalCalc(spell, name, ctx, visiting = new Set()) {
    const unsupported = [];
    const calc = spell.calcs[name];
    if (!calc) return {value: 0, unsupported: ['missing calc ' + name]};
    if (visiting.has(name)) return {value: 0, unsupported: ['ref loop ' + name]};
    visiting.add(name);
    const node = (n) => {
      switch (n.t) {
        case 'v': {
          const arr = spell.values[n.name];
          if (!arr || !arr.length) { unsupported.push('missing value ' + n.name); return 0; } // never a silent 0
          return arr[Math.min(ctx.rank, arr.length - 1)];
        }
        case 'n': return n.n;
        case 'stat': return formulaStat(n.stat, n.basis, ctx.stats, ctx.rules) * node(n.coef);
        case 'statOf': return formulaStat(n.stat, n.basis, ctx.stats, ctx.rules) * node(n.part);
        // Each breakpoint adds once at its level; its per-level rate runs until the next breakpoint.
        case 'lvlBp': return n.start + n.bps.reduce((sum, [at, add, perLevel], i) => {
          if (ctx.level < at) return sum;
          const last = Math.min(ctx.level, i + 1 < n.bps.length ? n.bps[i + 1][0] - 1 : ctx.level);
          return sum + add + (perLevel || 0) * (last - at + 1);
        }, 0);
        case 'lvlLerp': return n.a + (n.b - n.a) * (ctx.level - 1) / 17;
        case 'sum': return n.parts.reduce((s, p) => s + node(p), 0);
        case 'prod': return node(n.a) * node(n.b);
        case 'ref': {
          const r = evalCalc(spell, n.name, ctx, visiting);
          unsupported.push(...r.unsupported);
          return r.value;
        }
        default: unsupported.push(n.what || 'unknown node'); return 0;
      }
    };
    let value = calc.parts.reduce((s, p) => s + node(p), 0);
    if (calc.mult) value *= node(calc.mult);
    visiting.delete(name);
    return {value, unsupported};
  }

  // Ranks at a level: Q/W/E at 1/2/3, R at 6/11/16, otherwise the first ability in `priority`
  // below its max rank and below the basic-ability cap floor((level+1)/2).
  // `rule` (rules.skillRankRules) covers champions that rank differently: basicR (R is a basic, Udyr),
  // free ({R: 1}: ranks given at level 1 without a point) and noRanks (abilities that stay rank 1, Aphelios).
  function skillRanks(champ, level, priority = ['Q', 'W', 'E'], start = priority, rule = {}) {
    const max = Object.fromEntries(champ.spells.filter((s) => s.key !== 'P').map((s) => [s.key, s.maxrank]));
    const fixed = rule.noRanks || [];
    const order = (rule.basicR && !priority.includes('R') ? [...priority, 'R'] : priority).filter((k) => !fixed.includes(k));
    const ranks = {Q: 0, W: 0, E: 0, R: 0, ...rule.free};
    for (let l = 1; l <= clampLevel(level); l++) {
      if (!rule.basicR && [6, 11, 16].includes(l) && ranks.R < max.R) { ranks.R++; continue; }
      const cap = Math.floor((l + 1) / 2);
      const early = l <= 3 ? start[l - 1] : null;
      if (early && order.includes(early) && ranks[early] < max[early] && ranks[early] < cap) { ranks[early]++; continue; }
      const k = order.find((key) => ranks[key] < max[key] && ranks[key] < cap);
      if (k) ranks[k]++;
    }
    for (const k of fixed) ranks[k] = 1;
    return ranks;
  }

  // The max orders a champion can pick: the 6 orders of Q, W, E, or the 24 of Q, W, E, R when R is a basic.
  const permutations = (keys) => (keys.length < 2 ? [keys]
    : keys.flatMap((k, i) => permutations([...keys.slice(0, i), ...keys.slice(i + 1)]).map((p) => k + p)));
  function orderChoices(data, champId) {
    return ((data.rules.skillRankRules || {})[champId] || {}).basicR ? permutations('QWER'.split('')) : ORDERS;
  }

  // The order a champion maxes its basic abilities: rules.skillOrders (written by hand), else an estimate: the
  // order whose abilities deal the most damage from level 7 to 13, where the order matters most. Damage alone
  // misses utility, cooldowns and basic-attack synergy, so the estimate is labelled as such in the page.
  const ORDERS = ['QWE', 'QEW', 'WQE', 'WEQ', 'EQW', 'EWQ'];
  const orderCache = new WeakMap();
  function skillOrder(data, champId) {
    const hand = (data.rules.skillOrders || {})[champId];
    if (hand) return {order: hand.split(''), estimated: false};
    if (!orderCache.has(data)) orderCache.set(data, {});
    const cache = orderCache.get(data);
    if (!cache[champId]) {
      const target = {stats: {base: {hp: 3000}, bonus: {hp: 0}, total: {hp: 3000, armor: 0, mr: 0}}, currentHp: 3000};
      const score = (order) => {
        let sum = 0;
        for (let level = 7; level <= 13; level++) {
          const sel = {champ: champId, level, items: [], runes: null, stacked: false, stacks: 0, priority: order.split('')};
          const side = {...sel, stats: championStats(data, sel)};
          for (const key of order.split('')) {
            const r = spellDamage(data, side, target, key);
            if (r.learned && !r.noDamage && !r.unsupported.length) sum += r.damage;
          }
        }
        return sum;
      };
      const scored = orderChoices(data, champId).map((o) => [o, score(o)]);
      cache[champId] = scored.reduce((best, x) => (x[1] > best[1] + 1e-6 ? x : best))[0]; // ties keep Q > W > E
    }
    return {order: cache[champId].split(''), estimated: true};
  }

  // --- Stage 2: damage ----------------------------------------------------------------------------
  // Damage after resistances. Order: shred (% reduction), % penetration, flat penetration/lethality (flat).
  function mitigate(raw, type, attacker, target, shred = {armor: 0, mr: 0}) {
    if (type === 'true') return raw;
    const physical = type === 'physical';
    const a = attacker.total;
    let r = (physical ? target.total.armor : target.total.mr) || 0;
    if (r > 0) {
      const penPct = (physical ? a.armorPenPct : a.magicPenPct) || 0;
      const flat = (physical ? a.lethality : a.magicPen) || 0;
      r = Math.max(0, r * (1 - (physical ? shred.armor : shred.mr)) * (1 - penPct / 100) - flat);
    }
    return raw * (r >= 0 ? 100 / (100 + r) : 2 - 100 / (100 - r));
  }

  function autoAttack(attacker, target, rules) {
    const ad = attacker.total.ad || 0;
    const chance = Math.min(100, attacker.total.crit || 0) / 100;
    const mult = rules.critBase + (attacker.bonus.critDmg || 0) / 100;
    const hit = (raw) => mitigate(raw, 'physical', attacker, target);
    return {nonCrit: hit(ad), crit: hit(ad * mult), average: hit(ad * (1 + chance * (mult - 1)))};
  }

  // What to take at levels 1-3: rules.startOrders (written by hand, e.g. "QEW"), else the max order itself.
  function startOrder(data, champId) {
    const hand = (data.rules.startOrders || {})[champId];
    return hand ? {order: hand.split(''), byDefault: false} : {order: skillOrder(data, champId).order.slice(0, 3), byDefault: true};
  }

  // The rank of every ability at `level` with the max order `priority` (default: the champion's usual one), the
  // levels 1-3 order (hand-written, else the max order in use) and the champion's rank rule.
  function abilityRanks(data, champId, level, priority) {
    const hand = (data.rules.startOrders || {})[champId];
    const order = priority || skillOrder(data, champId).order;
    return skillRanks(data.champions[champId], level, order, hand ? hand.split('') : order,
      (data.rules.skillRankRules || {})[champId]);
  }

  // A spell's rank: side.ranks[key] when forced (the ranks table), else abilityRanks. The passive is rank 1 from
  // its level on.
  function spellRank(data, side, key) {
    if (key === 'P') return clampLevel(side.level) >= ((data.rules.passiveFromLevel || {})[side.champ] || 1) ? 1 : 0;
    if (side.ranks && key in side.ranks) return side.ranks[key];
    return abilityRanks(data, side.champ, side.level, side.priority)[key];
  }

  function spellDamage(data, side, target, key, lineIndex = 0, shred = {armor: 0, mr: 0}) {
    const champ = data.champions[side.champ];
    const spell = champ.spells.find((s) => s.key === key);
    const rank = spellRank(data, side, key);
    if (!rank) return {learned: false, rank: 0, raw: 0, damage: 0, type: null, unsupported: []};
    // A spell whose description or game data is missing can't be trusted, even if some lines were read.
    const unsupported = spell.flags.filter((f) => ['unparsed_tooltip', 'no_tooltip', 'no_cdragon_spell'].includes(f));
    const line = spell.lines[lineIndex];
    if (!line) {
      return unsupported.length ? {learned: true, rank, raw: 0, damage: 0, type: null, unsupported}
        : {learned: true, rank, raw: 0, damage: 0, type: null, noDamage: true, unsupported};
    }
    const ctx = {rank, level: clampLevel(side.level), stats: side.stats, rules: data.rules};
    const maxHp = target.stats.total.hp || 0;
    const current = target.currentHp ?? maxHp;
    let raw = 0;
    if (line.varies) unsupported.push('damage varies with missing health');
    for (const term of line.terms) {
      const {v, pct} = termValue(spell, term, ctx, unsupported);
      if (term.kind === 'unsupported') { unsupported.push('percentage of another base'); continue; }
      if (term.kind === 'flat') { raw += v; continue; }
      // Target-health terms: the number shown is a percentage when the description adds "%" or the
      // game marks the formula as a percentage (then the raw value is a fraction).
      if (!term.percent && !pct) { unsupported.push('target health term without a percentage'); continue; }
      const frac = pct && !term.percent ? v : pct ? v : v / 100;
      raw += term.kind === 'targetMax' ? frac * maxHp
        : term.kind === 'targetMissing' ? frac * (maxHp - current) : frac * current;
    }
    return {learned: true, rank, raw, damage: mitigate(raw, line.type, side.stats, target.stats, shred), type: line.type, unsupported,
            perHit: !!line.perHit};
  }

  // One damage or heal term's number at this rank: {v, pct} (pct: the game's formula is a fraction shown as %).
  function termValue(spell, term, ctx, unsupported) {
    let v, pct = false;
    if (term.n !== undefined) v = term.n;
    else if (term.calc) {
      const r = evalCalc(spell, term.calc, ctx);
      unsupported.push(...r.unsupported);
      v = r.value;
      pct = !!(spell.calcs[term.calc] || {}).pct;
    } else {
      const arr = spell.values[term.value] || [];
      if (!arr.length) unsupported.push('missing value ' + term.value);
      v = arr.length ? arr[Math.min(ctx.rank, arr.length - 1)] : 0;
    }
    return {v: v * (term.mult ?? 1), pct};
  }

  // Self-heal of one spell's first heal line. o.damage: the damage this spell just dealt (for "% of damage
  // dealt"); o.selfHp: your health now (default full). Heal and Shield Power applies; Grievous Wounds doesn't
  // (runCombo applies it).
  function spellHeal(data, side, key, o = {}) {
    const champ = data.champions[side.champ];
    const spell = champ.spells.find((s) => s.key === key);
    const none = {heal: 0, unsupported: []};
    const rank = spellRank(data, side, key);
    const line = rank && (spell.heals || [])[0];
    if (!line) return none;
    if (((data.rules.spellHealsNotInCombo || {})[`${side.champ} ${key}`])) return {...none, skipped: true};
    if ((data.rules.spellHealsUnknown || {})[`${side.champ} ${key}`]) return {...none, unsupported: ['heal not readable']};
    const unsupported = [];
    const ctx = {rank, level: clampLevel(side.level), stats: side.stats, rules: data.rules};
    const maxHp = side.stats.total.hp || 0, selfHp = o.selfHp ?? maxHp;
    let heal = 0;
    for (const term of line.terms) {
      const {v, pct} = termValue(spell, term, ctx, unsupported);
      if (term.kind === 'unsupported') { unsupported.push('heal from another base'); continue; }
      if (term.kind === 'flat') { heal += v; continue; }
      if (!term.percent && !pct) { unsupported.push('heal percentage without a percentage'); continue; }
      const frac = pct && !term.percent ? v : pct ? v : v / 100;
      heal += frac * (term.kind === 'selfMax' ? maxHp : term.kind === 'selfMissing' ? maxHp - selfHp
        : term.kind === 'selfCurrent' ? selfHp : o.damage || 0);
    }
    return {heal: heal * (1 + (side.stats.total.hsp || 0) / 100), unsupported, perSecond: !!line.perSecond,
            minimum: !!line.minimum, fromDamage: line.terms.some((t) => t.kind === 'damageDealt')};
  }

  const DEFAULT_COMBO = [{spell: 'Q'}, {spell: 'W'}, {spell: 'E'}, {autos: 3}, {spell: 'R'}];

  // The default combo, plus the passive right after the autos when it deals damage in a normal fight.
  function defaultCombo(data, champId) {
    const champ = data.champions[champId];
    const p = champ && champ.spells.find((s) => s.key === 'P');
    const steps = DEFAULT_COMBO.map((s) => ({...s}));
    if (p && p.lines.length && !(data.rules.passiveNotInCombo || []).includes(champId)) steps.splice(4, 0, {spell: 'P'});
    return steps;
  }

  const clampPct = (v) => {
    if (v === '' || v === null || v === undefined) return 100;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 100;
  };

  // The combo in order against the target's running HP, with hand-written rune and item damage effects.
  function runCombo(data, attacker, target, steps) {
    const rules = data.rules;
    const champ = data.champions[attacker.champ];
    const a = attacker.stats;
    const maxHp = target.stats.total.hp || 0;
    const hpStart = maxHp * clampPct(target.currentHpPct) / 100;
    const flags = [];
    const effects = [];
    for (const id of (attacker.items || []).filter(Boolean)) {
      for (const e of (rules.itemDamage || {})[id] || []) effects.push({...e, source: 'item:' + id});
      if ((rules.itemDamageUnknown || []).includes(id)) flags.push('unknown_damage:item:' + id);
    }
    const runeIds = attacker.runes ? [attacker.runes.keystone, ...(attacker.runes.primaryRunes || []),
      ...(attacker.runes.secondaryRunes || [])].filter((x) => x !== null && x !== undefined) : [];
    for (const id of runeIds) {
      for (const e of (rules.runeDamage || {})[id] || []) effects.push({...e, source: 'rune:' + id});
      if ((rules.runeDamageUnknown || []).includes(String(id))) flags.push('unknown_damage:rune:' + id);
    }
    const melee = (champ.base.range || 0) < 300;
    const of = (kind) => effects.filter((e) => e.kind === kind && (!e.only || (e.only === 'melee') === melee));
    const effectUses = new Map();

    let hpAtHit = hpStart; // target HP when the current hit started: on-hit effects land with the hit
    let hp = hpStart, hits = 0, autos = 0, spellbladeReady = false, afterSpellDone = false, killsAt = null;
    const shred = {armor: 0, mr: 0}, shredStacks = {}, procsDone = new Set();
    const rows = [], excluded = [];
    const level = clampLevel(attacker.level);
    const adaptiveType = () => {
      const ad = a.bonus.ad || 0, ap = a.total.ap || 0;
      return ad > ap ? 'physical' : ad < ap ? 'magic' : champ.adaptiveAP ? 'magic' : 'physical';
    };
    const ratioSource = {ad: () => a.total.ad, bonusAd: () => a.bonus.ad, baseAd: () => a.base.ad, ap: () => a.total.ap,
      hp: () => a.total.hp, bonusHp: () => a.bonus.hp, targetMaxHp: () => maxHp, targetCurrentHp: () => hpAtHit,
      targetMissingHp: () => maxHp - hpAtHit};
    const effectRaw = (e) => {
      const base = Array.isArray(e.base) ? e.base[0] + (e.base[1] - e.base[0]) * (level - 1) / 17 : e.base || 0;
      return base + Object.entries(e.ratios || {}).reduce((s, [k, v]) => s + v * ((ratioSource[k] || (() => 0))() || 0), 0);
    };
    const ampFactor = (source, type) => {
      let f = 1;
      for (const e of of('amp')) {
        const applies = e.applies || 'all';
        if (applies === 'spells' && source !== 'spell') continue;
        if (applies === 'autos' && source !== 'auto') continue;
        if (applies === 'magicTrue' && type !== 'magic' && type !== 'true') continue;
        if (applies === 'magic' && type !== 'magic') continue;
        const [cond, arg] = (e.condition || 'always').split(':');
        let pct = 0;
        if (cond === 'always') pct = e.pct;
        else if (cond === 'targetBelow') pct = (hp / maxHp) * 100 < Number(arg) ? e.pct : 0;
        else if (cond === 'targetAbove') pct = (hp / maxHp) * 100 > Number(arg) ? e.pct : 0;
        else if (cond === 'targetBonusHp') pct = e.pct * Math.min(1, (target.stats.bonus.hp || 0) / Number(arg));
        else if (cond === 'afterHits') pct = hits >= Number(arg) ? e.pct : 0;
        else if (cond === 'afterAutos') pct = autos >= Number(arg) ? e.pct : 0;
        else if (cond === 'targetMoreMaxHp') {
          const diff = (maxHp - a.total.hp) / a.total.hp;
          const [lo, hi] = e.pct;
          pct = diff < 0.1 ? 0 : lo + (hi - lo) * Math.min(1, (diff - 0.1) / 0.9);
        }
        f *= 1 + pct;
      }
      return f;
    };
    // Healing: life steal on basic attacks and their on-hit effects, omnivamp on all damage; damage past the
    // target's remaining health heals nothing. Grievous Wounds and healing from spells, runes and items are not counted.
    // Your own health starts at your "Current health %"; healing past your max is wasted (healedUsed).
    // Grievous Wounds: the target's strongest anti-heal item cuts all your healing.
    const lifesteal = (a.total.lifesteal || 0) / 100, omnivamp = (a.total.omnivamp || 0) / 100;
    const grievous = Math.max(0, ...(target.items || []).filter(Boolean).map((id) => (rules.grievousWounds || {})[id] || 0));
    const selfMax = a.total.hp || 0;
    let selfHp = selfMax * clampPct(attacker.currentHpPct) / 100;
    let healed = 0, healedUsed = 0, stepHealed = 0;
    const gain = (h) => {
      h *= 1 - grievous;
      const used = Math.min(h, Math.max(0, selfMax - selfHp));
      healed += h; healedUsed += used; stepHealed += h; selfHp += used;
    };
    const hit = (dmg, source) => {
      const landed = Math.min(dmg, Math.max(0, hp));
      gain(landed * (omnivamp + (source === 'auto' ? lifesteal : 0)));
      hp -= dmg;
    };
    // One damage instance: mitigate with the running shred, amplify, subtract; returns the damage dealt.
    const deal = (raw, type, source) => {
      const t = type === 'adaptive' ? adaptiveType() : type;
      const dmg = mitigate(raw, t, a, target.stats, shred) * ampFactor(source, t);
      hit(dmg, source);
      add(byType, t, dmg);
      return {dmg, type: t};
    };
    const afterHit = (type, notes) => {
      hits++;
      for (const e of of('proc')) {
        if (!procsDone.has(e) && hits >= (e.hits || 1)) {
          procsDone.add(e);
          notes.push('proc:' + e.source);
          return deal(effectRaw(e), e.type, 'effect').dmg;
        }
      }
      return 0;
    };
    const applyShred = (type) => {
      for (const e of of('shred')) {
        if (e.on !== type) continue;
        shredStacks[e.source] = Math.min(e.maxStacks, (shredStacks[e.source] || 0) + 1);
        shred[e.stat] = Math.max(shred[e.stat], shredStacks[e.source] * e.pctPerStack);
      }
    };

    const byType = {}; // damage dealt per type (physical, magic, true)
    steps.forEach((step, i) => {
      if (killsAt !== null) return;
      const notes = [];
      let damage = 0;
      stepHealed = 0;
      hpAtHit = hp;
      if (step.spell) {
        const hpBefore = hp;
        const r = spellDamage(data, attacker, {stats: target.stats, currentHp: hp}, step.spell, 0, shred);
        if (!r.learned) notes.push('not_learned');
        else if (r.unsupported.length) { notes.push('excluded'); excluded.push(step.spell); spellbladeReady = true; }
        else if (r.noDamage) { notes.push('no_damage'); spellbladeReady = true; }
        else {
          if (r.perHit) notes.push('per_hit');
          const f = ampFactor('spell', r.type);
          hit(r.damage * f, 'spell');
          add(byType, r.type, r.damage * f);
          damage += r.damage * f;
          damage += afterHit(r.type, notes);
          applyShred(r.type);
          spellbladeReady = true;
          if (!afterSpellDone) {
            for (const e of of('afterSpell')) { damage += deal(effectRaw(e), e.type, 'effect').dmg; notes.push('effect:' + e.source); }
            afterSpellDone = true;
          }
        }
        if (r.learned) {
          // The spell's own heal, from the spell damage that landed (not item or rune procs).
          const landed = r.unsupported.length || r.noDamage ? 0 : Math.min(r.damage * ampFactor('spell', r.type), Math.max(0, hpBefore));
          const h = spellHeal(data, attacker, step.spell, {damage: landed, selfHp});
          if (h.unsupported.length || (h.fromDamage && r.unsupported.length)) notes.push('heal_excluded');
          else if (h.heal > 0) {
            gain(h.heal);
            if (h.perSecond) notes.push('heal_per_second');
            if (h.minimum) notes.push('heal_minimum');
          }
        }
      } else {
        const count = Math.max(0, Math.round(Number(step.autos)) || 0);
        const mult = rules.critBase + (a.bonus.critDmg || 0) / 100;
        const chance = Math.min(100, a.total.crit || 0) / 100;
        for (let n = 0; n < count && hp > 0; n++) {
          autos++;
          hpAtHit = hp;
          damage += deal((a.total.ad || 0) * (1 + chance * (mult - 1)), 'physical', 'auto').dmg;
          for (const e of of('onHit')) {
            const used = effectUses.get(e) || 0;
            if (autos % (e.every || 1) !== 0 || (e.limit && used >= e.limit)) continue;
            effectUses.set(e, used + 1);
            damage += deal(effectRaw(e), e.type, 'auto').dmg;
          }
          if (spellbladeReady) {
            for (const e of of('spellblade')) { damage += deal(effectRaw(e), e.type, 'auto').dmg; notes.push('effect:' + e.source); }
            spellbladeReady = false;
          }
          damage += afterHit('physical', notes);
          applyShred('physical');
        }
      }
      if (hp <= 0 && killsAt === null) { killsAt = i + 1; notes.push('kills'); }
      rows.push({step: i + 1, label: step.spell || 'A×' + step.autos, damage, hpAfter: Math.max(0, hp), healed: stepHealed, notes});
    });
    return {rows, hpStart, hpLeft: Math.max(0, hp), killsAt, excluded, flags, healed, healedUsed, grievous, byType};
  }

  // "How to beat them": what the enemy relies on, read from both combos (each against a full-health target).
  // Each entry names a stat to buy (stat) or a Stats explained card whose counter items apply (card).
  // ponytail: fixed thresholds (60% of one type, 120 armor, 80 magic resist, 3000 health), tune if they mislead
  function counterAdvice(data, you, enemy) {
    const ys = championStats(data, you), es = championStats(data, enemy);
    const combo = (a, as, b, bs) => runCombo(data, {...a, stats: as}, {champ: b.champ, stats: bs, currentHpPct: 100, items: b.items},
      a.combo || defaultCombo(data, a.champ));
    const share = (c) => {
      const sum = Object.values(c.byType).reduce((s, v) => s + v, 0);
      return sum > 0 ? Object.fromEntries(['physical', 'magic', 'true'].map((k) => [k, 100 * (c.byType[k] || 0) / sum])) : null;
    };
    const theirs = combo(enemy, es, you, ys), mine = share(combo(you, ys, enemy, es)), th = share(theirs);
    const out = [];
    if (th) {
      if (th.physical >= 60) out.push({id: 'physical', pct: th.physical, stat: 'armor'});
      else if (th.magic >= 60) out.push({id: 'magic', pct: th.magic, stat: 'mr'});
      else out.push({id: 'mixed', physical: th.physical, magic: th.magic, stat: 'hp'});
      if (th.true >= 25) out.push({id: 'true', pct: th.true, stat: 'hp'});
    }
    if (theirs.healed > 0 || (es.total.lifesteal || 0) + (es.total.omnivamp || 0) > 0) out.push({id: 'heals', card: 'lifesteal'});
    if (mine && mine.physical >= mine.magic) {
      const armor = es.total.armor || 0;
      out.push(armor >= 120 ? {id: 'armorHigh', value: armor, stat: 'armorPenPct'} : {id: 'armorLow', value: armor, stat: 'lethality'});
    } else if (mine) {
      const mr = es.total.mr || 0;
      out.push(mr >= 80 ? {id: 'mrHigh', value: mr, stat: 'magicPenPct'} : {id: 'mrLow', value: mr, stat: 'magicPen'});
    }
    if (es.total.hp >= 3000) out.push({id: 'tanky', value: es.total.hp, card: 'hp'});
    return out;
  }

  // --- Stage 3: the shop ------------------------------------------------------------------------
  // Buying an item uses owned components (recursively, each owned item once) and pays the rest.
  function purchase(data, champ, items, itemId) {
    const pool = new Map();
    for (const id of items.filter(Boolean)) pool.set(id, (pool.get(id) || 0) + 1);
    const consumed = [];
    const remaining = (id) => {
      const item = data.items[id];
      if (!item) return null;
      let cost = item.gold.base;
      for (const c of item.from || []) {
        if (pool.get(c)) { pool.set(c, pool.get(c) - 1); consumed.push(c); continue; }
        const sub = remaining(c);
        if (sub === null) return null;
        cost += sub;
      }
      return cost;
    };
    const cost = remaining(itemId);
    if (cost === null) return null;
    const next = items.slice();
    for (const c of consumed) next[next.indexOf(c)] = null;
    const slot = next.indexOf(null);
    if (slot === -1) return null;
    next[slot] = itemId;
    if (validateBuild(data, champ, next).length) return null;
    return {items: next, cost, consumed};
  }

  // Every affordable purchase (singles, all pairs, triples from the best singles), scored against the
  // panels' current choices: offense = enemy HP your combo removes in addition; defense = your HP saved.
  // opts.by: 'offense', 'defense' or a stat key (RANKABLE_STATS): the triples are searched for it. Without an
  // enemy only stats are scored. Every row carries `gains`: each rankable stat's total after minus before.
  // No gold given (empty, 0 or not a number): no limit, single buys only (`unlimited: true`).
  // ponytail: singles only, as all pairs without a gold limit means ~40k combos scored; add pairs if asked
  function adviseBuys(data, you, enemy, gold, opts = {}) {
    const tripleFrom = opts.tripleFrom ?? 20;
    const by = opts.by || 'offense';
    const n = gold === '' || gold === null || gold === undefined ? NaN : Number(gold);
    const unlimited = !Number.isFinite(n) || n <= 0, g = unlimited ? Infinity : n;
    if (!enemy && !RANKABLE_STATS.includes(by)) return {rows: [], notScored: [], baseline: null, error: 'no_enemy'};
    const rules = data.rules;
    const enemyStats = enemy && championStats(data, enemy);
    const score = (items) => {
      const stats = championStats(data, {...you, items});
      const total = Object.fromEntries(RANKABLE_STATS.map((k) => [k, stats.total[k] || 0]));
      if (!enemy) return {total, hpLeft: 0, killsAt: null, yourHpLeft: 0, enemyKillsAt: null};
      const mine = runCombo(data, {...you, items, stats}, {champ: enemy.champ, stats: enemyStats, currentHpPct: enemy.currentHpPct,
        items: enemy.items}, you.combo);
      const theirs = runCombo(data, {...enemy, stats: enemyStats}, {champ: you.champ, stats, currentHpPct: you.currentHpPct, items},
        enemy.combo);
      return {total, hpLeft: mine.hpLeft, killsAt: mine.killsAt, yourHpLeft: theirs.hpLeft, enemyKillsAt: theirs.killsAt};
    };
    const baseline = score(you.items);
    const notScoredIds = new Set(rules.advisorNotScored || []);
    const partly = new Set([...(rules.itemDamageUnknown || []), ...(rules.itemStatPassivesUnknown || [])]);
    const byInventory = new Map();
    const add = (buys, result) => {
      const key = result.items.filter(Boolean).sort().join(',');
      const known = byInventory.get(key);
      if (known && known.cost <= result.cost) return known;
      const s = score(result.items);
      const row = {buys, items: result.items, cost: result.cost, consumed: result.consumed,
        offense: baseline.hpLeft - s.hpLeft, killsAt: s.killsAt,
        defense: s.yourHpLeft - baseline.yourHpLeft, enemyKillsAt: s.enemyKillsAt,
        gains: Object.fromEntries(RANKABLE_STATS.map((k) => [k, s.total[k] - baseline.total[k]])),
        flags: buys.filter((id) => partly.has(id)).map((id) => 'partly_counted:' + id)};
      byInventory.set(key, row);
      return row;
    };
    // Apply buys in order; null if one doesn't fit or the total goes over the gold.
    const chain = (ids) => {
      let items = you.items, cost = 0;
      const consumed = [];
      for (const id of ids) {
        const p = purchase(data, you.champ, items, id);
        if (!p || cost + p.cost > g) return null;
        items = p.items; cost += p.cost; consumed.push(...p.consumed);
      }
      return {items, cost, consumed};
    };

    const singles = [];
    for (const id of Object.keys(data.items)) {
      // Tier-3 boot upgrades (tier 7) are unlocked by team objectives in game, not bought with gold.
      if (notScoredIds.has(id) || data.items[id].tier === 7) continue;
      const r = chain([id]);
      if (r) singles.push(add([id], r));
    }
    // Pairs and triples allow the same item more than once (two Long Swords) and try every order:
    // buying an item before its own component keeps the component as a spare.
    const tryAll = (ids) => {
      const orders = ids.length === 2 ? [ids, [ids[1], ids[0]]]
        : [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((o) => o.map((x) => ids[x]));
      for (const order of orders) {
        const r = chain(order);
        if (r) add(order, r);
      }
    };
    const cheapest = Math.min(...singles.map((s) => s.cost));
    for (let i = 0; i < singles.length; i++) {
      if (unlimited || singles[i].cost + cheapest > g) continue;
      for (let j = i; j < singles.length; j++) tryAll([singles[i].buys[0], singles[j].buys[0]]);
    }
    const gainOf = (row, key) => (key in row ? row[key] : row.gains[key]);
    const best = (key) => singles.slice().sort((x, y) => gainOf(y, key) - gainOf(x, key)).slice(0, tripleFrom).map((s) => s.buys[0]);
    const top = unlimited ? [] : [...new Set(RANKABLE_STATS.includes(by) ? best(by) : [...best('offense'), ...best('defense')])];
    for (let i = 0; i < top.length; i++) {
      for (let j = i; j < top.length; j++) {
        for (let k = j; k < top.length; k++) tryAll([top[i], top[j], top[k]]);
      }
    }
    const notScored = [...notScoredIds].filter((id) => data.items[id]).map((id) => ({id, r: chain([id])}))
      .filter((x) => x.r).map((x) => ({id: x.id, cost: x.r.cost}));
    const rows = [...byInventory.values()];
    return {rows, notScored, baseline, unlimited, error: rows.length || notScored.length ? null : 'nothing_affordable'};
  }

  // cheapestFirst (no gold given): only buys that add something, by cost first, then by value.
  function rankBuys(rows, by, perGold, top = 20, cheapestFirst = false) {
    const isStat = !['offense', 'defense'].includes(by);
    const value = (r) => (isStat ? r.gains[by] : r[by]) * (perGold ? 100 / Math.max(r.cost, 1) : 1);
    const killRank = (r) => (isStat ? 0 : by === 'offense' ? (r.killsAt ?? Infinity) : -(r.enemyKillsAt ?? Infinity));
    const byValue = (a, b) => value(b) - value(a) || killRank(a) - killRank(b);
    return rows.filter((r) => !cheapestFirst || value(r) > 0)
      .sort((a, b) => (cheapestFirst ? a.cost - b.cost || byValue(a, b) : byValue(a, b) || a.cost - b.cost)
        || (a.buys || []).length - (b.buys || []).length).slice(0, top);
  }

  // --- Stage 4: rankings ------------------------------------------------------------------------
  const RANKABLE_STATS = ['hp', 'mp', 'ad', 'ap', 'armor', 'mr', 'as', 'ah', 'ms', 'crit', 'lethality', 'armorPenPct',
    'magicPen', 'magicPenPct', 'lifesteal', 'omnivamp', 'hsp', 'tenacity', 'hpregen', 'mpregen'];
  const padSix = (items) => [...items, null, null, null, null, null, null].slice(0, 6);

  // Best item builds for one stat on a reference champion: a beam search scored by the real stat engine,
  // so multipliers, conversions and caps count. Returns up to 60 builds, best first ("best found").
  function bestBuilds(data, opts, refChamp) {
    const ref = refChamp || (data.champions.Annie ? 'Annie' : Object.keys(data.champions)[0]);
    const level = clampLevel(opts.level ?? 18);
    const maxGold = opts.maxGold > 0 ? opts.maxGold : Infinity;
    const value = (items) => championStats(data, {champ: ref, level, items, runes: null,
      stacked: opts.stacked ?? true, stacks: opts.stacks || 0}).total[opts.stat] || 0;
    const base = value([]);
    const all = Object.keys(data.items)
      .filter((id) => data.items[id].tier !== 7 && data.items[id].gold.total <= maxGold
        && validateBuild(data, ref, [id]).length === 0)
      .map((id) => ({id, gain: value([id]) - base, cost: data.items[id].gold.total}))
      .filter((c) => c.gain > 1e-9);
    const byGain = all.slice().sort((a, b) => b.gain - a.gain).slice(0, 30);
    const byGold = Number.isFinite(maxGold)
      ? all.slice().sort((a, b) => b.gain / Math.max(b.cost, 1) - a.gain / Math.max(a.cost, 1)).slice(0, 15) : [];
    const candidates = [...new Map([...byGain, ...byGold].map((c) => [c.id, c])).values()];

    const seen = new Map([['', {items: [], cost: 0, value: base}]]);
    let frontier = [seen.get('')];
    for (let round = 0; round < 6; round++) {
      const next = [];
      for (const build of frontier) {
        for (const c of candidates) {
          const cost = build.cost + c.cost;
          if (cost > maxGold) continue;
          const items = [...build.items, c.id];
          const key = items.slice().sort().join(',');
          if (seen.has(key) || validateBuild(data, ref, items).length) continue;
          const entry = {items, cost, value: value(items)};
          seen.set(key, entry);
          next.push(entry);
        }
      }
      frontier = next.sort((a, b) => b.value - a.value).slice(0, 200);
      if (!frontier.length) break;
    }
    return [...seen.values()].sort((a, b) => b.value - a.value).slice(0, 60)
      .map((b) => ({items: padSix(b.items), value: b.value, cost: b.cost}));
  }

  // The legal rune page (and shards) that adds the most to one stat for this champion and build.
  // Only runes whose stat rules touch the stat are worth trying; other rows take their first rune.
  function bestRunePage(data, sel, stat) {
    const rules = data.rules;
    // Stats that raise the ranked one: move speed %, base regen %, adaptive force.
    const related = {ms: ['msPct'], hpregen: ['hpRegenPct'], mpregen: ['mpRegenPct'], ad: ['adaptive'], ap: ['adaptive']}[stat] || [];
    const touches = (e) => (e.always || sel.stacked) && (e.op === 'jack' ? ['ah', 'ad', 'ap'].includes(stat)
      : e.stat === stat || related.includes(e.stat));
    const options = (ids) => {
      const helpful = ids.filter((id) => (rules.runeStats[id] || []).some(touches));
      return helpful.length ? helpful : [ids[0]];
    };
    const value = (page) => championStats(data, {...sel, runes: page}).total[stat] || 0;
    const firstShards = rules.shardRows.map((row) => row[0]);
    let best = null, bestValue = -Infinity;
    for (const primary of data.runes.trees) {
      const [ks, r1, r2, r3] = primary.slots.map(options);
      for (const secondary of data.runes.trees) {
        if (secondary.id === primary.id) continue;
        const pairs = [];
        for (let a = 1; a <= 3; a++) {
          for (let b = a + 1; b <= 3; b++) {
            for (const x of options(secondary.slots[a])) for (const y of options(secondary.slots[b])) pairs.push([x, y]);
          }
        }
        for (const k of ks) for (const a of r1) for (const b of r2) for (const c of r3) for (const pair of pairs) {
          const page = {primary: primary.id, keystone: k, primaryRunes: [a, b, c], secondary: secondary.id,
            secondaryRunes: pair, shards: firstShards};
          const v = value(page);
          if (v > bestValue + 1e-9) { best = page; bestValue = v; }
        }
      }
    }
    const shards = firstShards.slice();
    rules.shardRows.forEach((row, i) => {
      let rowBest = -Infinity;
      for (const s of row) {
        const trial = shards.slice();
        trial[i] = s;
        const v = value({...best, shards: trial});
        if (v > rowBest + 1e-9) { rowBest = v; shards[i] = s; }
      }
    });
    return {...best, shards};
  }

  // One row per champion: their best build (from the shared best builds, or their own search when none is
  // legal for them), plus the best rune page; ranked by the stat, ties share a rank.
  function rankStat(data, opts) {
    const t0 = Date.now();
    const stat = opts.stat;
    const level = clampLevel(opts.level ?? 18);
    const count = Math.min(50, Math.max(1, Math.round(Number(opts.count ?? 10)) || 1));
    const stacked = opts.stacked ?? true;
    const stacks = Math.max(0, Math.round(Number(opts.stacks)) || 0);
    const maxGold = Number(opts.maxGold) > 0 ? Number(opts.maxGold) : null;
    const rules = data.rules;
    const usesMana = (c) => data.champions[c].resource === 'Mana';
    const champs = Object.keys(data.champions).filter((c) => !['mp', 'mpregen'].includes(stat) || usesMana(c));
    // Builds are searched on the default reference champion and on the champion with the most of the stat
    // without items: items that scale with base values (Base Regen %) are worth most there.
    const bare = (c) => championStats(data, {champ: c, level, items: [], runes: null, stacked, stacks: 0}).total[stat] || 0;
    const top = champs.reduce((best, c) => (bare(c) > bare(best) ? c : best), champs[0]);
    const byKey = new Map();
    for (const b of [...bestBuilds(data, {stat, level, maxGold, stacked}), ...(top ? bestBuilds(data, {stat, level, maxGold, stacked}, top) : [])]) {
      const key = b.items.filter(Boolean).sort().join(',');
      if (!byKey.has(key)) byKey.set(key, b);
    }
    const shared = [...byKey.values()];
    const rows = [];
    for (const champ of champs) {
      const sel = {champ, level, runes: null, stacked, stacks};
      let builds = shared.filter((b) => validateBuild(data, champ, b.items).length === 0);
      if (!builds.length) builds = bestBuilds(data, {stat, level, maxGold, stacked}, champ);
      const best3 = builds.map((b) => ({b, v: championStats(data, {...sel, items: b.items}).total[stat] || 0}))
        .sort((x, y) => y.v - x.v).slice(0, 3);
      let best = null;
      for (const {b} of best3) {
        const runes = bestRunePage(data, {...sel, items: b.items}, stat);
        const v = championStats(data, {...sel, items: b.items, runes}).total[stat] || 0;
        if (!best || v > best.value) best = {items: b.items, runes, value: v};
      }
      const flags = [...new Set(best.items.filter((i) => i && (rules.itemStatPassivesUnknown || []).includes(i)))]
        .map((i) => 'partly_counted:item:' + i);
      if ((rules.championStatsUnknown || []).includes(champ)) flags.push('partly_counted:champion:' + champ);
      rows.push({champ, level, value: best.value, items: best.items, runes: best.runes, flags});
    }
    const name = (c) => data.champions[c].name.en;
    rows.sort((a, b) => b.value - a.value || name(a.champ).localeCompare(name(b.champ)));
    const precision = stat === 'as' ? 1000 : 10; // ties at the precision the page shows
    rows.forEach((r, i) => {
      r.rank = i && Math.round(r.value * precision) === Math.round(rows[i - 1].value * precision) ? rows[i - 1].rank : i + 1;
    });
    return {rows: rows.slice(0, count), ms: Date.now() - t0};
  }

  // One champion's best builds for one stat: items searched on that champion, then the best rune page for
  // each. Rows best first (ties: cheaper first), each with its full stats.
  function optimizeChampion(data, opts) {
    const t0 = Date.now();
    const {champ, stat} = opts;
    const level = clampLevel(opts.level ?? 18);
    const count = Math.min(20, Math.max(1, Math.round(Number(opts.count ?? 5)) || 1));
    const stacked = opts.stacked ?? true;
    const stacks = Math.max(0, Math.round(Number(opts.stacks)) || 0);
    const maxGold = Number(opts.maxGold) > 0 ? Number(opts.maxGold) : null;
    const sel = {champ, level, runes: null, stacked, stacks};
    const rows = bestBuilds(data, {stat, level, maxGold, stacked, stacks}, champ).slice(0, count * 2).map((b) => {
      const runes = bestRunePage(data, {...sel, items: b.items}, stat);
      const stats = championStats(data, {...sel, items: b.items, runes});
      const flags = stats.flags.map((f) => (f.startsWith('unknown_passive:') ? 'partly_counted:item:' + f.split(':')[1]
        : 'partly_counted:champion:' + f.split(':')[1]));
      return {champ, level, items: b.items, runes, cost: b.cost, value: stats.total[stat] || 0, stats, flags};
    });
    rows.sort((a, b) => b.value - a.value || a.cost - b.cost);
    return {rows: rows.slice(0, count), ms: Date.now() - t0};
  }

  // Where the bonus stats come from: one column per item, then the runes, then the champion (passive and
  // stacks). Each column is what the stats lose without it, so a multiplier (Rabadon) counts its share of
  // everything; `notAdditive` lists stats whose columns then don't add up to the total exactly.
  // Attack speed is in bonus % (as the stats table shows it); every other stat is its total.
  function statBreakdown(data, sel) {
    const items = sel.items || [];
    const full = championStats(data, sel);
    const keys = [...new Set([...Object.keys(full.total), ...Object.keys(full.bonus)])];
    const val = (s, k) => (k === 'as' ? s.bonus.as || 0 : s.total[k] || 0);
    const lost = (without) => Object.fromEntries(keys.map((k) => [k, val(full, k) - val(without, k)])
      .filter(([, v]) => Math.abs(v) > 1e-9));
    const columns = items.map((id, slot) => id && {kind: 'item', id, slot,
      values: lost(championStats(data, {...sel, items: items.map((x, i) => (i === slot ? null : x))}))}).filter(Boolean);
    columns.push({kind: 'runes', values: lost(championStats(data, {...sel, runes: null}))});
    if (Object.values(sel.buffs || {}).some((n) => n > 0)) columns.push({kind: 'buffs', values: lost(championStats(data, {...sel, buffs: null}))});
    const noPassive = {...data, rules: {...data.rules,
      championPassiveStats: {...(data.rules.championPassiveStats || {}), [sel.champ]: undefined}}};
    columns.push({kind: 'champion', values: lost(championStats(noPassive, {...sel, stacks: 0}))});
    const notAdditive = keys.filter((k) => {
      const sum = columns.reduce((t, c) => t + (c.values[k] || 0), 0);
      return Math.abs((k === 'as' ? 0 : full.base[k] || 0) + sum - val(full, k)) > 0.05;
    });
    return {columns, notAdditive, stats: full};
  }

  // Gold per point of each stat, from the cheapest basic item (no components) that gives only that stat.
  const priceCache = new WeakMap();
  function statGoldPrices(data) {
    if (priceCache.has(data)) return priceCache.get(data);
    const prices = {};
    for (const item of Object.values(data.items)) {
      const keys = Object.keys(item.stats);
      if (keys.length !== 1 || (item.from || []).length || !(item.gold.total > 0)) continue;
      const g = item.gold.total / item.stats[keys[0]];
      if (!(keys[0] in prices) || g < prices[keys[0]]) prices[keys[0]] = g;
    }
    priceCache.set(data, prices);
    return prices;
  }

  // What a champion's kit scales with: the summed damage of its abilities in the default combo at `level` (no items,
  // runes or basic attacks, each cast on a full 3000-health target with no resists), then again with 1000 gold of
  // each stat added. Best stat first. Basic attacks would make every champion look like an AD champion.
  // Attack speed and ability haste are left out: they add attacks and casts over time, which one combo doesn't count.
  const SCALING_STATS = ['ad', 'ap', 'hp', 'armor', 'mr', 'crit'];
  function kitScaling(data, champId, level = 18) {
    const prices = statGoldPrices(data);
    const target = {stats: {base: {hp: 3000}, bonus: {hp: 0}, total: {hp: 3000, armor: 0, mr: 0}}, currentHp: 3000};
    const keys = defaultCombo(data, champId).filter((x) => x.spell).map((x) => x.spell);
    let excluded = [];
    const damage = (add) => {
      const d = {...data, rules: {...data.rules, buffs: [{id: 'probe', add}]}};
      const sel = {champ: champId, level, items: [], runes: null, stacked: false, stacks: 0, buffs: {probe: 1}};
      const side = {...sel, stats: championStats(d, sel)};
      excluded = [];
      return keys.reduce((sum, key) => {
        const r = spellDamage(d, side, target, key);
        if (r.unsupported.length) { excluded.push(key); return sum; }
        return sum + (r.learned && !r.noDamage ? r.damage : 0);
      }, 0);
    };
    const before = damage({});
    const stats = SCALING_STATS.filter((k) => prices[k])
      .map((k) => ({stat: k, gain: damage({[k]: 1000 / prices[k]}) - before}))
      .filter((x) => x.gain >= 5).sort((a, b) => b.gain - a.gain); // under 5 damage per 1000 gold: noise
    return {stats, damage: before, excluded};
  }

  // Items that fit a class (guide.js CLASSES keyStats = {stat: weight}): each key stat scores weight x the item's
  // amount over the most any item of its kind gives (capped at 1); a passive that changes a key stat (Rabadon's)
  // adds half its weight. Best legendaries first, plus the best tier-2 boots.
  function classItems(data, keyStats, top = 6, starters = []) {
    const passives = data.rules.itemStatPassives || {};
    const rank = (ids) => {
      const most = {};
      for (const id of ids) for (const k in keyStats) most[k] = Math.max(most[k] || 0, data.items[id].stats[k] || 0);
      const score = (id) => Object.entries(keyStats).reduce((sum, [k, w]) =>
        sum + (most[k] ? w * Math.min(1, (data.items[id].stats[k] || 0) / most[k]) : 0), 0)
        + Object.entries(keyStats).reduce((sum, [k, w]) => sum + ((passives[id] || []).some((o) => (o.to || o.stat) === k) ? w / 2 : 0), 0);
      return ids.map((id) => ({id, score: score(id)})).filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || data.items[a.id].gold.total - data.items[b.id].gold.total).map((x) => x.id);
    };
    const pick = (test) => Object.keys(data.items).filter((id) => test(data.items[id]) && !data.items[id].requiredChampion);
    return {items: rank(pick((i) => i.tier === 5 && !i.boots)).slice(0, top), boots: rank(pick((i) => i.boots && i.tier === 4))[0] || null,
      starter: rank(starters.filter((id) => data.items[id]))[0] || null};
  }

  // A simple first build for a champion: the item profile of its first class (guide.js CLASSES) that values
  // what its abilities scale with (AP Fighters and Assassins get Mage items, AD supports like Pyke their other
  // class); tanks and marksmen keep theirs (marksmen build for basic attacks whatever their abilities say),
  // a starter for its usual role (starters = guide.js STARTERS), boots, then three core items.
  function beginnerBuild(data, champId, classes, starters) {
    const champ = data.champions[champId];
    const best = (kitScaling(data, champId).stats.find((x) => x.stat === 'ad' || x.stat === 'ap') || {}).stat;
    const profile = (tag) => classes.find((c) => c.tag === tag);
    const main = profile(champ.tags[0]) || profile('Fighter');
    const keep = !best || ['Tank', 'Marksman'].includes(main.tag) || (main.tag === 'Support' && best !== 'ad');
    const own = keep ? main
      : champ.tags.map(profile).find((c) => c && c.keyStats[best]) || profile(best === 'ap' ? 'Mage' : 'Fighter');
    const role = (champ.positions || [])[0];
    const pick = classItems(data, own.keyStats, 3, starters.lane);
    const starter = role === 'JUNGLE' ? starters.jungle[main.tag === 'Tank' ? 'tank' : 'damage']
      : role === 'SUPPORT' ? starters.support : pick.starter;
    return {profile: own.tag, starter: data.items[starter] ? starter : null, boots: pick.boots, core: pick.items};
  }

  // Each ability at `level` (no items or runes) against a full 3000-health target with no resists: its damage,
  // and what it scales with: the extra damage from 100 more of each stat, divided by 100 (0.6 = 60% of AP).
  function spellScaling(data, champId, level, priority) {
    const target = {stats: {base: {hp: 3000}, bonus: {hp: 0}, total: {hp: 3000, armor: 0, mr: 0}}, currentHp: 3000};
    const side = (add) => {
      const d = {...data, rules: {...data.rules, buffs: [{id: 'probe', add}]}};
      const sel = {champ: champId, level, items: [], runes: null, stacked: false, stacks: 0, buffs: {probe: 1}, priority};
      return [d, {...sel, stats: championStats(d, sel)}];
    };
    const [d0, s0] = side({});
    const probes = ['ad', 'ap', 'hp', 'armor', 'mr'].map((k) => [k, side({[k]: 100})]);
    return data.champions[champId].spells.map((spell) => {
      const r = spellDamage(d0, s0, target, spell.key);
      const ok = r.learned && !r.noDamage && !r.unsupported.length;
      const ratios = ok ? probes.map(([k, [d, s]]) => ({stat: k, ratio: (spellDamage(d, s, target, spell.key).damage - r.damage) / 100}))
        .filter((x) => x.ratio >= 0.005).sort((a, b) => b.ratio - a.ratio) : [];
      return {key: spell.key, name: spell.name, learned: r.learned, rank: r.rank, noDamage: r.noDamage,
        unreadable: r.unsupported.length > 0, damage: ok ? r.damage : 0, type: r.type, perHit: r.perHit, ratios};
    });
  }

  // Each basic ability and the ultimate at every rank, at `level` (no items or runes, same target as spellScaling):
  // damage, and that rank's cooldown and cost from the game's "9/8/7/6/5" strings (one value = every rank).
  // Abilities without ranks (rules.skillRankRules noRanks) get no cells; levelUp is the game's level-up tooltip.
  function spellRankTable(data, champId, level) {
    const target = {stats: {base: {hp: 3000}, bonus: {hp: 0}, total: {hp: 3000, armor: 0, mr: 0}}, currentHp: 3000};
    const sel = {champ: champId, level, items: [], runes: null, stacked: false, stacks: 0};
    const side = {...sel, stats: championStats(data, sel)};
    const part = (str, rank) => {
      if (str === undefined || str === null || str === '') return null;
      const parts = String(str).split('/');
      return parts[rank - 1] ?? parts[0];
    };
    const fixed = ((data.rules.skillRankRules || {})[champId] || {}).noRanks || [];
    return data.champions[champId].spells.filter((s) => s.key !== 'P').map((spell) => ({key: spell.key, name: spell.name,
      noRanks: fixed.includes(spell.key), levelUp: spell.levelUp || [],
      cells: fixed.includes(spell.key) ? [] : Array.from({length: spell.maxrank}, (_, i) => {
        const rank = i + 1, r = spellDamage(data, {...side, ranks: {[spell.key]: rank}}, target, spell.key);
        const unreadable = r.unsupported.length > 0, ok = !unreadable && !r.noDamage;
        return {rank, damage: ok ? r.damage : 0, type: r.type, perHit: r.perHit, unreadable, noDamage: !!r.noDamage,
          cooldown: part(spell.cooldown, rank), cost: part(spell.cost, rank)};
      })}));
  }

  // Who wins a full trade at each level (both champions at that level, with their current items and runes):
  // the side whose combo leaves the other with the smaller share of health. 'you', 'them' or 'even'.
  function matchupByLevel(data, you, enemy) {
    const left = (a, b) => {
      const as = championStats(data, a), bs = championStats(data, b);
      const c = runCombo(data, {...a, stats: as}, {champ: b.champ, stats: bs, currentHpPct: 100, items: b.items}, a.combo || defaultCombo(data, a.champ));
      return c.killsAt ? 0 : c.hpLeft / (bs.total.hp || 1);
    };
    return Array.from({length: 18}, (_, i) => {
      const y = {...you, level: i + 1}, e = {...enemy, level: i + 1};
      const them = left(y, e), me = left(e, y);
      return Math.abs(them - me) < 0.02 ? 'even' : them < me ? 'you' : 'them';
    });
  }

  // A rune page from rune names (guide.js CLASSES runes): {keystone, primary: [3 names], secondary: [2 names], shards}.
  // Trees come from the runes themselves; the page is normalized like one picked by hand. Unknown names are left empty.
  function runePageFrom(data, spec) {
    const byName = (name) => Object.values(data.runes.byId).find((r) => r.name.en === name);
    const key = byName(spec.keystone), second = spec.secondary.map(byName);
    return normalizeRunePage(data, {primary: key ? key.tree : null, keystone: key ? key.id : null,
      primaryRunes: spec.primary.map((n) => (byName(n) || {}).id ?? null),
      secondary: second[0] ? second[0].tree : null, secondaryRunes: second.map((r) => (r ? r.id : null)), shards: spec.shards});
  }

  // The order to buy an item from scratch: each part's own recipe first (most expensive part first), then combine.
  function buildPath(data, id) {
    const steps = [];
    let total = 0;
    const walk = (x) => {
      const item = data.items[x];
      const parts = (item.from || []).filter((c) => data.items[c]).sort((a, b) => data.items[b].gold.total - data.items[a].gold.total);
      parts.forEach(walk);
      const cost = parts.length ? item.gold.base : item.gold.total;
      total += cost;
      steps.push({id: x, cost, total, combine: parts.length > 0});
    };
    walk(id);
    return steps;
  }

  // An item's stats in gold (at those prices) over its cost. Stats without a price are listed in `unpriced`;
  // passives are not priced.
  function goldEfficiency(data, id) {
    const item = data.items[id], prices = statGoldPrices(data);
    let value = 0;
    const unpriced = [];
    for (const [k, v] of Object.entries(item.stats)) {
      if (k in prices) value += v * prices[k]; else unpriced.push(k);
    }
    return {value, efficiency: item.gold.total > 0 ? value / item.gold.total : null, unpriced};
  }

  return {RANKABLE_STATS, bestBuilds, bestRunePage, rankStat, optimizeChampion, statBreakdown, statGoldPrices, goldEfficiency, adviseBuys, rankBuys, purchase, growth, capMoveSpeed, clampLevel, championStats, ultRank, skillOrder, startOrder, orderChoices, abilityRanks, validateBuild, allowedItems, pruneBuild,
          validateRunePage, normalizeRunePage, buildCost, goldWarning, evalCalc, skillRanks,
          mitigate, autoAttack, spellDamage, runCombo, counterAdvice, kitScaling, classItems, beginnerBuild, spellScaling, spellRankTable, matchupByLevel, buildPath, runePageFrom, DEFAULT_COMBO, defaultCombo, clampPct, spellHeal};
})();

if (typeof module === 'object') module.exports = Engine;
