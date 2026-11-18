// The page: two champion panels (you and the enemy) and each side's damage to the other.
const DATA = window.DATA;
// Some private windows throw on merely reading window.localStorage.
const storage = (() => { try { return window.localStorage; } catch { return undefined; } })();
let lang = I18N.loadLang(storage);
// The enemy panel is optional (hidden by default); whether it's shown is remembered per browser.
let enemyShown = (() => { try { return storage.getItem('enemy') === '1'; } catch { return false; } })();
const panels = [];

const t = (key, vars) => I18N.t(key, lang, vars);
const nm = (obj) => I18N.name(obj, lang);
const byName = (a, b) => nm(a.name).localeCompare(nm(b.name), lang);
const STAT_ORDER = ['hp', 'mp', 'ad', 'ap', 'armor', 'mr', 'as', 'ah', 'ms', 'msPct', 'crit', 'critDmg', 'lethality',
  'armorPenPct', 'magicPen', 'magicPenPct', 'lifesteal', 'omnivamp', 'hsp', 'tenacity', 'hpregen', 'hpRegenPct',
  'mpregen', 'mpRegenPct', 'range'];

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v; else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
};

const fmt = (n, digits = 1) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {maximumFractionDigits: digits});
};

// Fill a <select> from [{value, label}] or [{group, options}], keeping `value` selected.
function fillSelect(select, entries, value, emptyLabel) {
  select.replaceChildren();
  if (emptyLabel !== undefined) select.append(new Option(emptyLabel, ''));
  for (const e of entries) {
    if (e.group) {
      if (!e.options.length) continue;
      const g = el('optgroup', {label: e.group});
      for (const o of e.options) g.append(new Option(o.label, o.value));
      select.append(g);
    } else select.append(new Option(e.label, e.value));
  }
  select.value = value === null || value === undefined ? '' : String(value);
}

const runeName = (id) => nm(DATA.runes.byId[id].name);
function shardLabel(id) {
  const [key, value] = Object.entries(DATA.rules.shards[id])[0];
  return key === 'hpPerLevel' ? t('shard_hpPerLevel') : `${t('stat_' + key)} +${fmt(value)}${key === 'as' || key === 'msPct' || key === 'tenacity' ? '%' : ''}`;
}

const PRIORITIES = ['QWE', 'QEW', 'WQE', 'WEQ', 'EQW', 'EWQ'];
const sourceName = (source) => {
  const [kind, id] = source.split(':');
  return kind === 'item' ? nm(DATA.items[id].name) : runeName(id);
};

