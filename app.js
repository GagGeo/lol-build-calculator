// The page: one reusable champion panel (stage 2 adds a second one for the enemy).
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

function createPanel(container, side) {
  const champs = Object.values(DATA.champions);
  const state = {
    champ: champs.slice().sort(byName)[0].id, level: 1, stacks: 0, stacked: false,
    items: [null, null, null, null, null, null],
    runes: Engine.normalizeRunePage(DATA, {}),
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
    labels: {},
  };
  const label = (key, forId) => (ui.labels[key + forId] = el('label', forId ? {for: forId} : {}));
  const stacksWrap = el('div', {}, label('stacks', side + '-stacks'), ui.stacks);

  const left = el('div', {},
    label('champion', side + '-champ'), ui.champ,
    label('level', side + '-level'), el('div', {class: 'row'}, ui.range, ui.number),
    stacksWrap,
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
  container.append(el('section', {class: 'panel', 'aria-labelledby': side + '-title'}, ui.title, left, right));
  ui.title.id = side + '-title';
  ui.slots.forEach((s, i) => s.setAttribute('aria-label', `${t('items')} ${i + 1}`));

  // --- events -------------------------------------------------------------
  ui.champ.addEventListener('change', () => {
    state.champ = ui.champ.value;
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
  ui.slots.forEach((s, i) => s.addEventListener('change', () => {
    state.items[i] = s.value || null;
    removedNotice = '';
    render();
  }));

  // --- render -------------------------------------------------------------
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
    for (const f of s.flags) notes.push(t('unknownPassive', {item: nm(DATA.items[f.split(':')[1]].name)}));
    ui.notices.replaceChildren(...notes.map((n) => el('p', {class: 'notice', text: n})));

    const head = el('tr', {}, ...['stat', 'base', 'bonus', 'total'].map((k) => el('th', {scope: 'col', text: t(k)})));
    const rows = STAT_ORDER.filter((k) => (s.base[k] || 0) || (s.bonus[k] || 0) || (s.total[k] || 0)).map((k) => {
      const digits = k === 'as' ? 3 : 1;
      const baseV = s.base[k] ? fmt(s.base[k], digits) : '';
      const bonusV = s.bonus[k] ? (k === 'as' ? fmt(s.bonus[k]) + '%' : '+' + fmt(s.bonus[k])) : '';
      return el('tr', {}, el('th', {scope: 'row', text: t('stat_' + k)}), el('td', {text: baseV}),
        el('td', {text: bonusV}), el('td', {class: 'total', text: fmt(s.total[k] ?? 0, digits)}));
    });
    ui.stats.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
    ui.note.textContent = t('asNote');
  }

  render();
  return {getSelection: () => ({...state, items: state.items.slice()}), setLang: render};
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
panels.push(createPanel(document.getElementById('panels'), 'you'));
renderPage();
