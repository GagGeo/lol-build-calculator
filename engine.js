// Pure game-math functions shared by the page and the tests. No DOM access here.
const Engine = (() => {
  const BASE_KEYS = ['hp', 'mp', 'armor', 'mr', 'ad', 'hpregen', 'mpregen'];

  const growth = (level) => (level - 1) * (0.7025 + 0.0175 * (level - 1));

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

  function championStats(data, sel) {
    const level = clampLevel(sel.level);
    const champ = data.champions[sel.champ];
    const b = champ.base;
    const rules = data.rules;
    const g = growth(level);
    const items = (sel.items || []).filter(Boolean);

    const base = {ms: b.ms, range: b.range, as: b.as + b.asratio * (b.asperlevel / 100) * g};
    for (const k of BASE_KEYS) base[k] = b[k] + (b[k + 'perlevel'] || 0) * g;

    const bonus = {};
    const fromItems = {};
    for (const id of items) {
      for (const [k, v] of Object.entries(data.items[id].stats)) { add(bonus, k, v); add(fromItems, k, v); }
      // Flat passive stats ("add") and stacking items ("stacked", only when fully stacked) count as item stats.
      for (const p of rules.itemStatPassives[id] || []) {
        if (p.op === 'add' || (p.op === 'stacked' && sel.stacked)) { add(bonus, p.stat, p.value); add(fromItems, p.stat, p.value); }
      }
    }

    const runeMuls = [];
    if (sel.runes) {
      for (const shard of sel.runes.shards || []) {
        const s = rules.shards[shard];
        if (!s) continue;
        for (const [k, v] of Object.entries(s)) {
          if (k === 'hpPerLevel') add(bonus, 'hp', v * level); else add(bonus, k, v);
        }
      }
      const melee = b.range < 300;
      for (const id of pageRunes(sel.runes)) {
        for (const entry of rules.runeStats[id] || []) {
          if (!entry.always && !sel.stacked) continue;
          if (entry.only && (entry.only === 'melee') !== melee) continue;
          if (entry.op === 'jack') {
            const n = Object.values(fromItems).filter((v) => v).length;
            add(bonus, 'ah', n);
            add(bonus, 'adaptive', n >= 10 ? 20 : n >= 5 ? 8 : 0);
          } else if (entry.mulTotal !== undefined) {
            runeMuls.push({stat: entry.stat, value: entry.mulTotal});
          } else {
            add(bonus, entry.stat, runeEntryValue(entry, level));
          }
        }
      }
    }

    const stacker = rules.stackers[sel.champ];
    if (stacker && sel.stacks > 0) {
      for (const [k, v] of Object.entries(stacker)) {
        if (typeof v === 'number') add(bonus, k, v * sel.stacks);
        else if (v.per) add(bonus, k, Math.floor(sel.stacks / v.per) * v.value);
        else if (v.byRRank) { const r = ultRank(level); if (r) add(bonus, k, v.byRRank[r - 1] * sel.stacks); }
      }
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
    for (const m of [...passives.filter((p) => p.op === 'mulTotal'), ...runeMuls]) {
      total[m.stat] = (total[m.stat] || 0) * (1 + m.value);
    }
    for (const c of passives.filter((p) => p.op === 'convert')) {
      const source = c.basis === 'items' ? fromItems[c.from] || 0
        : c.basis === 'total' ? total[c.from] || 0
          : c.basis === 'base' ? base[c.from] || 0 : bonus[c.from] || 0;
      total[c.to] = (total[c.to] || 0) + source * c.value;
    }
    for (const k of Object.keys(total)) {
      if (BASE_KEYS.includes(k) || k === 'ap') bonus[k] = total[k] - (base[k] || 0);
    }

    // Base Health/Mana Regen % multiplies the champion's base regen only.
    total.hpregen = base.hpregen * (1 + (bonus.hpRegenPct || 0) / 100) + (fromItems.hpregen || 0);
    total.mpregen = base.mpregen * (1 + (bonus.mpRegenPct || 0) / 100) + (fromItems.mpregen || 0);
    bonus.hpregen = total.hpregen - base.hpregen;
    bonus.mpregen = total.mpregen - base.mpregen;
    if (total.crit !== undefined) total.crit = Math.min(100, total.crit);
    total.as = Math.min(rules.asCap, b.as + b.asratio * ((bonus.as || 0) / 100 + (b.asperlevel / 100) * g));
    let ms = (b.ms + (bonus.ms || 0)) * (1 + (bonus.msPct || 0) / 100);
    if (ms > 490) ms = 415 + 75 * 0.8 + (ms - 490) * 0.5;
    else if (ms > 415) ms = 415 + (ms - 415) * 0.8;
    total.ms = ms;
    total.range = b.range;

    const flags = items.filter((id) => (rules.itemStatPassivesUnknown || []).includes(id))
      .map((id) => 'unknown_passive:' + id);
    if ((rules.championStatsUnknown || []).includes(sel.champ)) flags.push('unknown_champion:' + sel.champ);
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

  return {growth, clampLevel, championStats, ultRank, validateBuild, allowedItems, pruneBuild,
          validateRunePage, normalizeRunePage, buildCost, goldWarning};
})();

if (typeof module === 'object') module.exports = Engine;