function createPanel(container, side, onChange) {
  const champs = Object.values(DATA.champions);
  const state = {
    champ: champs.slice().sort(byName)[side === 'you' ? 0 : 1].id, level: 1, stacks: 0, stacked: false,
    items: [null, null, null, null, null, null],
    runes: Engine.normalizeRunePage(DATA, {}),
    currentHpPct: 100, priority: ['Q', 'W', 'E'], combo: Engine.DEFAULT_COMBO.map((s) => ({...s})), gold: 0,
  };
  let removedNotice = '';

  const ui = {
    title: el('h2'), champ: el('select', {id: side + '-champ'}),
    range: el('input', {type: 'range', min: 1, max: 18, step: 1, id: side + '-level'}),
    number: el('input', {type: 'number', min: 1, max: 18, step: 1}),
    stacks: el('input', {type: 'number', min: 0, step: 1, id: side + '-stacks'}),
    primary: el('select', {id: side + '-primary'}), keystone: el('select', {id: side + '-keystone'}),
    primaryRunes: [0, 1, 2].map(() => el('select')),
    secondary: el('select', {id: side + '-secondary'}), secondaryRunes: [0, 1].map(() => el('select')),
    shards: [0, 1, 2].map(() => el('select')),
    stacked: el('input', {type: 'checkbox', id: side + '-stacked'}),
    slots: [0, 1, 2, 3, 4, 5].map(() => el('select')),
    cost: el('div', {class: 'cost'}), notices: el('div'), stats: el('table'), note: el('p', {class: 'note'}),
    hp: el('input', {type: 'number', min: 1, max: 100, step: 1, id: side + '-hp'}),
    gold: el('input', {type: 'number', min: 0, step: 1, id: side + '-gold'}),
    priority: el('select', {id: side + '-priority'}),
    comboList: el('ol', {class: 'combo-list'}), addStep: el('select', {id: side + '-addstep'}),
    addButton: el('button', {type: 'button'}), resetButton: el('button', {type: 'button'}),
    results: el('div', {class: 'results full'}),
    labels: {},
  };
  const label = (key, forId) => (ui.labels[key + forId] = el('label', forId ? {for: forId} : {}));
  const stacksWrap = el('div', {}, label('stacks', side + '-stacks'), ui.stacks);

  const left = el('div', {},
    label('champion', side + '-champ'), ui.champ,
    label('level', side + '-level'), el('div', {class: 'row'}, ui.range, ui.number),
    stacksWrap,
    label('currentHp', side + '-hp'), ui.hp,
    label('skillOrder', side + '-priority'), ui.priority,
    el('h3', {'data-k': 'runes'}),
    el('div', {class: 'runes-grid'},
      el('div', {}, label('primary', side + '-primary'), ui.primary, label('keystone', side + '-keystone'), ui.keystone,
        ...ui.primaryRunes.flatMap((s) => [el('label', {}, ''), s])),
      el('div', {}, label('secondary', side + '-secondary'), ui.secondary,
        ...ui.secondaryRunes.flatMap((s) => [el('label', {}, ''), s]),
        label('shards', ''), ...ui.shards)),
    el('label', {class: 'check'}, ui.stacked, el('span', {'data-k': 'stacked'})));
  const right = el('div', {},
    el('h3', {'data-k': 'items'}), el('div', {class: 'inventory'}, ...ui.slots.map((s) => el('div', {class: 'slot'}, s))),
    ui.cost, ...(side === 'you' ? [label('gold', side + '-gold'), ui.gold] : []), ui.notices,
    el('h3', {'data-k': 'stats'}), ui.stats, ui.note);
  const comboBox = el('div', {class: 'full'}, el('h3', {'data-k': 'combo'}), ui.comboList,
    el('div', {class: 'row combo-add'}, ui.addStep, ui.addButton, ui.resetButton));
  const removeButton = el('button', {type: 'button', class: 'remove-enemy'});
  removeButton.addEventListener('click', () => setEnemyShown(false));
  const head = side === 'enemy' ? el('div', {class: 'panel-head full'}, ui.title, removeButton) : ui.title;
  const section = el('section', {class: 'panel', 'aria-labelledby': side + '-title'}, head, left, right, comboBox, ui.results);
  container.append(section);
  ui.title.id = side + '-title';
  ui.slots.forEach((s, i) => s.setAttribute('aria-label', `${t('items')} ${i + 1}`));

  // --- events -------------------------------------------------------------
  ui.champ.addEventListener('change', () => {
    state.champ = ui.champ.value;
    state.stacks = 0; // stacks belong to one champion's passive
    const pruned = Engine.pruneBuild(DATA, state.champ, state.items);
    state.items = pruned.items;
    removedNotice = pruned.removed.length
      ? t('removed', {champ: nm(DATA.champions[state.champ].name), items: pruned.removed.map((id) => nm(DATA.items[id].name)).join(', ')})
      : '';
    render();
  });
  const setLevel = (v) => { state.level = Engine.clampLevel(v); render(); };
  ui.range.addEventListener('input', () => setLevel(ui.range.value));
  ui.number.addEventListener('change', () => setLevel(ui.number.value));
  ui.stacks.addEventListener('change', () => { state.stacks = Math.max(0, Math.round(Number(ui.stacks.value)) || 0); render(); });
  ui.stacked.addEventListener('change', () => { state.stacked = ui.stacked.checked; render(); });
  const num = (v) => (v === '' ? null : Number(v));
  const runeChange = (mutate) => () => { mutate(); state.runes = Engine.normalizeRunePage(DATA, state.runes); render(); };
  ui.primary.addEventListener('change', runeChange(() => { state.runes.primary = num(ui.primary.value); }));
  ui.keystone.addEventListener('change', runeChange(() => { state.runes.keystone = num(ui.keystone.value); }));
  ui.primaryRunes.forEach((s, i) => s.addEventListener('change', runeChange(() => { state.runes.primaryRunes[i] = num(s.value); })));
  ui.secondary.addEventListener('change', runeChange(() => { state.runes.secondary = num(ui.secondary.value); }));
  ui.secondaryRunes.forEach((s, i) => s.addEventListener('change', runeChange(() => { state.runes.secondaryRunes[i] = num(s.value); })));
  ui.shards.forEach((s, i) => s.addEventListener('change', runeChange(() => { state.runes.shards[i] = num(s.value); })));
  ui.hp.addEventListener('change', () => { state.currentHpPct = Engine.clampPct(ui.hp.value); render(); });
  ui.gold.addEventListener('change', () => { state.gold = Math.max(0, Math.round(Number(ui.gold.value)) || 0); render(); });
  ui.priority.addEventListener('change', () => { state.priority = ui.priority.value.split(''); render(); });
  ui.addButton.addEventListener('click', () => {
    state.combo.push(ui.addStep.value === 'A' ? {autos: 1} : {spell: ui.addStep.value});
    render();
  });
  ui.resetButton.addEventListener('click', () => { state.combo = Engine.DEFAULT_COMBO.map((s) => ({...s})); render(); });
  ui.slots.forEach((s, i) => s.addEventListener('change', () => {
    state.items[i] = s.value || null;
    removedNotice = '';
    render();
  }));

  // --- render -------------------------------------------------------------
  const spellLabel = (key) => {
    const spell = DATA.champions[state.champ].spells.find((s) => s.key === key);
    return `${key === 'P' ? t('passive') : key}: ${nm(spell.name)}`;
  };

  function renderCombo() {
    const move = (i, d) => () => {
      const j = i + d;
      if (j < 0 || j >= state.combo.length) return;
      [state.combo[i], state.combo[j]] = [state.combo[j], state.combo[i]];
      render();
    };
    const button = (text, aria, action) => {
      const b = el('button', {type: 'button', 'aria-label': aria, title: aria, class: 'icon', text});
      b.addEventListener('click', action);
      return b;
    };
    ui.comboList.replaceChildren(...state.combo.map((step, i) => {
      let what;
      if (step.spell) what = el('span', {text: spellLabel(step.spell)});
      else {
        const count = el('input', {type: 'number', min: 1, max: 20, step: 1, value: step.autos,
          'aria-label': `${t('autos')} (${t('step')} ${i + 1})`});
        count.addEventListener('change', () => { step.autos = Math.min(20, Math.max(1, Math.round(Number(count.value)) || 1)); render(); });
        what = el('span', {class: 'row'}, el('span', {text: t('autos')}), count);
      }
      return el('li', {}, what, el('span', {class: 'combo-buttons'},
        button('↑', t('moveUp'), move(i, -1)), button('↓', t('moveDown'), move(i, 1)),
        button('×', t('remove'), () => { state.combo.splice(i, 1); render(); })));
    }));
    fillSelect(ui.addStep, [...['P', 'Q', 'W', 'E', 'R'].map((k) => ({value: k, label: spellLabel(k)})),
      {value: 'A', label: t('autos')}], ui.addStep.value || 'Q');
    ui.addButton.textContent = t('addStep');
    ui.resetButton.textContent = t('resetCombo');
  }

  function itemOptions(slot) {
    const allowed = Engine.allowedItems(DATA, state.champ, state.items, slot).map((id) => DATA.items[id]).sort(byName);
    const opt = (i) => ({value: i.id, label: `${nm(i.name)} (${i.gold.total})`});
    const boots = allowed.filter((i) => i.boots);
    const starter = allowed.filter((i) => !i.boots && i.tier === 1);
    const legendary = allowed.filter((i) => !i.boots && i.tier === 5);
    const rest = allowed.filter((i) => !i.boots && i.tier !== 1 && i.tier !== 5);
    return [{group: t('boots'), options: boots.map(opt)}, {group: t('starter'), options: starter.map(opt)},
            {group: t('legendary'), options: legendary.map(opt)}, {group: t('components'), options: rest.map(opt)}];
  }

  function render() {
    const page = state.runes;
    ui.title.textContent = t(side);
    removeButton.textContent = t('removeEnemy');
    container.querySelectorAll('[data-k]').forEach((n) => { n.textContent = t(n.dataset.k); });
    ui.labels['champion' + side + '-champ'].textContent = t('champion');
    ui.labels['level' + side + '-level'].textContent = t('level');
    ui.labels['stacks' + side + '-stacks'].textContent = t('stacks');
    ui.labels['primary' + side + '-primary'].textContent = t('primary');
    ui.labels['keystone' + side + '-keystone'].textContent = t('keystone');
    ui.labels['secondary' + side + '-secondary'].textContent = t('secondary');
    ui.labels['shards'].textContent = t('shards');
    ui.labels['currentHp' + side + '-hp'].textContent = t('currentHp');
    ui.labels['skillOrder' + side + '-priority'].textContent = t('skillOrder');
    ui.hp.value = state.currentHpPct;
    ui.gold.value = state.gold;
    if (ui.labels['gold' + side + '-gold']) ui.labels['gold' + side + '-gold'].textContent = t('goldInPocket');
    fillSelect(ui.priority, PRIORITIES.map((p) => ({value: p, label: p.split('').join(' > ')})), state.priority.join(''));

    fillSelect(ui.champ, champs.slice().sort(byName).map((c) => ({value: c.id, label: nm(c.name)})), state.champ);
    ui.range.value = ui.number.value = state.level;
    stacksWrap.hidden = !DATA.rules.stackers[state.champ];
    ui.stacks.value = state.stacks;

    const trees = DATA.runes.trees;
    const tree = (id) => trees.find((x) => x.id === id);
    const runeOpts = (ids) => ids.map((id) => ({value: id, label: runeName(id)}));
    fillSelect(ui.primary, trees.map((x) => ({value: x.id, label: nm(x.name)})), page.primary, t('none'));
    const p = tree(page.primary);
    fillSelect(ui.keystone, p ? runeOpts(p.slots[0]) : [], page.keystone, t('none'));
    ui.keystone.disabled = !p;
    ui.primaryRunes.forEach((s, i) => {
      fillSelect(s, p ? runeOpts(p.slots[i + 1]) : [], page.primaryRunes[i], t('none'));
      s.disabled = !p;
    });
    fillSelect(ui.secondary, trees.filter((x) => x.id !== page.primary).map((x) => ({value: x.id, label: nm(x.name)})),
      page.secondary, t('none'));
    const sec = tree(page.secondary);
    const rowOf = (id) => (sec ? sec.slots.findIndex((r) => r.includes(id)) : -1);
    ui.secondaryRunes.forEach((s, i) => {
      const other = page.secondaryRunes[1 - i];
      const ids = sec ? sec.slots.slice(1).flat().filter((id) => other === null || rowOf(id) !== rowOf(other)) : [];
      fillSelect(s, runeOpts(ids), page.secondaryRunes[i], t('none'));
      s.disabled = !sec;
    });
    ui.shards.forEach((s, i) => {
      fillSelect(s, DATA.rules.shardRows[i].map((id) => ({value: id, label: shardLabel(id)})), page.shards[i],
        t(['offense', 'flex', 'defense'][i]));
    });
    ui.stacked.checked = state.stacked;

    ui.slots.forEach((s, i) => {
      fillSelect(s, itemOptions(i), state.items[i], t('empty'));
      s.classList.toggle('filled', !!state.items[i]);
    });

    const cost = Engine.buildCost(DATA, state.items);
    ui.cost.textContent = `${t('cost')}: ${fmt(cost, 0)} ${t('gold')}`;
    const notes = [];
    if (removedNotice) notes.push(removedNotice);
    const warn = Engine.goldWarning(DATA, state.level, state.items);
    if (warn) notes.push(t('goldWarning', {cost: fmt(warn.cost, 0), typical: fmt(warn.typical, 0)}));
    const s = Engine.championStats(DATA, {...state});
    for (const f of s.flags) {
      const [kind, id] = f.split(':');
      notes.push(kind === 'unknown_champion' ? t('unknownChampion', {champ: nm(DATA.champions[id].name)})
        : t('unknownPassive', {item: nm(DATA.items[id].name)}));
    }
    ui.notices.replaceChildren(...notes.map((n) => el('p', {class: 'notice', text: n})));

    const head = el('tr', {}, ...['stat', 'base', 'bonus', 'total'].map((k) => el('th', {scope: 'col', text: t(k)})));
    // Mana only means something for mana users; energy users get it relabelled; other resources are hidden.
    const resource = DATA.champions[state.champ].resource;
    const shown = (k) => k !== 'mp' || resource === 'Mana' || resource === 'Energy';
    const rows = STAT_ORDER.filter((k) => shown(k) && ((s.base[k] || 0) || (s.bonus[k] || 0) || (s.total[k] || 0))).map((k) => {
      const digits = k === 'as' ? 3 : 1;
      const baseV = s.base[k] ? fmt(s.base[k], digits) : '';
      const bonusV = s.bonus[k] ? (k === 'as' ? fmt(s.bonus[k]) + '%' : '+' + fmt(s.bonus[k])) : '';
      const statName = k === 'mp' && resource === 'Energy' ? t('stat_energy') : t('stat_' + k);
      return el('tr', {}, el('th', {scope: 'row', text: statName}), el('td', {text: baseV}),
        el('td', {text: bonusV}), el('td', {class: 'total', text: fmt(s.total[k] ?? 0, digits)}));
    });
    ui.stats.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
    ui.note.textContent = t('asNote');
    renderCombo();
    if (onChange) onChange();
  }

  render();
  return {getSelection: () => ({...state, items: state.items.slice(), combo: state.combo.map((s) => ({...s}))}),
          setLang: render, results: ui.results, section,
          setItems: (items, gold) => { state.items = items.slice(); if (gold !== undefined) state.gold = gold; removedNotice = ''; render(); },
          // Load a whole build (from the rankings); rows are already legal for their champion.
          setBuild: (b) => {
            Object.assign(state, {champ: b.champ, level: b.level, items: b.items.slice(), stacked: b.stacked, stacks: b.stacks,
              runes: Engine.normalizeRunePage(DATA, JSON.parse(JSON.stringify(b.runes)))});
            removedNotice = '';
            render();
          }};
}

