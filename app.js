// The page: two champion panels (you and the enemy) and each side's damage to the other.
const DATA = window.DATA;
// Some private windows throw on merely reading window.localStorage.
const storage = (() => { try { return window.localStorage; } catch { return undefined; } })();
let lang = I18N.loadLang(storage);
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
    currentHpPct: 100, priority: ['Q', 'W', 'E'], combo: Engine.DEFAULT_COMBO.map((s) => ({...s})),
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
    ui.cost, ui.notices,
    el('h3', {'data-k': 'stats'}), ui.stats, ui.note);
  const comboBox = el('div', {class: 'full'}, el('h3', {'data-k': 'combo'}), ui.comboList,
    el('div', {class: 'row combo-add'}, ui.addStep, ui.addButton, ui.resetButton));
  container.append(el('section', {class: 'panel', 'aria-labelledby': side + '-title'},
    ui.title, left, right, comboBox, ui.results));
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
          setLang: render, results: ui.results};
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
      if (!r.learned) text = t('notLearned');
      else if (r.noDamage) text = t('noDamage');
      else if (li && Math.round(r.damage) === 0) continue; // extra lines that come out at 0 (e.g. crit-only lines) are noise
      else text = `${fmt(r.damage, 0)} ${t('type_' + r.type)}${r.perHit ? ' ' + t('perHit') : ''} (${pctOf(r.damage)})${r.unsupported.length ? ' *' : ''}`;
      if (r.perHit && !li) notes.push(t('perHitNote', {spell: `${spell.key} ${nm(spell.name)}`}));
      if (r.unsupported.length) notes.push(t('excludedNote', {spell: `${spell.key} ${nm(spell.name)}`}));
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

function renderMatchup() {
  if (panels.length < 2) return;
  renderDamage(panels[0], panels[1]);
  renderDamage(panels[1], panels[0]);
}

function renderPage() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
  document.querySelector('.patch').textContent = `${t('patch')} ${DATA.patch}`;
  document.getElementById('lang').textContent = t('switchLang');
  panels.forEach((p) => p.setLang());
}

document.getElementById('lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'fr' : 'en';
  I18N.saveLang(storage, lang);
  renderPage();
});
const container = document.getElementById('panels');
panels.push(createPanel(container, 'you', renderMatchup));
panels.push(createPanel(container, 'enemy', renderMatchup));
renderPage();
