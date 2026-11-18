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
          return arr && arr.length ? arr[Math.min(ctx.rank, arr.length - 1)] : 0;
        }
        case 'n': return n.n;
        case 'stat': return formulaStat(n.stat, n.basis, ctx.stats, ctx.rules) * node(n.coef);
        case 'statOf': return formulaStat(n.stat, n.basis, ctx.stats, ctx.rules) * node(n.part);
        case 'lvlBp': return n.start + n.bps.reduce((sum, [at, add, perLevel]) =>
          sum + (ctx.level >= at ? add + (perLevel || 0) * (ctx.level - at + 1) : 0), 0);
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
  function skillRanks(champ, level, priority = ['Q', 'W', 'E']) {
    const max = Object.fromEntries(champ.spells.filter((s) => s.key !== 'P').map((s) => [s.key, s.maxrank]));
    const ranks = {Q: 0, W: 0, E: 0, R: 0};
    for (let l = 1; l <= clampLevel(level); l++) {
      if ([6, 11, 16].includes(l) && ranks.R < max.R) { ranks.R++; continue; }
      const early = l <= 3 ? ['Q', 'W', 'E'][l - 1] : null;
      if (early && ranks[early] < max[early]) { ranks[early]++; continue; }
      const cap = Math.floor((l + 1) / 2);
      const k = priority.find((key) => ranks[key] < max[key] && ranks[key] < cap);
      if (k) ranks[k]++;
    }
    return ranks;
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

  function spellDamage(data, side, target, key, lineIndex = 0, shred = {armor: 0, mr: 0}) {
    const champ = data.champions[side.champ];
    const spell = champ.spells.find((s) => s.key === key);
    const rank = key === 'P' ? 1 : skillRanks(champ, side.level, side.priority)[key];
    if (!rank) return {learned: false, rank: 0, raw: 0, damage: 0, type: null, unsupported: []};
    const unsupported = spell.flags.filter((f) => f === 'unparsed_tooltip');
    const line = spell.lines[lineIndex];
    if (!line) return {learned: true, rank, raw: 0, damage: 0, type: null, noDamage: true, unsupported};
    const ctx = {rank, level: clampLevel(side.level), stats: side.stats, rules: data.rules};
    const maxHp = target.stats.total.hp || 0;
    const current = target.currentHp ?? maxHp;
    let raw = 0;
    for (const term of line.terms) {
      let v;
      if (term.calc) {
        const r = evalCalc(spell, term.calc, ctx);
        unsupported.push(...r.unsupported);
        v = r.value;
      } else {
        const arr = spell.values[term.value] || [];
        v = arr.length ? arr[Math.min(rank, arr.length - 1)] : 0;
      }
      // Target-health terms are fractions; values written as percentages (> 1) are divided by 100.
      const frac = term.kind === 'flat' ? v : v > 1 ? v / 100 : v;
      raw += term.kind === 'targetMax' ? frac * maxHp
        : term.kind === 'targetMissing' ? frac * (maxHp - current)
          : term.kind === 'targetCurrent' ? frac * current : frac;
    }
    return {learned: true, rank, raw, damage: mitigate(raw, line.type, side.stats, target.stats, shred), type: line.type, unsupported,
            perHit: !!line.perHit};
  }

  const DEFAULT_COMBO = [{spell: 'Q'}, {spell: 'W'}, {spell: 'E'}, {autos: 3}, {spell: 'R'}];

  const clampPct = (v) => {
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
        else if (cond === 'targetMoreMaxHp') {
          const diff = (maxHp - a.total.hp) / a.total.hp;
          const [lo, hi] = e.pct;
          pct = diff < 0.1 ? 0 : lo + (hi - lo) * Math.min(1, (diff - 0.1) / 0.9);
        }
        f *= 1 + pct;
      }
      return f;
    };
    // One damage instance: mitigate with the running shred, amplify, subtract; returns the damage dealt.
    const deal = (raw, type, source) => {
      const t = type === 'adaptive' ? adaptiveType() : type;
      const dmg = mitigate(raw, t, a, target.stats, shred) * ampFactor(source, t);
      hp -= dmg;
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

    steps.forEach((step, i) => {
      if (killsAt !== null) return;
      const notes = [];
      let damage = 0;
      hpAtHit = hp;
      if (step.spell) {
        const r = spellDamage(data, attacker, {stats: target.stats, currentHp: hp}, step.spell, 0, shred);
        if (!r.learned) notes.push('not_learned');
        else if (r.unsupported.length) { notes.push('excluded'); excluded.push(step.spell); spellbladeReady = true; }
        else if (r.noDamage) { notes.push('no_damage'); spellbladeReady = true; }
        else {
          if (r.perHit) notes.push('per_hit');
          const f = ampFactor('spell', r.type);
          hp -= r.damage * f;
          damage += r.damage * f;
          damage += afterHit(r.type, notes);
          applyShred(r.type);
          spellbladeReady = true;
          if (!afterSpellDone) {
            for (const e of of('afterSpell')) { damage += deal(effectRaw(e), e.type, 'effect').dmg; notes.push('effect:' + e.source); }
            afterSpellDone = true;
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
      rows.push({step: i + 1, label: step.spell || 'A×' + step.autos, damage, hpAfter: Math.max(0, hp), notes});
    });
    return {rows, hpStart, hpLeft: Math.max(0, hp), killsAt, excluded, flags};
  }

  return {growth, clampLevel, championStats, ultRank, validateBuild, allowedItems, pruneBuild,
          validateRunePage, normalizeRunePage, buildCost, goldWarning, evalCalc, skillRanks,
          mitigate, autoAttack, spellDamage, runCombo, DEFAULT_COMBO, clampPct};
})();

if (typeof module === 'object') module.exports = Engine;