// One side's damage to the other: basic attack, each spell, and the combo.
function renderDamage(attackerPanel, targetPanel) {
  const a = attackerPanel.getSelection(), b = targetPanel.getSelection();
  const aStats = Engine.championStats(DATA, a), bStats = Engine.championStats(DATA, b);
  const champA = DATA.champions[a.champ], champB = DATA.champions[b.champ];
  const side = {...a, stats: aStats};
  const maxHp = bStats.total.hp;
  const target = {stats: bStats, currentHp: maxHp * Engine.clampPct(b.currentHpPct) / 100};
  const notes = [];
  if (champA.flags.includes('custom_skill_ranks')) notes.push(t('customRanks', {champ: nm(champA.name)}));
  const pctOf = (dmg) => t('ofMaxHp', {pct: fmt(100 * dmg / maxHp)});

  const aa = Engine.autoAttack(aStats, bStats, DATA.rules);
  const rows = [el('tr', {}, el('th', {scope: 'row', text: t('basicAttack')}), el('td'),
    el('td', {text: `${t('nonCrit')} ${fmt(aa.nonCrit, 0)}, ${t('crit')} ${fmt(aa.crit, 0)}, ${t('average')} ${fmt(aa.average, 0)} ${t('type_physical')}`}))];
  for (const spell of champA.spells) {
    const count = Math.max(1, spell.lines.length);
    for (let li = 0; li < count; li++) {
      const r = Engine.spellDamage(DATA, side, target, spell.key, li);
      let text;
      const spellName = `${spell.key} ${nm(spell.name)}`;
      if (!r.learned) text = t('notLearned');
      else if (r.noDamage) text = t('noDamage');
      else if (r.unsupported.length) {
        // Never show a number the engine couldn't fully compute.
        text = t('checkInGame');
        notes.push(li ? t('partNote', {spell: spellName}) : t('excludedNote', {spell: spellName}));
      } else if (li && Math.round(r.damage) === 0) continue; // extra lines that come out at 0 are noise
      else {
        text = `${fmt(r.damage, 0)} ${t('type_' + r.type)}${r.perHit ? ' ' + t('perHit') : ''} (${pctOf(r.damage)})`;
        if (r.perHit && !li) notes.push(t('perHitNote', {spell: spellName}));
      }
      if (!li && count > 1 && r.learned && !r.noDamage) text += ` — ${t('comboLine')}`;
      rows.push(el('tr', {}, el('th', {scope: 'row', text: li ? '' : `${spell.key === 'P' ? t('passive') : spell.key}: ${nm(spell.name)}`}),
        el('td', {text: spell.key === 'P' || !r.learned || li ? '' : `${t('rank')} ${r.rank}`}), el('td', {text})));
    }
  }

  const combo = Engine.runCombo(DATA, side, {champ: b.champ, stats: bStats, currentHpPct: b.currentHpPct}, a.combo);
  const noteText = (n) => n === 'kills' ? t('kills') : n === 'not_learned' ? t('notLearned') : n === 'no_damage' ? t('noDamage')
    : n === 'excluded' ? '*' : n === 'per_hit' ? t('perHit') : sourceName(n.slice(n.indexOf(':') + 1));
  const comboRows = combo.rows.map((r) => el('tr', {},
    el('td', {text: String(r.step)}),
    el('td', {text: r.label.startsWith('A×') ? `${t('autos')} ×${r.label.slice(2)}` : r.label}),
    el('td', {text: fmt(r.damage, 0)}), el('td', {text: fmt(r.hpAfter, 0)}),
    el('td', {text: r.notes.map(noteText).join(', ')})));
  for (const f of combo.flags) {
    const [, kind, id] = f.split(':');
    notes.push(t('unknownDamage', {name: sourceName(`${kind}:${id}`)}));
  }
  const summary = combo.killsAt ? t('killsAt', {n: combo.killsAt})
    : t('leaves', {hp: fmt(combo.hpLeft, 0), pct: fmt(100 * combo.hpLeft / maxHp)});
  const head = (...keys) => el('thead', {}, el('tr', {}, ...keys.map((k) => el('th', {scope: 'col', text: k ? t(k) : ''}))));

  attackerPanel.results.replaceChildren(
    el('h3', {text: t('damageTo', {champ: nm(champB.name)})}),
    el('table', {class: 'damage'}, el('tbody', {}, ...rows)),
    el('h3', {'data-k': 'combo', text: t('combo')}),
    el('table', {class: 'damage'}, head('step', '', 'damage', 'hpLeft', ''), el('tbody', {}, ...comboRows)),
    el('p', {class: 'summary', text: summary}),
    ...[...new Set(notes)].map((n) => el('p', {class: 'notice', text: n})));
}

