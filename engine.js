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
        : c.basis === 'total' ? total[c.from] || 0 : bonus[c.from] || 0;
      total[c.to] = (total[c.to] || 0) + source * c.value;
    }
    for (const k of Object.keys(total)) {
      if (BASE_KEYS.includes(k) || k === 'ap') bonus[k] = total[k] - (base[k] || 0);
    }

    total.as = Math.min(rules.asCap, b.as + b.asratio * ((bonus.as || 0) / 100 + (b.asperlevel / 100) * g));
    let ms = (b.ms + (bonus.ms || 0)) * (1 + (bonus.msPct || 0) / 100);
    if (ms > 490) ms = 415 + 75 * 0.8 + (ms - 490) * 0.5;
    else if (ms > 415) ms = 415 + (ms - 415) * 0.8;
    total.ms = ms;
    total.range = b.range;

    const flags = items.filter((id) => (rules.itemStatPassivesUnknown || []).includes(id))
      .map((id) => 'unknown_passive:' + id);
    return {base, bonus, total, flags};
  }

  return {growth, clampLevel, championStats, ultRank};
})();

if (typeof module === 'object') module.exports = Engine;