// "What to buy": suggestions for your panel against the enemy panel, computed on click.
function createAdvisor(section) {
  let result = null, stale = false, snapshot = '';
  // Out of date only when the choices really differ (a language switch re-renders but changes nothing).
  const choices = () => JSON.stringify([panels[0].getSelection(), panels[1].getSelection()]);
  const ui = {
    title: el('h2', {id: 'advisor-title'}), suggest: el('button', {type: 'button'}), sort: el('select', {id: 'advisor-sort'}),
    perGold: el('input', {type: 'checkbox', id: 'advisor-pergold'}), sortLabel: el('label', {for: 'advisor-sort'}),
    perGoldText: el('span'), baseline: el('p'), message: el('p', {class: 'notice'}), table: el('table', {class: 'damage'}),
    tableWrap: el('div', {class: 'table-scroll'}),
    notScoredTitle: el('h3'), notScoredIntro: el('p', {class: 'note'}), notScored: el('ul', {class: 'not-scored'}),
  };
  ui.tableWrap.append(ui.table);
  section.append(ui.title,
    el('div', {class: 'row combo-add'}, ui.suggest, ui.sortLabel, ui.sort, el('label', {class: 'check'}, ui.perGold, ui.perGoldText)),
    ui.baseline, ui.message, ui.tableWrap, ui.notScoredTitle, ui.notScoredIntro, ui.notScored);
  const names = (ids) => ids.map((id) => nm(DATA.items[id].name)).join(' + ');
  // "Kills at step 3." → "kills at step 3" (inside the baseline sentence).
  const inline = (s) => s.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
  const comboText = (hpLeft, killsAt, maxHp) => inline(killsAt ? t('killsAt', {n: killsAt})
    : t('leaves', {hp: fmt(hpLeft, 0), pct: fmt(100 * hpLeft / maxHp)}));

  function render() {
    ui.title.textContent = t('advisor');
    ui.suggest.textContent = t('suggest');
    ui.sortLabel.textContent = t('sortBy');
    ui.perGoldText.textContent = t('perGold');
    const by = ui.sort.value || 'offense';
    fillSelect(ui.sort, [{value: 'offense', label: t('sortOffense')}, {value: 'defense', label: t('sortDefense')}], by);
    ui.message.textContent = '';
    ui.table.replaceChildren();
    ui.baseline.textContent = '';
    ui.notScored.replaceChildren();
    ui.notScoredTitle.textContent = '';
    ui.notScoredIntro.textContent = '';
    ui.suggest.disabled = !enemyShown;
    if (!enemyShown) { ui.message.textContent = t('needEnemy'); return; }
    if (!result) return;
    if (result.error) { ui.message.textContent = t(result.error === 'no_gold' ? 'enterGold' : 'nothingAffordable'); return; }
    if (stale) ui.message.textContent = t('stale');
    const you = panels[0].getSelection(), enemy = panels[1].getSelection();
    const enemyHp = Engine.championStats(DATA, enemy).total.hp, yourHp = Engine.championStats(DATA, you).total.hp;
    const b = result.baseline;
    ui.baseline.textContent = t('baseline', {mine: comboText(b.hpLeft, b.killsAt, enemyHp), theirs: comboText(b.yourHpLeft, b.enemyKillsAt, yourHp)});
    const head = el('thead', {}, el('tr', {}, ...['buy', 'costCol', 'damageGain', 'killStep', 'survivalGain', '', '']
      .map((k) => el('th', {scope: 'col', text: k ? t(k) : ''}))));
    const rows = Engine.rankBuys(result.rows, by, ui.perGold.checked).map((r) => {
      const what = names(r.buys) + (r.consumed.length ? ` (${t('completes', {items: names(r.consumed)})})` : '');
      const apply = el('button', {type: 'button', text: t('apply'), 'aria-label': `${t('apply')}: ${what}`});
      apply.disabled = stale;
      apply.addEventListener('click', () => panels[0].setItems(r.items, Math.max(0, you.gold - r.cost)));
      return el('tr', {}, el('td', {text: what}), el('td', {text: fmt(r.cost, 0)}), el('td', {text: '+' + fmt(r.offense, 0)}),
        el('td', {text: `${b.killsAt ?? '—'} → ${r.killsAt ?? '—'}`}), el('td', {text: '+' + fmt(r.defense, 0)}),
        el('td', {text: r.flags.length ? t('partlyCounted') : ''}), el('td', {}, apply));
    });
    ui.table.replaceChildren(head, el('tbody', {}, ...rows));
    if (result.notScored.length) {
      ui.notScoredTitle.textContent = t('notScored');
      ui.notScoredIntro.textContent = t('notScoredIntro');
      const note = (id) => nm(DATA.items[id].plaintext) || nm((DATA.rules.advisorNotes || {})[id] || {en: ''});
      ui.notScored.replaceChildren(...result.notScored.map((x) => el('li', {text:
        `${nm(DATA.items[x.id].name)} (${fmt(x.cost, 0)} ${t('gold')})${note(x.id) ? ': ' + note(x.id) : ''}`})));
    }
  }
  ui.suggest.addEventListener('click', () => {
    const you = panels[0].getSelection();
    result = Engine.adviseBuys(DATA, you, panels[1].getSelection(), you.gold);
    snapshot = choices();
    stale = false;
    render();
  });
  ui.sort.addEventListener('change', render);
  ui.perGold.addEventListener('change', render);
  render();
  return {markStale: () => {
    if (!result) return;
    const now = choices() !== snapshot;
    if (now !== stale) { stale = now; render(); }
  }, setLang: render};
}
let advisor = null;

// "Rankings" tab: the N champions + builds that reach the most of one stat.
function createRankings(section) {
  let result = null, opts = null;
  const num = (attrs) => el('input', {type: 'number', step: 1, ...attrs});
  const ui = {
    title: el('h2', {id: 'rankings-title'}), stat: el('select', {id: 'rank-stat'}),
    level: num({id: 'rank-level', min: 1, max: 18, value: 18}), count: num({id: 'rank-count', min: 1, max: 50, value: 10}),
    gold: num({id: 'rank-gold', min: 0, placeholder: ''}), stacked: el('input', {type: 'checkbox', id: 'rank-stacked'}),
    stacks: num({id: 'rank-stacks', min: 0, value: 0}), button: el('button', {type: 'button'}),
    labels: {}, stackedText: el('span'), note: el('p', {class: 'note'}), time: el('p', {class: 'note'}),
    table: el('table', {class: 'damage'}), notices: el('div'),
  };
  ui.stacked.checked = true;
  const field = (key, input) => el('div', {}, (ui.labels[key] = el('label', {for: input.id})), input);
  const wrap = el('div', {class: 'table-scroll'}, ui.table);
  section.append(ui.title,
    el('div', {class: 'rank-form'}, field('rankStat', ui.stat), field('rankLevel', ui.level), field('rankCount', ui.count),
      field('rankMaxGold', ui.gold), field('rankStacks', ui.stacks)),
    el('div', {class: 'row combo-add'}, el('label', {class: 'check'}, ui.stacked, ui.stackedText), ui.button),
    ui.note, wrap, ui.time, ui.notices);

  function render() {
    ui.title.textContent = t('rankingsTitle');
    for (const [k, node] of Object.entries(ui.labels)) node.textContent = t(k);
    ui.gold.placeholder = t('rankMaxGoldHint');
    ui.stackedText.textContent = t('stacked');
    ui.button.textContent = t('rankButton');
    fillSelect(ui.stat, Engine.RANKABLE_STATS.map((k) => ({value: k, label: t('stat_' + k)})), ui.stat.value || 'hp');
    ui.table.replaceChildren();
    ui.notices.replaceChildren();
    ui.time.textContent = '';
    ui.note.textContent = result ? t('rankNote') : t('rankEmpty');
    if (!result) return;
    const digits = opts.stat === 'as' ? 3 : 1;
    // The value column names the stat that was ranked (the select may have changed since).
    const head = el('thead', {}, el('tr', {}, ...['rankCol', 'champion', 'stat_' + opts.stat, 'itemsCol', 'runesCol', '']
      .map((k) => el('th', {scope: 'col', text: k ? t(k) : ''}))));
    const notes = new Set();
    const rows = result.rows.map((r) => {
      const champ = DATA.champions[r.champ];
      const open = ['you', 'enemy'].map((who, idx) => {
        const label = t('openAs', {who: t(who)});
        const button = el('button', {type: 'button', text: label, 'aria-label': `${label}: ${nm(champ.name)}`});
        button.addEventListener('click', () => {
          if (who === 'enemy') setEnemyShown(true);
          panels[idx].setBuild({...r, stacked: opts.stacked, stacks: opts.stacks});
          showTab('calculator');
          panels[idx].section.scrollIntoView();
        });
        return button;
      });
      for (const f of r.flags) {
        const [, kind, id] = f.split(':');
        notes.add(kind === 'champion' ? t('unknownChampion', {champ: nm(DATA.champions[id].name)})
          : t('unknownPassive', {item: nm(DATA.items[id].name)}));
      }
      const runes = `${runeName(r.runes.keystone)}; ${r.runes.shards.map(shardLabel).join(', ')}`;
      return el('tr', {}, el('td', {text: String(r.rank)}),
        el('th', {scope: 'row', text: nm(champ.name)}),
        el('td', {class: 'total', text: fmt(r.value, digits) + (r.flags.length ? ' *' : '')}),
        el('td', {text: r.items.filter(Boolean).map((id) => nm(DATA.items[id].name)).join(', ') || t('none')}),
        el('td', {text: runes}), el('td', {class: 'open-buttons'}, ...open));
    });
    ui.table.replaceChildren(head, el('tbody', {}, ...rows));
    ui.time.textContent = t('rankTime', {s: fmt(result.ms / 1000, 1)});
    ui.notices.replaceChildren(...[...notes].map((n) => el('p', {class: 'notice', text: `* ${n}`})));
  }

  ui.button.addEventListener('click', () => {
    opts = {stat: ui.stat.value, level: Engine.clampLevel(ui.level.value),
      count: Math.min(50, Math.max(1, Math.round(Number(ui.count.value)) || 10)),
      maxGold: Number(ui.gold.value) > 0 ? Number(ui.gold.value) : null,
      stacked: ui.stacked.checked, stacks: Math.max(0, Math.round(Number(ui.stacks.value)) || 0)};
    ui.level.value = opts.level;
    ui.count.value = opts.count;
    ui.button.disabled = true;
    // Let the browser paint the disabled button before the search blocks for a moment.
    setTimeout(() => {
      result = Engine.rankStat(DATA, opts);
      ui.button.disabled = false;
      render();
    }, 20);
  });
  render();
  return {setLang: render};
}
let rankings = null;

// Two tabs: the calculator (panels + advisor) and the rankings. The choice is remembered.
function showTab(name) {
  for (const [tab, panel] of [['calculator', 'calculator'], ['rankings', 'rankings']]) {
    const selected = tab === name;
    document.getElementById('tab-' + tab).setAttribute('aria-selected', String(selected));
    document.getElementById('tab-' + tab).tabIndex = selected ? 0 : -1;
    document.getElementById(panel).hidden = !selected;
  }
  try { storage.setItem('tab', name); } catch { /* storage blocked: choice lasts for this visit */ }
}

function renderMatchup() {
  if (advisor) advisor.markStale();
  if (panels.length < 2) return;
  panels[0].results.hidden = !enemyShown;
  if (!enemyShown) return;
  renderDamage(panels[0], panels[1]);
  renderDamage(panels[1], panels[0]);
}

function setEnemyShown(on) {
  enemyShown = on;
  panels[1].section.hidden = !on;
  addEnemyButton.hidden = on;
  container.classList.toggle('solo', !on);
  try { storage.setItem('enemy', on ? '1' : '0'); } catch { /* storage blocked: choice lasts for this visit */ }
  renderMatchup();
  if (advisor) advisor.setLang();
}

function renderPage() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
  document.querySelector('.patch').textContent = `${t('patch')} ${DATA.patch}`;
  document.getElementById('lang').textContent = t('switchLang');
  panels.forEach((p) => p.setLang());
  if (advisor) advisor.setLang();
  if (rankings) rankings.setLang();
  document.getElementById('tab-calculator').textContent = t('tabCalculator');
  document.getElementById('tab-rankings').textContent = t('tabRankings');
  addEnemyButton.textContent = t('addEnemy');
}

document.getElementById('lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'fr' : 'en';
  I18N.saveLang(storage, lang);
  renderPage();
});
const container = document.getElementById('panels');
const addEnemyButton = el('button', {type: 'button', class: 'add-enemy'});
addEnemyButton.addEventListener('click', () => {
  setEnemyShown(true);
  panels[1].section.scrollIntoView();
});
container.after(addEnemyButton);
panels.push(createPanel(container, 'you', renderMatchup));
panels.push(createPanel(container, 'enemy', renderMatchup));
advisor = createAdvisor(document.getElementById('advisor'));
setEnemyShown(enemyShown);
rankings = createRankings(document.getElementById('rankings'));
for (const name of ['calculator', 'rankings']) {
  const tab = document.getElementById('tab-' + name);
  tab.addEventListener('click', () => showTab(name));
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const other = name === 'calculator' ? 'rankings' : 'calculator';
      showTab(other);
      document.getElementById('tab-' + other).focus();
    }
  });
}
showTab((() => { try { return storage.getItem('tab') === 'rankings' ? 'rankings' : 'calculator'; } catch { return 'calculator'; } })());
renderPage();
