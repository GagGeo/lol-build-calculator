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

// Item and champion pictures from Data Dragon (the same source as the data). Decorative: the name is always next to it.
const IMG = `https://ddragon.leagueoflegends.com/cdn/${DATA.patch}/img/`;
const itemIcon = (id) => `${IMG}item/${id}.png`;
const champIcon = (id) => `${IMG}champion/${id}.png`;
const runeIcon = (path) => `https://ddragon.leagueoflegends.com/cdn/img/${path}`; // rune pictures are not per patch
const SHARD_ICONS = {5008: 'AdaptiveForce', 5005: 'AttackSpeed', 5007: 'CDRScaling', 5010: 'MovementSpeed',
  5001: 'HealthScaling', 5011: 'HealthPlus', 5013: 'Tenacity'};
const summonerIcon = (id) => `${IMG}spell/${DATA.summoners[id].icon}`;
const shardIcon = (id) => runeIcon(`perk-images/StatMods/StatMods${SHARD_ICONS[id]}Icon.png`);
const icon = (src, cls = '') => {
  const img = el('img', {src, alt: '', class: ('icon ' + cls).trim(), loading: 'lazy'});
  img.addEventListener('error', () => { img.hidden = true; });
  return img;
};

const fmt = (n, digits = 1) => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {maximumFractionDigits: digits});
};

// The stats table (stat, base, bonus, total) with a Show/Hide details button: details split the bonus into
// one column per item, the runes and the champion (see Engine.statBreakdown). Hidden by default.
function createStatsView() {
  let detailed = false, last = null;
  const toggle = el('button', {type: 'button', class: 'details-toggle'});
  const table = el('table'), note = el('p', {class: 'note'});
  const node = el('div', {}, toggle, el('div', {class: 'table-scroll'}, table), note);
  toggle.addEventListener('click', () => { detailed = !detailed; render(last); });

  function render(sel) {
    last = sel;
    toggle.textContent = t(detailed ? 'hideDetails' : 'showDetails');
    toggle.setAttribute('aria-expanded', String(detailed));
    const breakdown = detailed ? Engine.statBreakdown(DATA, sel) : null;
    const s = breakdown ? breakdown.stats : Engine.championStats(DATA, sel);
    const cols = breakdown ? breakdown.columns : [];
    const head = el('tr', {}, ...[t('stat'), t('base'), t('bonus'), t('total')].map((text) => el('th', {scope: 'col', text})));
    // Details: under each stat, one chip per source that gives it (item picture, or Runes / Champion), so the table
    // keeps its four columns however many items there are.
    const chip = (c, v) => {
      if (c.kind !== 'item') return el('span', {class: 'part'}, el('span', {class: 'part-name', text: t(c.kind === 'champion' ? 'champion' : c.kind)}), v);
      const name = nm(DATA.items[c.id].name);
      return el('span', {class: 'part', title: name}, icon(itemIcon(c.id)), el('span', {class: 'sr-only', text: name + ' '}), v);
    };
    // Mana only means something for mana users; energy users get it relabelled; other resources are hidden.
    const resource = DATA.champions[sel.champ].resource;
    const shown = (k) => k !== 'mp' || resource === 'Mana' || resource === 'Energy';
    const signed = (k, v) => (!v || Math.abs(v) < 1e-9 ? '' : k === 'as' ? fmt(v) + '%' : (v > 0 ? '+' : '') + fmt(v, k === 'as' ? 3 : 1));
    const keys = STAT_ORDER.filter((k) => shown(k) && ((s.base[k] || 0) || (s.bonus[k] || 0) || (s.total[k] || 0)));
    const rows = keys.flatMap((k) => {
      const digits = k === 'as' ? 3 : 1;
      const statName = k === 'mp' && resource === 'Energy' ? t('stat_energy') : t('stat_' + k);
      const row = el('tr', {}, el('th', {scope: 'row', text: statName}), el('td', {text: s.base[k] ? fmt(s.base[k], digits) : ''}),
        el('td', {text: signed(k, s.bonus[k])}), el('td', {class: 'total', text: fmt(s.total[k] ?? 0, digits)}));
      const parts = cols.filter((c) => signed(k, c.values[k])).map((c) => chip(c, signed(k, c.values[k])));
      if (!parts.length) return [row];
      row.className = 'has-parts';
      return [row, el('tr', {class: 'parts'}, el('td', {colspan: '4'}, ...parts))];
    });
    table.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
    const odd = breakdown ? breakdown.notAdditive.filter((k) => keys.includes(k)) : [];
    note.textContent = !breakdown ? '' : odd.length
      ? t('detailsNotAdditive', {stats: odd.map((k) => t('stat_' + k)).join(', ')}) : t('detailsNote');
  }
  return {node, render};
}

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
  const firstChamp = champs.slice().sort(byName)[side === 'you' ? 0 : 1].id;
  const state = {
    champ: firstChamp, level: 1, stacks: 0, stacked: false, buffs: {},
    items: [null, null, null, null, null, null],
    runes: Engine.normalizeRunePage(DATA, {}),
    currentHpPct: 100, priority: Engine.skillOrder(DATA, firstChamp).order, combo: Engine.defaultCombo(DATA, firstChamp), gold: 0,
  };
  // A new champion gets its own default combo, unless the combo was edited.
  const switchChamp = (champ) => {
    if (JSON.stringify(state.combo) === JSON.stringify(Engine.defaultCombo(DATA, state.champ))) {
      state.combo = Engine.defaultCombo(DATA, champ);
    }
    state.champ = champ;
    state.priority = Engine.skillOrder(DATA, champ).order; // each champion starts on its usual skill order
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
    cost: el('div', {class: 'cost'}), notices: el('div'), statsView: createStatsView(), note: el('p', {class: 'note'}),
    hp: el('input', {type: 'number', min: 1, max: 100, step: 1, id: side + '-hp'}),
    gold: el('input', {type: 'number', min: 0, step: 1, id: side + '-gold'}),
    priority: el('select', {id: side + '-priority'}), priorityNote: el('p', {class: 'note'}),
    comboList: el('ol', {class: 'combo-list'}), addStep: el('select', {id: side + '-addstep'}),
    addButton: el('button', {type: 'button'}), resetButton: el('button', {type: 'button'}),
    results: el('div', {class: 'results full'}),
    labels: {},
  };
  const label = (key, forId) => (ui.labels[key + forId] = el('label', forId ? {for: forId} : {}));
  const stacksWrap = el('div', {}, label('stacks', side + '-stacks'), ui.stacks);

  // Temporary buffs (rules.buffs): state.buffs maps a buff id to 1, its drake stacks or the Baron minute.
  const buffDefs = DATA.rules.buffs || [];
  const elixirs = buffDefs.filter((b) => b.group === 'elixir'), drakes = buffDefs.filter((b) => b.group === 'drake');
  const baron = buffDefs.find((b) => b.byMinute);
  const buffUi = {
    summary: el('summary'), elixir: el('select', {id: side + '-elixir'}), baron: el('select', {id: side + '-baron'}),
    checks: buffDefs.filter((b) => !b.group && !b.byMinute).map((b) => ({b, input: el('input', {type: 'checkbox'}), text: el('span')})),
    drakes: drakes.map((b) => ({b, input: el('input', {type: 'number', min: 0, max: b.max, step: 1, id: `${side}-buff-${b.id}`})})),
    drakesTitle: el('p', {class: 'guide-label'}), note: el('p', {class: 'note'}),
  };
  const buffBox = el('details', {class: 'setup'}, buffUi.summary,
    label('buffElixir', side + '-elixir'), buffUi.elixir,
    ...(baron ? [label('buffBaron', side + '-baron'), buffUi.baron] : []),
    ...buffUi.checks.map((c) => el('label', {class: 'check'}, c.input, c.text)),
    buffUi.drakesTitle,
    el('div', {class: 'drakes'}, ...buffUi.drakes.map((d) => el('div', {}, label('buff_' + d.b.id, d.input.id), d.input))),
    buffUi.note);
  buffUi.elixir.addEventListener('change', () => {
    elixirs.forEach((b) => delete state.buffs[b.id]);
    if (buffUi.elixir.value) state.buffs[buffUi.elixir.value] = 1;
    render();
  });
  buffUi.baron.addEventListener('change', () => { state.buffs[baron.id] = Number(buffUi.baron.value) || 0; render(); });
  buffUi.checks.forEach((c) => c.input.addEventListener('change', () => { state.buffs[c.b.id] = c.input.checked ? 1 : 0; render(); }));
  buffUi.drakes.forEach((d) => d.input.addEventListener('change', () => {
    const others = drakes.reduce((n, b) => n + (b.id === d.b.id ? 0 : state.buffs[b.id] || 0), 0);
    state.buffs[d.b.id] = Math.max(0, Math.min(d.b.max, 4 - others, Math.round(Number(d.input.value)) || 0));
    render();
  }));
  function renderBuffs() {
    const on = Object.values(state.buffs).filter((n) => n > 0).length;
    buffUi.summary.textContent = on ? t('buffsActive', {n: on}) : t('buffs');
    ui.labels['buffElixir' + side + '-elixir'].textContent = t('buffElixir');
    fillSelect(buffUi.elixir, elixirs.map((b) => ({value: b.id, label: t('buff_' + b.id)})),
      (elixirs.find((b) => state.buffs[b.id]) || {}).id, t('none'));
    if (baron) {
      ui.labels['buffBaron' + side + '-baron'].textContent = t('buffBaron');
      const minutes = [];
      for (let m = baron.byMinute[0]; m <= baron.byMinute[1]; m += 5) minutes.push(m);
      fillSelect(buffUi.baron, minutes.map((n) => ({value: n, label: t('buffBaronAt', {n})})), state.buffs[baron.id] || null, t('none'));
    }
    buffUi.checks.forEach((c) => { c.input.checked = !!state.buffs[c.b.id]; c.text.textContent = t('buff_' + c.b.id); });
    buffUi.drakesTitle.textContent = t('buffDrakes');
    buffUi.drakes.forEach((d) => { ui.labels['buff_' + d.b.id + d.input.id].textContent = t('buff_' + d.b.id); d.input.value = state.buffs[d.b.id] || 0; });
    buffUi.note.textContent = t('buffsNote');
  }

  // Layout: who (portrait, champion, level), then what you have (items, stats), then the setup you open when needed.
  ui.portrait = el('img', {class: 'portrait', alt: ''});
  ui.champTitle = el('p', {class: 'champ-title'});
  ui.champ.classList.add('champ-select');
  const identity = el('div', {class: 'identity full'}, ui.portrait, el('div', {},
    label('champion', side + '-champ'), ui.champ, ui.champTitle,
    label('level', side + '-level'), el('div', {class: 'row'}, ui.range, ui.number)));
  ui.slotBoxes = ui.slots.map((s) => {
    const img = el('img', {alt: ''}), empty = el('span', {class: 'empty-icon'});
    img.addEventListener('error', () => { img.hidden = true; empty.hidden = false; });
    return {box: el('div', {class: 'slot'}, img, empty, s), img, empty};
  });
  ui.runesValue = el('span', {class: 'summary-value'});
  ui.optionsValue = el('span', {class: 'summary-value'});
  const runesBox = el('details', {class: 'setup'}, el('summary', {}, el('span', {'data-k': 'runes'}), ui.runesValue),
    el('div', {class: 'runes-grid'},
      el('div', {}, label('primary', side + '-primary'), ui.primary, label('keystone', side + '-keystone'), ui.keystone,
        ...ui.primaryRunes.flatMap((s) => [el('label', {}, ''), s])),
      el('div', {}, label('secondary', side + '-secondary'), ui.secondary,
        ...ui.secondaryRunes.flatMap((s) => [el('label', {}, ''), s]),
        label('shards', ''), ...ui.shards)),
    el('label', {class: 'check'}, ui.stacked, el('span', {'data-k': 'stacked'})),
    ...(typeof GUIDE === 'object' ? [el('div', {class: 'row combo-add'}, ui.usualRunes = el('button', {type: 'button'}))] : []));
  if (ui.usualRunes) ui.usualRunes.addEventListener('click', () => { state.runes = usualRunes(state.champ).page; render(); });
  const optionsBox = el('details', {class: 'setup'}, el('summary', {}, el('span', {'data-k': 'setupOptions'}), ui.optionsValue),
    label('skillOrder', side + '-priority'), ui.priority, ui.priorityNote,
    label('currentHp', side + '-hp'), ui.hp, stacksWrap);
  const left = el('div', {},
    el('h3', {'data-k': 'items'}), el('div', {class: 'inventory'}, ...ui.slotBoxes.map((x) => x.box)),
    ui.cost, ...(side === 'you' ? [label('gold', side + '-gold'), ui.gold] : []), ui.notices,
    el('h3', {'data-k': 'stats'}), ui.statsView.node, ui.note);
  const right = el('div', {}, el('h3', {'data-k': 'setup'}), runesBox, optionsBox, buffBox);
  const comboBox = el('div', {class: 'full'}, el('h3', {'data-k': 'combo'}), ui.comboList,
    el('div', {class: 'row combo-add'}, ui.addStep, ui.addButton, ui.resetButton));
  const removeButton = el('button', {type: 'button', class: 'remove-enemy'});
  removeButton.addEventListener('click', () => setEnemyShown(false));
  const head = side === 'enemy' ? el('div', {class: 'panel-head full'}, ui.title, removeButton) : ui.title;
  const section = el('section', {class: 'panel', 'aria-labelledby': side + '-title'}, head, identity, left, right, comboBox, ui.results);
  container.append(section);
  ui.title.id = side + '-title';
  ui.slots.forEach((s, i) => s.setAttribute('aria-label', `${t('items')} ${i + 1}`));

  // --- events -------------------------------------------------------------
  const chooseChamp = (champ) => {
    switchChamp(champ);
    state.stacks = 0; // stacks belong to one champion's passive
    const pruned = Engine.pruneBuild(DATA, state.champ, state.items);
    state.items = pruned.items;
    removedNotice = pruned.removed.length
      ? t('removed', {champ: nm(DATA.champions[state.champ].name), items: pruned.removed.map((id) => nm(DATA.items[id].name)).join(', ')})
      : '';
    render();
  };
  ui.champ.addEventListener('change', () => chooseChamp(ui.champ.value));
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
  ui.resetButton.addEventListener('click', () => { state.combo = Engine.defaultCombo(DATA, state.champ); render(); });
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
    const usual = Engine.skillOrder(DATA, state.champ);
    ui.priorityNote.textContent = usual.order.join('') !== state.priority.join('') ? t('skillOrderChanged', {order: usual.order.join(' > ')})
      : usual.estimated ? t('skillOrderEstimated') : '';

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
    renderBuffs();

    ui.slots.forEach((s, i) => {
      fillSelect(s, itemOptions(i), state.items[i], t('empty'));
      const x = ui.slotBoxes[i], id = state.items[i];
      x.box.classList.toggle('filled', !!id);
      x.img.hidden = !id; x.empty.hidden = !!id;
      if (id) x.img.src = itemIcon(id);
    });
    ui.portrait.src = champIcon(state.champ);
    ui.champTitle.textContent = nm(DATA.champions[state.champ].title);
    const ks = state.runes.keystone && DATA.runes.byId[state.runes.keystone];
    ui.runesValue.replaceChildren(...(ks ? [icon(runeIcon(ks.icon), 'rune'), nm(ks.name)] : []));
    if (ui.usualRunes) ui.usualRunes.textContent = t('runesUsual', {tag: t('tag_' + usualRunes(state.champ).tag)});
    ui.optionsValue.textContent = state.priority.join(' > ');

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

    ui.statsView.render({...state});
    ui.note.textContent = t('asNote');
    renderCombo();
    if (onChange) onChange();
  }

  render();
  return {getSelection: () => ({...state, items: state.items.slice(), buffs: {...state.buffs}, combo: state.combo.map((s) => ({...s}))}),
          setLang: render, results: ui.results, section, setChamp: chooseChamp,
          // A shared link's setup: every value is checked, since the link may come from anyone.
          share: () => ({c: state.champ, l: state.level, i: state.items, r: state.runes, s: state.stacked, k: state.stacks,
            b: state.buffs, p: state.priority.join(''), h: state.currentHpPct, g: state.gold}),
          loadShare: (o) => {
            if (!o || typeof o !== 'object' || typeof o.c !== 'string' || !Object.hasOwn(DATA.champions, o.c)) return false;
            switchChamp(o.c);
            state.level = Engine.clampLevel(o.l);
            const items = (Array.isArray(o.i) ? o.i : []).slice(0, 6).map((x) => (typeof x === 'string' && Object.hasOwn(DATA.items, x) ? x : null));
            while (items.length < 6) items.push(null);
            state.items = Engine.pruneBuild(DATA, state.champ, items).items;
            state.runes = Engine.normalizeRunePage(DATA, o.r && typeof o.r === 'object' ? o.r : {});
            state.stacked = o.s === true;
            state.stacks = Math.max(0, Math.min(10000, Math.round(Number(o.k)) || 0));
            state.buffs = {};
            for (const b of DATA.rules.buffs || []) {
              const n = Math.round(Number((o.b && typeof o.b === 'object' ? o.b : {})[b.id]) || 0);
              if (n > 0) state.buffs[b.id] = Math.min(n, b.byMinute ? b.byMinute[1] : b.max || 1);
            }
            if (PRIORITIES.includes(o.p)) state.priority = o.p.split('');
            state.currentHpPct = Engine.clampPct(o.h);
            state.gold = Math.max(0, Math.min(1e6, Math.round(Number(o.g)) || 0));
            removedNotice = '';
            render();
            return true;
          },
          setRunes: (page) => { state.runes = Engine.normalizeRunePage(DATA, JSON.parse(JSON.stringify(page))); render(); },
          setItems: (items, gold) => { state.items = items.slice(); if (gold !== undefined) state.gold = gold; removedNotice = ''; render(); },
          // Load a whole build (from the rankings); rows are already legal for their champion.
          setBuild: (b) => {
            switchChamp(b.champ);
            Object.assign(state, {level: b.level, items: b.items.slice(), stacked: b.stacked, stacks: b.stacks,
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
      if (!li && r.learned) { // the spell's own heal, at your current health, from this damage
        const h = Engine.spellHeal(DATA, side, spell.key,
          {damage: r.unsupported.length ? 0 : r.damage, selfHp: aStats.total.hp * Engine.clampPct(a.currentHpPct) / 100});
        if (h.unsupported.length || (h.fromDamage && r.unsupported.length)) text += ` · ${t('healCheck')}`;
        else if (h.heal > 0) text += ` · ${t('healsFor', {hp: fmt(h.heal, 0)})}${h.perSecond ? ' ' + t('perSecond') : ''}`;
      }
      rows.push(el('tr', {}, el('th', {scope: 'row', text: li ? '' : `${spell.key === 'P' ? t('passive') : spell.key}: ${nm(spell.name)}`}),
        el('td', {text: spell.key === 'P' || !r.learned || li ? '' : `${t('rank')} ${r.rank}`}), el('td', {text})));
    }
  }

  const combo = Engine.runCombo(DATA, side, {champ: b.champ, stats: bStats, currentHpPct: b.currentHpPct, items: b.items}, a.combo);
  const noteText = (n) => n === 'kills' ? t('kills') : n === 'not_learned' ? t('notLearned') : n === 'no_damage' ? t('noDamage')
    : n === 'excluded' ? '*' : n === 'per_hit' ? t('perHit') : n === 'heal_excluded' ? t('healCheck')
    : n === 'heal_per_second' ? t('healOneSecond') : n === 'heal_minimum' ? t('healMinimum')
    : sourceName(n.slice(n.indexOf(':') + 1));
  const comboRows = combo.rows.map((r) => el('tr', {},
    el('td', {text: String(r.step)}),
    el('td', {text: r.label.startsWith('A×') ? `${t('autos')} ×${r.label.slice(2)}` : r.label}),
    el('td', {text: fmt(r.damage, 0)}), el('td', {text: fmt(r.hpAfter, 0)}),
    ...(combo.healed > 0 ? [el('td', {text: r.healed > 0 ? '+' + fmt(r.healed, 0) : ''})] : []),
    el('td', {text: r.notes.map(noteText).join(', ')})));
  for (const f of combo.flags) {
    const [, kind, id] = f.split(':');
    notes.push(t('unknownDamage', {name: sourceName(`${kind}:${id}`)}));
  }
  const summary = combo.killsAt ? t('killsAt', {n: combo.killsAt})
    : t('leaves', {hp: fmt(combo.hpLeft, 0), pct: fmt(100 * combo.hpLeft / maxHp)});
  const heal = {hp: fmt(combo.healed, 0), used: fmt(combo.healedUsed, 0)};
  if (combo.grievous > 0) notes.push(t('grievous', {champ: nm(champB.name), pct: fmt(100 * combo.grievous, 0)}));
  const healText = !(combo.healed > 0) ? null : combo.healedUsed >= combo.healed - 0.5 ? t('heals', heal)
    : combo.healedUsed < 0.5 ? t('healsFull', heal) : t('healsCapped', heal);
  const head = (...keys) => el('thead', {}, el('tr', {}, ...keys.map((k) => el('th', {scope: 'col', text: k ? t(k) : ''}))));

  attackerPanel.results.replaceChildren(
    el('h3', {text: t('damageTo', {champ: nm(champB.name)})}),
    el('table', {class: 'damage'}, el('tbody', {}, ...rows)),
    el('h3', {'data-k': 'combo', text: t('combo')}),
    el('table', {class: 'damage'}, head('step', '', 'damage', 'hpLeft', ...(combo.healed > 0 ? ['healed'] : []), ''),
      el('tbody', {}, ...comboRows)),
    el('p', {class: 'summary', text: summary}),
    ...(healText ? [el('p', {class: 'summary', text: healText})] : []),
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
    const isStat = !['offense', 'defense'].includes(by);
    fillSelect(ui.sort, [{group: t('sortCombat'), options: [{value: 'offense', label: t('sortOffense')},
      {value: 'defense', label: t('sortDefense')}]},
    {group: t('sortStats'), options: Engine.RANKABLE_STATS.map((k) => ({value: k, label: t('stat_' + k)}))}], by);
    ui.message.textContent = '';
    ui.table.replaceChildren();
    ui.baseline.textContent = '';
    ui.notScored.replaceChildren();
    ui.notScoredTitle.textContent = '';
    ui.notScoredIntro.textContent = '';
    ui.suggest.disabled = !enemyShown && !isStat;
    if (!enemyShown && !isStat) { ui.message.textContent = t('needEnemy'); return; }
    if (!result) return;
    if (result.error) {
      ui.message.textContent = t(result.error === 'no_enemy' ? 'needEnemy' : 'nothingAffordable');
      return;
    }
    if (stale) ui.message.textContent = t('stale');
    const you = panels[0].getSelection(), enemy = panels[1].getSelection();
    const b = result.baseline;
    const combat = enemyShown && !isStat;
    if (combat) {
      const enemyHp = Engine.championStats(DATA, enemy).total.hp, yourHp = Engine.championStats(DATA, you).total.hp;
      ui.baseline.textContent = t('baseline', {mine: comboText(b.hpLeft, b.killsAt, enemyHp), theirs: comboText(b.yourHpLeft, b.enemyKillsAt, yourHp)});
    } else {
      ui.baseline.textContent = t('statBaseline', {stat: t('stat_' + by), value: fmt(b.total[by], by === 'as' ? 3 : 1)});
    }
    const cols = combat ? ['buy', 'costCol', 'damageGain', 'killStep', 'survivalGain', '', ''] : ['buy', 'costCol', 'stat_' + by, '', ''];
    const head = el('thead', {}, el('tr', {}, ...cols.map((k) => el('th', {scope: 'col', text: k ? t(k) : ''}))));
    if (result.unlimited) ui.baseline.textContent += ' ' + t('unlimitedNote');
    const rows = Engine.rankBuys(result.rows, by, ui.perGold.checked, 20, result.unlimited).map((r) => {
      const what = names(r.buys) + (r.consumed.length ? ` (${t('completes', {items: names(r.consumed)})})` : '');
      const apply = el('button', {type: 'button', text: t('apply'), 'aria-label': `${t('apply')}: ${what}`});
      apply.disabled = stale;
      apply.addEventListener('click', () => panels[0].setItems(r.items, Math.max(0, you.gold - r.cost)));
      const middle = combat
        ? [el('td', {text: '+' + fmt(r.offense, 0)}), el('td', {text: `${b.killsAt ?? '—'} → ${r.killsAt ?? '—'}`}),
          el('td', {text: '+' + fmt(r.defense, 0)})]
        : [el('td', {text: '+' + fmt(r.gains[by], by === 'as' ? 3 : 1)})];
      return el('tr', {}, el('td', {text: what}), el('td', {text: fmt(r.cost, 0)}), ...middle,
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
  // The search depends on the sort (three-item buys are searched for it), so changing it searches again.
  const suggest = () => {
    const you = panels[0].getSelection();
    result = Engine.adviseBuys(DATA, you, enemyShown ? panels[1].getSelection() : null, you.gold, {by: ui.sort.value});
    snapshot = choices();
    stale = false;
    render();
  };
  ui.suggest.addEventListener('click', suggest);
  ui.sort.addEventListener('change', () => (result ? suggest() : render()));
  ui.perGold.addEventListener('change', render);
  render();
  return {suggestBy: (stat) => {
    ui.sort.value = stat;
    suggest();
    section.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, markStale: () => {
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

// "Champ Optimization" tab: one champion's best builds for one stat. Items of the build shown can be
// unticked (the stats are recomputed without them) or opened in the Items tab.
function createOptimizer(section) {
  let result = null, opts = null, shownRow = 0, excluded = new Set();
  const num = (attrs) => el('input', {type: 'number', step: 1, ...attrs});
  const ui = {
    title: el('h2', {id: 'optimize-title'}), champ: el('select', {id: 'opt-champ'}), stat: el('select', {id: 'opt-stat'}),
    level: num({id: 'opt-level', min: 1, max: 18, value: 18}), gold: num({id: 'opt-gold', min: 0}),
    stacks: num({id: 'opt-stacks', min: 0, value: 0}), stacked: el('input', {type: 'checkbox', id: 'opt-stacked'}),
    stackedText: el('span'), button: el('button', {type: 'button'}), labels: {}, note: el('p', {class: 'note'}),
    summary: el('p', {class: 'summary'}), reset: el('button', {type: 'button'}), items: el('ul', {class: 'opt-items'}),
    itemsNote: el('p', {class: 'note'}), altsNote: el('p', {class: 'note'}),
    runes: el('p'), statsView: createStatsView(), altTitle: el('h3'), alts: el('table', {class: 'damage'}),
    notices: el('div'), time: el('p', {class: 'note'}), open: el('div', {class: 'open-buttons'}),
  };
  ui.stacked.checked = true;
  const field = (key, input) => el('div', {}, (ui.labels[key] = el('label', {for: input.id})), input);
  const stacksField = field('rankStacks', ui.stacks);
  const resultBox = el('div', {}, el('div', {class: 'row'}, ui.summary, ui.reset), ui.itemsNote, ui.items, ui.runes, ui.open,
    ui.statsView.node, ui.notices, ui.altTitle, ui.altsNote, el('div', {class: 'table-scroll'}, ui.alts), ui.time);
  section.append(ui.title,
    el('div', {class: 'rank-form'}, field('champion', ui.champ), field('rankLevel', ui.level), field('rankStat', ui.stat),
      field('rankMaxGold', ui.gold), stacksField),
    el('div', {class: 'row combo-add'}, el('label', {class: 'check'}, ui.stacked, ui.stackedText), ui.button),
    ui.note, resultBox);
  const names = (items) => items.filter(Boolean).map((id) => nm(DATA.items[id].name)).join(', ') || t('none');
  const digits = (stat) => (stat === 'as' ? 3 : 1);
  const showRow = (i) => { shownRow = i; excluded = new Set(); };

  function render() {
    ui.title.textContent = t('optimizeTitle');
    for (const [k, node] of Object.entries(ui.labels)) node.textContent = t(k);
    ui.gold.placeholder = t('rankMaxGoldHint');
    ui.stackedText.textContent = t('stacked');
    ui.button.textContent = t('optButton');
    ui.reset.textContent = t('optReset');
    const champs = Object.values(DATA.champions).slice().sort(byName);
    fillSelect(ui.champ, champs.map((c) => ({value: c.id, label: nm(c.name)})), ui.champ.value || champs[0].id);
    fillSelect(ui.stat, Engine.RANKABLE_STATS.map((k) => ({value: k, label: t('stat_' + k)})), ui.stat.value || 'hp');
    stacksField.hidden = !DATA.rules.stackers[ui.champ.value];
    ui.note.textContent = result ? '' : t('optEmpty');
    resultBox.hidden = !result || !result.rows.length;
    if (!result) return;
    const champ = DATA.champions[opts.champ];
    if (!result.rows.length) { ui.note.textContent = t('optNothing'); return; }
    if (['mp', 'mpregen'].includes(opts.stat) && champ.resource !== 'Mana') ui.note.textContent = t('optNoMana', {champ: nm(champ.name)});
    const r = result.rows[shownRow];
    // The build as shown: unticked items are left out of the stats, the cost and "Open as".
    const items = r.items.map((id, slot) => (excluded.has(slot) ? null : id));
    const sel = {champ: opts.champ, level: opts.level, items, runes: r.runes, stacked: opts.stacked, stacks: opts.stacks};
    const stats = Engine.championStats(DATA, sel);
    const value = stats.total[opts.stat] || 0, cost = Engine.buildCost(DATA, items);
    const vars = {champ: nm(champ.name), level: opts.level, value: fmt(value, digits(opts.stat)), stat: t('stat_' + opts.stat),
      cost: fmt(cost, 0)};
    ui.summary.textContent = t(excluded.size ? 'optModified' : 'optBest', vars);
    ui.reset.hidden = !excluded.size;
    ui.items.replaceChildren(...r.items.map((id, slot) => {
      if (!id) return null;
      const box = el('input', {type: 'checkbox', id: `opt-item-${slot}`});
      box.checked = !excluded.has(slot);
      box.addEventListener('change', () => { if (box.checked) excluded.delete(slot); else excluded.add(slot); render(); });
      const details = el('button', {type: 'button', class: 'link', text: t('itemDetails'),
        'aria-label': `${t('itemDetails')}: ${nm(DATA.items[id].name)}`});
      details.addEventListener('click', () => itemsTab && itemsTab.open(id));
      return el('li', {}, el('label', {class: 'check', for: box.id}, box, el('span', {text: nm(DATA.items[id].name)})), details);
    }).filter(Boolean));
    ui.runes.textContent = `${t('runesCol')}: ${runeName(r.runes.keystone)}; ${r.runes.shards.map(shardLabel).join(', ')}.`;
    ui.open.replaceChildren(...['you', 'enemy'].map((who, idx) => {
      const button = el('button', {type: 'button', text: t('openAs', {who: t(who)})});
      button.addEventListener('click', () => {
        if (who === 'enemy') setEnemyShown(true);
        panels[idx].setBuild({...r, items, stacked: opts.stacked, stacks: opts.stacks});
        showTab('calculator');
        panels[idx].section.scrollIntoView();
      });
      return button;
    }));
    ui.statsView.render(sel);
    ui.notices.replaceChildren(...stats.flags.map((f) => {
      const [kind, id] = f.split(':');
      return el('p', {class: 'notice', text: kind === 'unknown_champion' ? t('unknownChampion', {champ: nm(DATA.champions[id].name)})
        : t('unknownPassive', {item: nm(DATA.items[id].name)})});
    }));
    ui.itemsNote.textContent = t('optItemsNote');
    ui.altTitle.textContent = result.rows.length > 1 ? t('optBuilds') : '';
    ui.altsNote.textContent = result.rows.length > 1 ? t('optBuildsNote') : '';
    ui.alts.replaceChildren();
    if (result.rows.length > 1) {
      const head = el('thead', {}, el('tr', {}, ...['rankCol', 'stat_' + opts.stat, 'costCol', 'itemsCol', '']
        .map((k) => el('th', {scope: 'col', text: k ? t(k) : ''}))));
      ui.alts.replaceChildren(head, el('tbody', {}, ...result.rows.map((row, i) => {
        // Loads this build at the top (all items ticked) and scrolls there.
        const current = i === shownRow && !excluded.size;
        const show = el('button', {type: 'button', text: t(current ? 'optShown' : 'optShow')});
        show.disabled = current;
        show.addEventListener('click', () => { showRow(i); render(); ui.summary.scrollIntoView({behavior: 'smooth', block: 'start'}); });
        return el('tr', {}, el('td', {text: String(i + 1)}), el('td', {class: 'total', text: fmt(row.value, digits(opts.stat))}),
          el('td', {text: fmt(row.cost, 0)}), el('td', {text: names(row.items)}), el('td', {}, show));
      })));
    }
    ui.time.textContent = t('rankTime', {s: fmt(result.ms / 1000, 1)});
  }

  ui.reset.addEventListener('click', () => { excluded = new Set(); render(); });
  ui.champ.addEventListener('change', () => { stacksField.hidden = !DATA.rules.stackers[ui.champ.value]; });
  ui.button.addEventListener('click', () => {
    opts = {champ: ui.champ.value, stat: ui.stat.value, level: Engine.clampLevel(ui.level.value),
      maxGold: Number(ui.gold.value) > 0 ? Number(ui.gold.value) : null, stacked: ui.stacked.checked,
      stacks: DATA.rules.stackers[ui.champ.value] ? Math.max(0, Math.round(Number(ui.stacks.value)) || 0) : 0, count: 5};
    ui.level.value = opts.level;
    ui.button.disabled = true;
    setTimeout(() => { // let the disabled button paint before the search blocks for a moment
      result = Engine.optimizeChampion(DATA, opts);
      showRow(0);
      ui.button.disabled = false;
      render();
    }, 20);
  });
  render();
  return {setLang: render};
}
let optimizer = null;

// "Items" tab: every item, filtered and sorted, and one item's card (stats, gold efficiency, build path,
// limits, what the calculator counts, description).
const itemKind = (i) => (i.boots ? 'boots' : i.tier === 1 ? 'starter' : i.tier === 5 ? 'legendary' : 'components');
function createItemsTab(section) {
  let selected = null;
  const ui = {
    title: el('h2', {id: 'items-title'}), search: el('input', {type: 'search', id: 'items-search'}),
    kind: el('select', {id: 'items-kind'}), stat: el('select', {id: 'items-stat'}), sort: el('select', {id: 'items-sort'}),
    labels: {}, card: el('article', {class: 'item-card', tabindex: -1}), count: el('p', {class: 'note'}),
    table: el('table', {class: 'damage'}), note: el('p', {class: 'note'}),
  };
  const field = (key, input) => el('div', {}, (ui.labels[key] = el('label', {for: input.id})), input);
  section.append(ui.title, ui.card,
    el('div', {class: 'rank-form'}, field('itemsSearch', ui.search), field('itemsKind', ui.kind), field('itemsStat', ui.stat),
      field('itemsSort', ui.sort)),
    ui.count, el('div', {class: 'table-scroll'}, ui.table), ui.note);
  const statText = (k, v) => `+${fmt(v)}${k === 'as' ? '%' : ''} ${t('stat_' + k)}`;
  const link = (id) => {
    const b = el('button', {type: 'button', class: 'link', text: nm(DATA.items[id].name)});
    b.prepend(icon(itemIcon(id)));
    b.addEventListener('click', () => open(id));
    return b;
  };
  const links = (ids) => ids.flatMap((id, i) => (i ? [', ', link(id)] : [link(id)]));
  const effText = (id) => { const e = Engine.goldEfficiency(DATA, id); return e.efficiency === null ? '' : fmt(100 * e.efficiency, 0) + '%'; };
  const description = (html) => html.replace(/<stats>.*?<\/stats>/s, '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();

  function renderCard() {
    ui.card.hidden = !selected;
    if (!selected) return;
    const item = DATA.items[selected], rules = DATA.rules;
    const p = (text) => el('p', {text});
    const parts = [el('div', {class: 'card-head'}, icon(itemIcon(selected)), el('h3', {text: nm(item.name)}))];
    if (nm(item.plaintext)) parts.push(el('p', {class: 'note', text: nm(item.plaintext)}));
    const combine = item.from && item.from.length ? item.gold.base : null;
    parts.push(p(combine !== null ? t('itemCostCombine', {cost: fmt(item.gold.total, 0), combine: fmt(combine, 0)})
      : t('itemCost', {cost: fmt(item.gold.total, 0)})));
    const stats = Object.entries(item.stats);
    if (stats.length) parts.push(el('ul', {}, ...stats.map(([k, v]) => el('li', {text: statText(k, v)}))));
    const e = Engine.goldEfficiency(DATA, selected);
    if (e.efficiency !== null && stats.length) {
      parts.push(p(t('itemGold', {value: fmt(e.value, 0), pct: fmt(100 * e.efficiency, 0)})
        + (e.unpriced.length ? ' ' + t('itemUnpriced', {stats: e.unpriced.map((k) => t('stat_' + k)).join(', ')}) : '')));
    }
    if (item.from && item.from.length) parts.push(el('p', {}, t('itemFrom') + ' ', ...links(item.from)));
    if (item.from && item.from.length) { // the order to buy it from scratch, with the running total
      parts.push(el('h4', {text: t('itemBuildPath')}), el('ol', {}, ...Engine.buildPath(DATA, selected).map((st) => el('li', {},
        st.combine ? t('buildCombine', {item: nm(DATA.items[st.id].name)}) : link(st.id),
        ' ' + t('buildCost', {cost: fmt(st.cost, 0), total: fmt(st.total, 0)})))));
    }
    const into = (item.into || []).filter((id) => DATA.items[id]);
    if (into.length) parts.push(el('p', {}, t('itemInto') + ' ', ...links(into)));
    if (item.requiredChampion && DATA.champions[item.requiredChampion]) {
      parts.push(p(t('itemOnlyFor', {champ: nm(DATA.champions[item.requiredChampion].name)})));
    }
    for (const g of item.groups || []) {
      if (g === 'Boots') { parts.push(p(t('itemOneBoots'))); continue; }
      const others = Object.keys(DATA.items).filter((id) => id !== selected && (DATA.items[id].groups || []).includes(g));
      if (others.length) parts.push(el('p', {}, t('itemGroup', {n: DATA.groups[g] ?? 1}) + ' ', ...links(others)));
    }
    const counts = [];
    if ((rules.itemStatPassives || {})[selected]) counts.push(t('countStat'));
    if ((rules.itemStatPassivesUnknown || []).includes(selected)) counts.push(t('countStatUnknown'));
    if ((rules.itemDamage || {})[selected]) counts.push(t('countDamage'));
    if ((rules.itemDamageUnknown || []).includes(selected)) counts.push(t('countDamageUnknown'));
    if ((rules.grievousWounds || {})[selected]) counts.push(t('countWounds', {pct: fmt(100 * rules.grievousWounds[selected], 0)}));
    if ((rules.advisorNotScored || []).includes(selected)) counts.push(t('countNotScored'));
    if (counts.length) parts.push(el('h4', {text: t('itemCounted')}), el('ul', {}, ...counts.map((c) => el('li', {text: c}))));
    // Countered by: the counters of each stat it gives (stat cards), plus shields or healing its description mentions.
    const ALIAS = {msPct: 'ms', hpRegenPct: 'hpregen', mpRegenPct: 'mpregen'};
    const keys = new Set([...Object.keys(item.stats), ...(rules.itemStatPassives[selected] || []).map((o) => o.to || o.stat)]
      .map((k) => ALIAS[k] || k));
    const counters = [...keys].filter((k) => CARDS[k] && CARDS[k].counter).map((k) => el('li', {},
      el('strong', {text: cardTitle(k) + (lang === 'fr' ? ' : ' : ': ')}),
      ...CARDS[k].counter.flatMap((c, i) => [...(i ? ['; '] : []), ...counterNodes(c, selected)])));
    const passive = description(item.desc.en || '');
    if (/(?<!spell )shield/i.test(passive) && !counterItems(GUIDE.ITEM_COUNTERS.shield).includes(selected)) {
      counters.push(el('li', {}, ...counterNodes(GUIDE.ITEM_COUNTERS.shield)));
    }
    const gwShown = ['lifesteal', 'omnivamp', 'hpregen'].some((k) => keys.has(k));
    if (/\bheal(?!th)/i.test(passive) && !gwShown && !(rules.grievousWounds || {})[selected]) {
      counters.push(el('li', {}, ...counterNodes(GUIDE.ITEM_COUNTERS.heal)));
    }
    if (counters.length) parts.push(el('h4', {text: t('guideCounter')}), el('ul', {}, ...counters));
    const text = description(item.desc[lang] || item.desc.en || '');
    if (text) parts.push(el('h4', {text: t('itemDescription')}), el('p', {class: 'item-desc', text}));
    ui.card.replaceChildren(...parts);
  }

  function render() {
    ui.title.textContent = t('itemsTitle');
    for (const [k, node] of Object.entries(ui.labels)) node.textContent = t(k);
    ui.search.placeholder = t('itemsSearchHint');
    fillSelect(ui.kind, [{value: '', label: t('itemsAll')}, ...['legendary', 'boots', 'starter', 'components']
      .map((k) => ({value: k, label: t(k)}))], ui.kind.value);
    const statKeys = STAT_ORDER.filter((k) => Object.values(DATA.items).some((i) => i.stats[k]));
    fillSelect(ui.stat, [{value: '', label: t('itemsAnyStat')}, ...statKeys.map((k) => ({value: k, label: t('stat_' + k)}))], ui.stat.value);
    const sorts = ['name', 'priceHigh', 'priceLow', 'efficiency', ...(ui.stat.value ? ['statValue'] : [])];
    fillSelect(ui.sort, sorts.map((k) => ({value: k, label: t('itemsSort_' + k, {stat: ui.stat.value ? t('stat_' + ui.stat.value) : ''})})),
      sorts.includes(ui.sort.value) ? ui.sort.value : 'name');
    const query = ui.search.value.trim().toLowerCase();
    const eff = (id) => Engine.goldEfficiency(DATA, id).efficiency ?? -1;
    const sorters = {name: (a, b) => byName(DATA.items[a], DATA.items[b]), priceHigh: (a, b) => DATA.items[b].gold.total - DATA.items[a].gold.total,
      priceLow: (a, b) => DATA.items[a].gold.total - DATA.items[b].gold.total, efficiency: (a, b) => eff(b) - eff(a),
      statValue: (a, b) => (DATA.items[b].stats[ui.stat.value] || 0) - (DATA.items[a].stats[ui.stat.value] || 0)};
    const ids = Object.keys(DATA.items).filter((id) => {
      const i = DATA.items[id];
      return (!query || nm(i.name).toLowerCase().includes(query)) && (!ui.kind.value || itemKind(i) === ui.kind.value)
        && (!ui.stat.value || i.stats[ui.stat.value]);
    }).sort((a, b) => sorters[ui.sort.value](a, b) || byName(DATA.items[a], DATA.items[b]));
    ui.count.textContent = t('itemsCount', {n: ids.length});
    const head = el('thead', {}, el('tr', {}, ...['itemCol', 'costCol', 'statsCol', 'efficiencyCol']
      .map((k) => el('th', {scope: 'col', text: t(k)}))));
    ui.table.replaceChildren(head, el('tbody', {}, ...ids.map((id) => {
      const i = DATA.items[id];
      return el('tr', {}, el('th', {scope: 'row'}, link(id)), el('td', {text: fmt(i.gold.total, 0)}),
        el('td', {text: Object.entries(i.stats).map(([k, v]) => statText(k, v)).join(', ')}), el('td', {text: effText(id)}));
    })));
    ui.note.textContent = t('itemsEfficiencyNote');
    renderCard();
  }

  function open(id) {
    selected = id;
    if (TABS.includes('items')) showTab('items');
    render();
    ui.card.scrollIntoView({behavior: 'smooth', block: 'start'});
    ui.card.focus({preventScroll: true});
  }
  for (const input of [ui.kind, ui.stat, ui.sort]) input.addEventListener('change', render);
  ui.search.addEventListener('input', render);
  render();
  return {setLang: render, open};
}
let itemsTab = null;

// "Runes" tab: one sub tab per tree, a card per rune (what it does, what the calculator counts, which class pages
// use it), and a sub tab for the stat shards.
function createRunesTab(section) {
  const trees = DATA.runes.trees;
  let current = 0;
  const strip = (html) => html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const rules = DATA.rules;
  const counted = (id) => {
    const stats = [...new Set((rules.runeStats[id] || []).map((e) => (e.op === 'jack' ? 'ah' : e.stat)).filter(Boolean))];
    if (stats.length) return t('runeCountStats', {stats: stats.map((k) => t('stat_' + k)).join(', ')});
    if ((rules.runeDamageUnknown || []).includes(String(id)) || (rules.runeDamageUnknown || []).includes(id)) return t('runeCountUnknown');
    if ((rules.runeDamage || {})[id]) return t('runeCountDamage');
    return t('runeCountNone');
  };
  const usedBy = (id) => (typeof GUIDE === 'object' ? GUIDE.CLASSES : []).filter((c) => {
    const p = Engine.runePageFrom(DATA, c.runes);
    return [p.keystone, ...p.primaryRunes, ...p.secondaryRunes].includes(id);
  });
  function runeCard(id) {
    const r = DATA.runes.byId[id];
    const classes = usedBy(id);
    const full = el('details', {}, el('summary', {text: t('runeFull')}), el('p', {text: strip(nm(r.desc))}));
    return el('article', {class: 'item-card', id: 'rune-' + id, tabindex: -1},
      el('div', {class: 'card-head small'}, ...(r.icon ? [icon(runeIcon(r.icon), 'rune')] : []),
        el('div', {}, el('h4', {text: nm(r.name)}), el('p', {class: 'rune-row', text: r.row ? t('runeRow', {n: r.row}) : t('runeKeystone')}))),
      el('p', {}, ...glossaryNodes(strip(nm(r.short) || nm(r.desc)))), full,
      el('p', {class: 'note', text: counted(id)}),
      ...(classes.length ? [el('p', {class: 'note'}, t('runeUsedBy') + ' ',
        ...classes.flatMap((c, i) => [...(i ? [', '] : []), linkButton(t('tag_' + c.tag), () => classesTab && classesTab.open(c.tag))]))] : []));
  }
  function shardsView() {
    return el('div', {}, el('p', {}, ...glossaryNodes(t('shardsIntro'))),
      el('div', {class: 'guide-cards'}, ...rules.shardRows.map((row, i) => el('article', {class: 'item-card'},
        el('h4', {text: t(['offense', 'flex', 'defense'][i])}),
        el('ul', {class: 'opt-items'}, ...row.map((id) => el('li', {}, icon(shardIcon(id), 'rune'), shardLabel(id))))))));
  }
  function render() {
    const names = [...trees.map((x) => nm(x.name)), t('shardsTitle')];
    const tabs = names.map((name, i) => {
      const b = el('button', {type: 'button', role: 'tab', id: 'rune-tab-' + i, 'aria-controls': 'rune-cards',
        'aria-selected': String(i === current), tabindex: i === current ? 0 : -1, text: name});
      if (trees[i] && trees[i].icon) b.prepend(icon(runeIcon(trees[i].icon), 'rune'));
      b.addEventListener('click', () => { current = i; render(); });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          current = (i + (e.key === 'ArrowRight' ? 1 : names.length - 1)) % names.length;
          render();
          section.querySelector('#rune-tab-' + current).focus();
        }
      });
      return b;
    });
    const tree = trees[current];
    const body = tree ? [el('p', {text: typeof GUIDE === 'object' ? pick(GUIDE.TREES[tree.id] || {en: ''}) : ''}),
      el('div', {class: 'guide-cards'}, ...tree.slots.flat().map(runeCard))] : [shardsView()];
    section.replaceChildren(el('h2', {text: t('tabRunes')}), el('p', {}, ...glossaryNodes(t('runesIntro'))),
      el('div', {class: 'subtabs', role: 'tablist', 'aria-label': t('tabRunes')}, ...tabs),
      el('div', {id: 'rune-cards', role: 'tabpanel', 'aria-labelledby': 'rune-tab-' + current}, ...body));
  }
  function open(id) {
    current = trees.findIndex((x) => x.id === DATA.runes.byId[id].tree);
    showTab('runes');
    render();
    const card = section.querySelector('#rune-' + id);
    if (card) { card.scrollIntoView({behavior: 'smooth', block: 'start'}); card.focus({preventScroll: true}); }
  }
  render();
  return {setLang: render, open};
}
let runesTab = null;

// "Champions" tab: usual roles (Meraki, see prep.py), Riot's classes, and what each kit scales with
// (Engine.kitScaling, measured with the calculator's own damage). A card on top for the champion picked.
const scaling = new Map(); // champion id -> Engine.kitScaling result (the data never changes on the page)
const scaleOf = (id) => scaling.get(id) || scaling.set(id, Engine.kitScaling(DATA, id)).get(id);
function createChampionsTab(section) {
  let selected = null;
  const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT'];
  const ui = {
    title: el('h2', {id: 'champions-title'}), search: el('input', {type: 'search', id: 'champs-search'}),
    role: el('select', {id: 'champs-role'}), tag: el('select', {id: 'champs-class'}), scales: el('select', {id: 'champs-scales'}),
    labels: {}, card: el('article', {class: 'item-card', tabindex: -1}),
    count: el('p', {class: 'note'}), table: el('table', {class: 'damage'}), note: el('p', {class: 'note'}),
  };
  const field = (key, input) => el('div', {}, (ui.labels[key] = el('label', {for: input.id})), input);
  section.append(ui.title, ui.card, el('div', {class: 'rank-form'}, field('itemsSearch', ui.search), field('champRole', ui.role),
    field('champClass', ui.tag), field('champScales', ui.scales)),
    ui.count, el('div', {class: 'table-scroll'}, ui.table), ui.note);
  const roles = (c) => (c.positions || []).map((p) => t('role_' + p)).join(', ') || t('roleUnknown');
  const classes = (c) => (c.tags || []).map((x) => t('tag_' + x)).join(', ');
  // The stats worth naming: the best one, and others giving at least a quarter of its damage.
  const top = (id) => { const s = scaleOf(id).stats; return s.filter((x) => x.gain >= s[0].gain / 4).slice(0, 3); };
  const scalesText = (id) => (scaleOf(id).stats.length ? top(id).map((x) => t('stat_' + x.stat)).join(', ') : '—');
  const link = (id) => champButton(id, () => open(id));

  // A simple first build (Engine.beginnerBuild), with a button that loads it into your panel.
  function beginnerBuild(id) {
    const b = Engine.beginnerBuild(DATA, id, GUIDE.CLASSES, GUIDE.STARTERS);
    const join = (ids) => ids.flatMap((x, i) => [...(i ? [' → '] : []), itemButton(x)]);
    const load = el('button', {type: 'button', text: t('champBuildLoad')});
    load.addEventListener('click', () => {
      panels[0].setChamp(id);
      panels[0].setItems([b.boots, ...b.core, null, null, null, null, null, null].slice(0, 6));
      panels[0].setRunes(usualRunes(id).page);
      showTab('calculator');
      panels[0].section.scrollIntoView();
    });
    return [el('h4', {text: t('champBuild')}),
      el('ul', {}, ...(b.starter ? [el('li', {}, t('champBuildStart') + ' ', itemButton(b.starter))] : []),
        ...(b.boots ? [el('li', {}, t('champBuildBoots') + ' ', itemButton(b.boots))] : []),
        el('li', {}, t('champBuildCore') + ' ', ...join(b.core))),
      el('p', {class: 'note', text: t('champBuildNote', {profile: t('tag_' + b.profile)})}), el('div', {class: 'row combo-add'}, load)];
  }
  // Each ability's damage at a level picked with a slider, and what it scales with (Engine.spellScaling).
  // The max order picked above the table; a new champion starts on its advised order.
  let abilityLevel = 9, abilityOrder = {champ: null, order: null};
  function abilities(id) {
    const list = el('ul'), table = el('table', {class: 'rank-table'});
    const range = el('input', {type: 'range', id: 'champ-ability-level', min: 1, max: 18, step: 1, value: abilityLevel});
    const out = el('output', {for: 'champ-ability-level'});
    const advised = Engine.skillOrder(DATA, id).order.join('');
    if (abilityOrder.champ !== id) abilityOrder = {champ: id, order: advised};
    const pickOrder = el('select', {id: 'champ-ability-order'});
    fillSelect(pickOrder, ['QWE', 'QEW', 'WQE', 'WEQ', 'EQW', 'EWQ'].map((o) => {
      const label = o.split('').join(' > ');
      return {value: o, label: o === advised ? t('abilityOrderAdvised', {order: label}) : label};
    }), abilityOrder.order);
    const c = DATA.champions[id];
    const resName = c.resource === 'Mana' ? t('stat_mp') : c.resource === 'Energy' ? t('stat_energy') : c.resource;
    const update = () => {
      out.textContent = String(abilityLevel);
      const order = abilityOrder.order.split('');
      // Same rule as the engine: a hand-written levels 1-3 order, else the max order in use.
      const start = Engine.startOrder(DATA, id);
      const ranks = Engine.skillRanks(c, abilityLevel, order, start.byDefault ? order : start.order);
      const rows = Engine.spellRankTable(DATA, id, abilityLevel);
      const cols = Math.max(...rows.map((r) => r.cells.length));
      table.replaceChildren(
        el('thead', {}, el('tr', {}, el('th'), ...Array.from({length: cols}, (_, i) => el('th', {text: `${t('rank')} ${i + 1}`})))),
        el('tbody', {}, ...rows.map((r) => el('tr', {}, el('th', {scope: 'row'}, el('strong', {text: r.key}), el('span', {class: 'ability-desc', text: nm(r.name)})),
          ...Array.from({length: cols}, (_, i) => {
            const cell = r.cells[i];
            if (!cell) return el('td');
            const text = cell.unreadable ? t('abilityUnreadable') : cell.noDamage || !cell.damage ? t('abilityNoDamage')
              : t('abilityDamage', {damage: fmt(cell.damage, 0), type: t('type_' + cell.type)}) + (cell.perHit ? ' ' + t('perHit') : '');
            const extra = [cell.cooldown ? `${cell.cooldown} s` : '', cell.cost ? `${cell.cost} ${resName}` : ''].filter(Boolean).join(' · ');
            return el('td', {class: ranks[r.key] === cell.rank ? 'current' : ''}, text, ...(extra ? [el('span', {class: 'ability-desc', text: extra})] : []));
          })))));
      list.replaceChildren(...Engine.spellScaling(DATA, id, abilityLevel, order).map((sp) => {
        const head = `${sp.key === 'P' ? t('passive') : sp.key} · ${nm(sp.name)}: `;
        const text = !sp.learned ? t('notLearned') : sp.unreadable ? t('abilityUnreadable') : sp.noDamage || !sp.damage ? t('abilityNoDamage')
          : t('abilityDamage', {damage: fmt(sp.damage, 0), type: t('type_' + sp.type)}) + (sp.perHit ? ' ' + t('perHit') : '')
            + (sp.key !== 'P' ? ` (${t('rank').toLowerCase()} ${sp.rank})` : '')
            + (sp.ratios.length ? '. ' + t('abilityScales', {list: sp.ratios.map((r) => `${fmt(100 * r.ratio, 0)}% ${t('stat_' + r.stat)}`).join(', ')}) : '');
        const spell = DATA.champions[id].spells.find((x) => x.key === sp.key) || {};
        const extra = [stripTags(nm(spell.desc || {en: ''})), spell.cooldown ? t('abilityCooldown', {cd: spell.cooldown}) : '',
          spell.cost ? t('abilityCost', {cost: spell.cost, resource: resName}) : ''].filter(Boolean).join(' ');
        return el('li', {}, el('strong', {text: head}), text, ...(extra ? [el('span', {class: 'ability-desc', text: extra})] : []));
      }));
    };
    range.addEventListener('input', () => { abilityLevel = Number(range.value); update(); });
    pickOrder.addEventListener('change', () => { abilityOrder = {champ: id, order: pickOrder.value}; update(); });
    update();
    return [el('h4', {text: t('champAbilities')}),
      el('div', {class: 'guide-row'}, el('label', {for: 'champ-ability-level', text: t('level')}), range, out),
      el('div', {class: 'guide-row'}, el('label', {for: 'champ-ability-order', text: t('abilityOrder')}), pickOrder),
      list, el('h4', {text: t('abilityRanks')}), el('div', {class: 'rank-table-wrap'}, table),
      el('p', {class: 'note', text: t('abilityNote')})];
  }

  function renderCard() {
    ui.card.hidden = !selected;
    if (!selected) return;
    const c = DATA.champions[selected], s = scaleOf(selected);
    const parts = [el('div', {class: 'card-head'}, icon(champIcon(selected), 'champ'),
      el('div', {}, el('h3', {text: nm(c.name)}), el('p', {class: 'note', text: nm(c.title)}))),
      el('p', {text: `${t('champRole')}: ${roles(c)}`}), el('p', {text: `${t('champClass')}: ${classes(c)}`}),
      ...(c.difficulty ? [el('p', {text: t('champDifficultyLine', {n: c.difficulty})})] : []),
      ...(Object.keys(c.ratings || {}).length ? [el('div', {class: 'ratings'}, ...['damage', 'toughness', 'control', 'mobility', 'utility']
        .filter((k) => c.ratings[k]).map((k) => [k, c.ratings[k]]).flatMap(([k, v]) => [
        el('span', {text: t('rating_' + k)}),
        el('span', {class: 'pips', role: 'img', 'aria-label': `${v}/3`}, ...[1, 2, 3].map((n) => el('span', {class: n <= v ? 'on' : ''})))])),
      el('p', {class: 'note', text: t('ratingsNote')})] : []),
      el('h4', {text: t('champScales')})];
    if ((c.tags || []).includes('Marksman')) parts.push(el('p', {text: t('champMarksman')}));
    if (s.stats.length) {
      parts.push(el('ul', {}, ...top(selected).map((x) => el('li', {text: t('champScalesLine', {stat: t('stat_' + x.stat), gain: fmt(x.gain, 0)})}))));
    } else parts.push(el('p', {class: 'notice', text: t('champNoScaling')}));
    const names = s.excluded.map((k) => (k === 'P' ? t('passive') : k));
    if (s.excluded.length && s.stats.length) parts.push(el('p', {class: 'notice', text: t('champExcluded', {spells: names.join(', ')})}));
    parts.push(el('p', {class: 'note', text: t('champScalesNote')}));
    const order = Engine.skillOrder(DATA, selected);
    const start = Engine.startOrder(DATA, selected);
    parts.push(el('p', {}, el('strong', {text: t('skillOrder') + ': '}),
      t('skillStart', {order: start.order.join(', '), note: start.byDefault ? t('skillStartDefault') : ''})
      + t('skillOrderMax', {order: order.order.join(' > ')})
      + (order.estimated ? ' ' + t('skillOrderEstimatedShort') : '')));
    // Sections are blocks so the two-column layout never splits one (index.html).
    parts.splice(1, parts.length - 1, el('div', {class: 'block'}, ...parts.slice(1)));
    if (typeof GUIDE === 'object') {
      const runes = usualRunes(selected);
      parts.push(el('div', {class: 'block'}, ...beginnerBuild(selected)),
        ...(roleOf((c.positions || [])[0]) ? [el('div', {class: 'block'}, el('h4', {text: t('champSummoners')}),
          el('p', {}, ...roleOf(c.positions[0]).spells.flatMap((x, i) => [...(i ? [' + '] : []), summonerButton(x)]),
            ' ' + t('champSummonersFor', {role: t('role_' + c.positions[0])})),
          el('p', {class: 'note', text: pick(roleOf(c.positions[0]).why)}))] : []),
        el('div', {class: 'block'}, el('h4', {text: t('runePage')}), runePageNodes(runes.page),
          el('p', {class: 'note', text: pick(runes.why) + ' ' + t('runePageFrom', {tag: t('tag_' + runes.tag)})})),
        el('div', {class: 'block'}, ...abilities(selected)));
    }
    const openAs = (idx, who) => {
      const b = el('button', {type: 'button', text: t('openAs', {who: t(who)})});
      b.addEventListener('click', () => {
        if (idx === 1) setEnemyShown(true);
        panels[idx].setChamp(selected);
        showTab('calculator');
        panels[idx].section.scrollIntoView();
      });
      return b;
    };
    parts.push(el('div', {class: 'row combo-add'}, openAs(0, 'you'), openAs(1, 'enemy')));
    ui.card.replaceChildren(...parts);
  }

  function render() {
    ui.title.textContent = t('tabChampions');
    for (const [k, node] of Object.entries(ui.labels)) node.textContent = t(k);
    ui.search.placeholder = t('champSearchHint');
    fillSelect(ui.role, [{value: '', label: t('champAllRoles')}, ...ROLES.map((r) => ({value: r, label: t('role_' + r)}))], ui.role.value);
    const allIds = Object.keys(DATA.champions);
    const tags = [...new Set(allIds.flatMap((id) => DATA.champions[id].tags || []))].sort((a, b) => t('tag_' + a).localeCompare(t('tag_' + b), lang));
    fillSelect(ui.tag, [{value: '', label: t('champAllClasses')}, ...tags.map((x) => ({value: x, label: t('tag_' + x)}))], ui.tag.value);
    // Only the stats some champion's column shows, in the stats table's order.
    const shown = new Set(allIds.flatMap((id) => (scaleOf(id).stats.length ? top(id).map((x) => x.stat) : [])));
    fillSelect(ui.scales, [{value: '', label: t('champAnyStat')}, ...STAT_ORDER.filter((k) => shown.has(k)).map((k) => ({value: k, label: t('stat_' + k)}))], ui.scales.value);
    const query = ui.search.value.trim().toLowerCase();
    const ids = allIds.filter((id) => {
      const c = DATA.champions[id];
      return (!query || nm(c.name).toLowerCase().includes(query)) && (!ui.role.value || (c.positions || []).includes(ui.role.value))
        && (!ui.tag.value || (c.tags || []).includes(ui.tag.value))
        && (!ui.scales.value || (scaleOf(id).stats.length > 0 && top(id).some((x) => x.stat === ui.scales.value)));
    }).sort((a, b) => byName(DATA.champions[a], DATA.champions[b]));
    ui.count.textContent = t('champsCount', {n: ids.length});
    const head = el('thead', {}, el('tr', {}, ...['champion', 'champRole', 'champClass', 'champScales', 'champDifficulty']
      .map((k) => el('th', {scope: 'col', text: t(k)}))));
    ui.table.replaceChildren(head, el('tbody', {}, ...ids.map((id) => {
      const c = DATA.champions[id];
      return el('tr', {}, el('th', {scope: 'row'}, link(id)), el('td', {text: roles(c)}), el('td', {text: classes(c)}),
        el('td', {text: scalesText(id)}), el('td', {text: c.difficulty ? `${c.difficulty}/10` : '—'}));
    })));
    ui.note.textContent = t('champRoleNote');
    renderCard();
  }

  function open(id) {
    selected = id;
    render();
    ui.card.scrollIntoView({behavior: 'smooth', block: 'start'});
    ui.card.focus({preventScroll: true});
  }
  for (const s of [ui.role, ui.tag, ui.scales]) s.addEventListener('change', render);
  ui.search.addEventListener('input', render);
  render();
  return {setLang: render, open: (id) => { if (TABS.includes('champions')) showTab('champions'); open(id); },
    // Show every champion of one role (from the Start here tab).
    showRole: (role) => {
      ui.role.value = role; ui.tag.value = ''; ui.scales.value = ''; ui.search.value = ''; selected = null;
      showTab('champions'); render(); ui.table.scrollIntoView({behavior: 'smooth', block: 'start'});
    }};
}
let championsTab = null;

// "Classes" tab: one sub tab per Riot class (guide.js CLASSES): what it does, strengths and weaknesses, which classes
// it beats or loses to, where it's played (Meraki roles), the champions whose abilities scale best and the items that fit.
function createClassesTab(section) {
  let current = 0;
  const shownAll = new Set();
  const label = (text) => el('p', {class: 'guide-label', text});
  const tagLink = (tag) => linkButton(t('tag_' + tag), () => select(GUIDE.CLASSES.findIndex((c) => c.tag === tag), true));
  function select(i, focus) {
    current = i;
    render();
    if (focus) section.querySelector('#class-tab-' + i).focus();
  }
  function card(c) {
    const champs = Object.keys(DATA.champions).filter((id) => (DATA.champions[id].tags || []).includes(c.tag));
    // Usually played: each champion's roles, as a share of all the class's role entries.
    // Roles and the scaling ranking use the champions whose main (first) class this is: a mage also tagged
    // Marksman (Azir) would blur the Marksman card.
    const main = champs.filter((id) => DATA.champions[id].tags[0] === c.tag);
    const roles = {};
    main.forEach((id) => (DATA.champions[id].positions || []).forEach((p) => { roles[p] = (roles[p] || 0) + 1; }));
    const roleTotal = Object.values(roles).reduce((a, b) => a + b, 0);
    const played = Object.entries(roles).sort((a, b) => b[1] - a[1]).filter(([, n]) => n / roleTotal >= 0.1)
      .map(([p, n]) => `${t('role_' + p)} ${fmt(100 * n / roleTotal, 0)}%`).join(', ');
    const ranked = main.filter((id) => scaleOf(id).stats.length)
      .sort((a, b) => scaleOf(b).stats[0].gain - scaleOf(a).stats[0].gain);
    const champLink = (id) => champButton(id, () => championsTab && championsTab.open(id));
    const vs = (list) => el('ul', {}, ...list.map((x) => el('li', {}, tagLink(x.tag), ': ' + pick(x))));
    const picks = Engine.classItems(DATA, c.keyStats);
    const itemLine = (id) => el('li', {}, itemButton(id), ' ' + Object.entries(DATA.items[id].stats).filter(([k]) => c.keyStats[k])
      .map(([k, v]) => `+${fmt(v)}${k === 'as' ? '%' : ''} ${t('stat_' + k)}`).join(', ')); // other % stats say so in their name
    const all = shownAll.has(c.tag);
    const toggle = linkButton(all ? t('classHideChamps') : t('classAllChamps', {n: champs.length}), () => {
      if (all) shownAll.delete(c.tag); else shownAll.add(c.tag);
      render();
    });
    toggle.setAttribute('aria-expanded', String(all));
    return el('article', {class: 'item-card'},
      el('h3', {text: t('tag_' + c.tag)}), el('p', {}, ...glossaryNodes(pick(c.what))),
      ...(played ? [el('p', {text: `${t('classPlayed')}: ${played}`})] : []),
      label(t('classPros')), el('ul', {}, ...c.pros.map((x) => el('li', {}, ...glossaryNodes(pick(x))))),
      label(t('classCons')), el('ul', {}, ...c.cons.map((x) => el('li', {}, ...glossaryNodes(pick(x))))),
      label(t('classStrong')), vs(c.strong), label(t('classWeak')), vs(c.weak),
      label(t('classKeyStats')), el('p', {}, ...Object.keys(c.keyStats).flatMap((k, i) => [...(i ? [', '] : []),
        CARDS[k] ? linkButton(cardTitle(k), () => guideTab && guideTab.open(k)) : t('stat_' + k)])),
      label(t('runePage')), runePageNodes(Engine.runePageFrom(DATA, c.runes)), el('p', {class: 'note', text: pick(c.runes.why)}),
      label(t('classItems')), el('ul', {}, ...picks.items.map(itemLine)),
      ...(picks.boots ? [el('p', {}, t('classBoots') + ' ', itemButton(picks.boots))] : []),
      label(t('classChamps')), el('ol', {}, ...ranked.slice(0, 8).map((id) => el('li', {}, champLink(id), ' ' +
        t('classChampGain', {stat: t('stat_' + scaleOf(id).stats[0].stat), gain: fmt(scaleOf(id).stats[0].gain, 0)})))),
      el('p', {class: 'guide-label'}, toggle),
      ...(all ? [el('p', {}, ...champs.sort((a, b) => byName(DATA.champions[a], DATA.champions[b]))
        .flatMap((id, i) => [...(i ? [', '] : []), champLink(id)]))] : []),
      el('p', {class: 'note', text: t('classNote')}));
  }
  function render() {
    const tabs = GUIDE.CLASSES.map((c, i) => {
      const b = el('button', {type: 'button', role: 'tab', id: 'class-tab-' + i, 'aria-controls': 'class-card',
        'aria-selected': String(i === current), tabindex: i === current ? 0 : -1, text: t('tag_' + c.tag)});
      b.addEventListener('click', () => select(i));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') select((i + (e.key === 'ArrowRight' ? 1 : GUIDE.CLASSES.length - 1)) % GUIDE.CLASSES.length, true);
      });
      return b;
    });
    section.replaceChildren(el('h2', {text: t('tabClasses')}), el('p', {text: t('classIntro')}),
      el('div', {class: 'subtabs', role: 'tablist', 'aria-label': t('tabClasses')}, ...tabs),
      el('div', {id: 'class-card', role: 'tabpanel', 'aria-labelledby': 'class-tab-' + current}, card(GUIDE.CLASSES[current])));
  }
  render();
  return {setLang: render, open: (tag) => { showTab('classes'); select(Math.max(0, GUIDE.CLASSES.findIndex((c) => c.tag === tag))); }};
}
let classesTab = null;

// "Stats explained" tab: one card per stat (what it does, what it works with) and live examples computed with
// the calculator's own formulas (guide.js). Slider positions survive a language switch.
const pick = (text) => text[lang] || text.en;
const outLink = (url, text) => el('a', {href: url, target: '_blank', rel: 'noopener', text});
// "Countered by" lines (guide.js counter entries): text, then item links (Items tab) and card links (Stats explained).
const CARDS = Object.fromEntries(GUIDE.GROUPS.flatMap((g) => g.stats.map((c) => [c.key, c])));
const cardTitle = (key) => (CARDS[key].title ? pick(CARDS[key].title) : t('stat_' + key));
const counterItems = (c) => (c.items === 'gw' ? Object.keys(DATA.rules.grievousWounds || {}) : c.items || [])
  .filter((id) => DATA.items[id]).sort((a, b) => byName(DATA.items[a], DATA.items[b]));
const linkButton = (text, action) => {
  const b = el('button', {type: 'button', class: 'link', text});
  b.addEventListener('click', action);
  return b;
};
const itemButton = (id) => {
  const b = linkButton(nm(DATA.items[id].name), () => itemsTab && itemsTab.open(id));
  b.prepend(icon(itemIcon(id)));
  return b;
};
const runeButton = (id) => {
  const r = DATA.runes.byId[id];
  const b = linkButton(nm(r.name), () => runesTab && runesTab.open(id));
  if (r.icon) b.prepend(icon(runeIcon(r.icon), 'rune'));
  return b;
};
// A rune page as a short list: keystone, main tree runes, second tree runes, stat shards.
function runePageNodes(page) {
  const tree = (id) => nm(DATA.runes.trees.find((x) => x.id === id).name);
  const join = (ids) => ids.filter(Boolean).flatMap((id, i) => [...(i ? [', '] : []), runeButton(id)]);
  return el('ul', {},
    ...(page.keystone ? [el('li', {}, t('runePageKeystone') + ' ', runeButton(page.keystone))] : []),
    ...(page.primary ? [el('li', {}, t('runePageMain', {tree: tree(page.primary)}) + ' ', ...join(page.primaryRunes))] : []),
    ...(page.secondary ? [el('li', {}, t('runePageSecond', {tree: tree(page.secondary)}) + ' ', ...join(page.secondaryRunes))] : []),
    el('li', {}, t('runePageShards') + ' ' + page.shards.filter(Boolean).map(shardLabel).join(', ')));
}
// The usual rune page for a champion: the page of the class its beginner build uses.
const usualRunes = (champId) => {
  const tag = Engine.beginnerBuild(DATA, champId, GUIDE.CLASSES, GUIDE.STARTERS).profile;
  const c = GUIDE.CLASSES.find((x) => x.tag === tag);
  return {tag, why: c.runes.why, page: Engine.runePageFrom(DATA, c.runes)};
};
const summonerButton = (id) => {
  const b = linkButton(nm(DATA.summoners[id].name), () => summonersTab && summonersTab.open(id));
  b.prepend(icon(summonerIcon(id)));
  return b;
};
const stripTags = (html) => (html || '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const roleOf = (key) => (typeof GUIDE === 'object' ? GUIDE.ROLES.find((r) => r.key === key) : null);
const champButton = (id, action) => {
  const b = linkButton(nm(DATA.champions[id].name), action);
  b.prepend(icon(champIcon(id), 'champ'));
  return b;
};
// Glossary words in a text become links to their definition (Glossary tab). Whole words only, any case.
const glossaryWords = {};
function glossaryNodes(text) {
  if (typeof GUIDE !== 'object' || !GUIDE.GLOSSARY) return [text];
  if (!glossaryWords[lang]) {
    const map = new Map();
    for (const g of GUIDE.GLOSSARY) for (const w of g.words[lang] || []) map.set(w.toLowerCase(), g.key);
    const alts = [...map.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    glossaryWords[lang] = {map, re: new RegExp(`(?<![\\p{L}\\p{N}])(${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu')};
  }
  const {map, re} = glossaryWords[lang];
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index < last) continue; // inside punctuation already taken
    const link = linkButton(m[0], () => glossaryTab && glossaryTab.open(map.get(m[0].toLowerCase())));
    const end = m.index + m[0].length, punct = (text.slice(end).match(/^[,.;:!?)]+/) || [''])[0];
    out.push(text.slice(last, m.index), punct ? el('span', {class: 'nowrap'}, link, punct) : link); // "stacks," stays on one line
    last = end + punct.length;
  }
  out.push(text.slice(last));
  return out.filter((x) => x !== '');
}

function counterNodes(c, skip) { // skip: the item being shown, not listed as its own counter
  const join = (xs) => xs.flatMap((x, i) => (i ? [', ', x] : [x]));
  const items = counterItems(c).filter((id) => id !== skip).map(itemButton);
  const see = (c.see || []).filter((k) => CARDS[k]).map((k) => linkButton(cardTitle(k), () => guideTab && guideTab.open(k)));
  return [pick(c), ...(items.length ? [' ', ...join(items)] : []), ...(see.length ? [` (${t('see')} `, ...join(see), ')'] : [])];
}

function createGuideTab(section) {
  const values = {};
  function example(card) {
    const ex = GUIDE.EXAMPLES[card.example];
    const v = values[card.key] || (values[card.key] = Object.fromEntries(ex.inputs.map((i) => [i.key, i.value])));
    const rows = el('div'), note = el('p', {class: 'note'});
    const update = () => {
      const r = ex.run(v, DATA.rules);
      rows.replaceChildren(...r.rows.map((row) => {
        const pct = Math.max(0, Math.min(100, 100 * row.value / row.max));
        return el('div', {class: 'guide-row'}, el('span', {text: pick(row)}),
          el('div', {class: 'guide-bar'}, el('span', {style: `width: ${pct}%`})),
          el('output', {class: row.strong ? 'strong' : '', text: fmt(row.value, row.digits || 0) + (row.unit || '')}));
      }));
      note.textContent = pick(r.note(fmt));
    };
    const inputs = ex.inputs.map((inp) => {
      const id = `guide-${card.key}-${inp.key}`;
      const range = el('input', {type: 'range', id, min: inp.min, max: inp.max, step: inp.step, value: v[inp.key]});
      const out = el('output', {for: id});
      const show = () => { out.textContent = fmt(v[inp.key], 0) + (inp.unit || ''); };
      range.addEventListener('input', () => { v[inp.key] = Number(range.value); show(); update(); });
      show();
      return el('div', {class: 'guide-row'}, el('label', {for: id, text: pick(inp)}), range, out);
    });
    update();
    return el('div', {class: 'guide-try'}, el('p', {class: 'guide-label', text: t('guideExample')}), ...inputs, rows, note);
  }
  // "Items with this stat": the items giving it (most first), then those changing it through a passive
  // (rules.py itemStatPassives). Each name opens the item in the Items tab. Open lists stay open on re-render.
  const ITEM_KEYS = {ms: ['ms', 'msPct'], hpregen: ['hpregen', 'hpRegenPct'], mpregen: ['mpregen', 'mpRegenPct']};
  const shownItems = new Set();
  function itemList(card) {
    const keys = ITEM_KEYS[card.key] || [card.key], passives = DATA.rules.itemStatPassives || {};
    const found = Object.keys(DATA.items).map((id) => ({id,
      flat: keys.filter((k) => DATA.items[id].stats[k]).map((k) => [k, DATA.items[id].stats[k]]),
      passive: (passives[id] || []).some((o) => keys.includes(o.stat) || keys.includes(o.to))}))
      .filter((x) => x.flat.length || x.passive)
      .sort((a, b) => ((b.flat[0] || [])[1] || 0) - ((a.flat[0] || [])[1] || 0) || nm(DATA.items[a.id].name).localeCompare(nm(DATA.items[b.id].name), lang));
    if (!found.length) return [];
    const open = shownItems.has(card.key);
    const toggle = el('button', {type: 'button', class: 'link', 'aria-expanded': String(open),
      text: open ? t('guideHideItems') : t('guideShowItems', {n: found.length})});
    toggle.addEventListener('click', () => { if (open) shownItems.delete(card.key); else shownItems.add(card.key); render(); });
    const amount = ([k, v]) => `+${fmt(v)}${k === 'as' ? '%' : ''}` + (k === card.key ? '' : ' ' + t('stat_' + k));
    const list = open ? [el('ul', {class: 'guide-items'}, ...found.map((x) => {
      const name = el('button', {type: 'button', class: 'link', text: nm(DATA.items[x.id].name)});
      name.addEventListener('click', () => itemsTab && itemsTab.open(x.id));
      return el('li', {}, name, ' ', [...x.flat.map(amount), ...(x.passive ? [t('guideItemPassive')] : [])].join(', '));
    }))] : [];
    return [el('p', {class: 'guide-label'}, toggle), ...list];
  }
  // One sub tab per group (Basic attacks, Abilities…); the one shown is remembered.
  let current = (() => { try { return Math.max(0, GUIDE.GROUPS.findIndex((g) => g.en === storage.getItem('guideGroup'))); } catch { return 0; } })();
  function select(i, focus) {
    current = i;
    try { storage.setItem('guideGroup', GUIDE.GROUPS[i].en); } catch { /* storage blocked: choice lasts for this visit */ }
    render();
    if (focus) section.querySelector('#guide-tab-' + i).focus();
  }
  function render() {
    const tabs = GUIDE.GROUPS.map((group, i) => {
      const b = el('button', {type: 'button', role: 'tab', id: 'guide-tab-' + i, 'aria-controls': 'guide-cards',
        'aria-selected': String(i === current), tabindex: i === current ? 0 : -1, text: pick(group)});
      b.addEventListener('click', () => select(i));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') select((i + (e.key === 'ArrowRight' ? 1 : GUIDE.GROUPS.length - 1)) % GUIDE.GROUPS.length, true);
      });
      return b;
    });
    const cards = GUIDE.GROUPS[current].stats.map((card) => el('article', {class: 'item-card', id: 'guide-' + card.key},
      el('h4', {text: card.title ? pick(card.title) : t('stat_' + card.key)}), el('p', {}, ...glossaryNodes(pick(card.what))),
      el('p', {class: 'guide-label', text: t('guideWith')}), el('ul', {}, ...card.with.map((w) => el('li', {}, ...glossaryNodes(pick(w))))),
      ...(card.counter ? [el('p', {class: 'guide-label', text: t('guideCounter')}),
        el('ul', {}, ...card.counter.map((c) => el('li', {}, ...counterNodes(c))))] : []),
      ...(card.example ? [example(card)] : []), ...itemList(card),
      el('p', {class: 'note'}, outLink(GUIDE.WIKI + card.wiki, t('guideWiki')))));
    section.replaceChildren(el('h2', {text: t('guideTitle')}), el('div', {},
      el('p', {text: t('guideIntro')}), el('div', {class: 'subtabs', role: 'tablist', 'aria-label': t('guideTitle')}, ...tabs),
      el('div', {class: 'guide-cards', id: 'guide-cards', role: 'tabpanel', 'aria-labelledby': 'guide-tab-' + current}, ...cards)));
  }
  // Show one card (from a "see" link): its sub tab, then scroll to it.
  function open(key) {
    if (TABS.includes('guide')) showTab('guide');
    select(Math.max(0, GUIDE.GROUPS.findIndex((g) => g.stats.some((c) => c.key === key))));
    const card = section.querySelector('#guide-' + key);
    if (card) card.scrollIntoView({behavior: 'smooth', block: 'start'});
  }
  render();
  return {setLang: render, open};
}
let guideTab = null;

// "Glossary" tab: the words guides use without explaining them (guide.js GLOSSARY), in alphabetical order.
function createGlossaryTab(section) {
  function render() {
    const entries = GUIDE.GLOSSARY.slice().sort((a, b) => pick(a.term).localeCompare(pick(b.term), lang));
    section.replaceChildren(el('h2', {text: t('tabGlossary')}), el('p', {text: t('glossaryIntro')}),
      el('div', {class: 'guide-cards'}, ...entries.map((g) => el('article', {class: 'item-card', id: 'glossary-' + g.key, tabindex: -1},
        el('h4', {text: pick(g.term)}), el('p', {text: pick(g.def)}),
        ...(g.see && CARDS[g.see] ? [el('p', {class: 'note'}, t('see') + ' ', linkButton(cardTitle(g.see), () => guideTab && guideTab.open(g.see)))] : [])))));
  }
  function open(key) {
    showTab('glossary');
    const card = section.querySelector('#glossary-' + key);
    if (card) { card.scrollIntoView({behavior: 'smooth', block: 'start'}); card.focus({preventScroll: true}); }
  }
  render();
  return {setLang: render, open};
}
let glossaryTab = null;

// "Sources" tab: where the data and formulas come from, with links.
function createSourcesTab(section) {
  const minor = DATA.patch.split('.').slice(0, 2).join('.');
  const url = (u) => u.replace('{patch}', DATA.patch).replace('{minor}', minor);
  function render() {
    section.replaceChildren(el('h2', {text: t('sourcesTitle')}), el('div', {class: 'sources'},
      el('p', {text: t('sourcesIntro', {patch: DATA.patch})}),
      ...GUIDE.SOURCES.map((s) => el('section', {}, el('h3', {text: pick(s.title)}), el('p', {text: pick(s.text)}),
        el('ul', {}, ...s.links.map((l) => el('li', {}, outLink(url(l.url), pick(l)))))))));
  }
  render();
  return {setLang: render};
}
let sourcesTab = null;

// "Start here" tab: how to begin, then each role: what it does, its usual summoner spells, its easiest champions.
function createStartTab(section) {
  function render() {
    const easiest = (role) => Object.keys(DATA.champions).filter((id) => (DATA.champions[id].positions || []).includes(role) && DATA.champions[id].difficulty)
      .sort((a, b) => DATA.champions[a].difficulty - DATA.champions[b].difficulty || byName(DATA.champions[a], DATA.champions[b])).slice(0, 6);
    section.replaceChildren(el('h2', {text: t('tabStart')}), el('p', {text: t('startIntro')}),
      el('ol', {}, ...GUIDE.START.map((s) => el('li', {}, ...glossaryNodes(pick(s))))),
      el('div', {class: 'guide-cards'}, ...GUIDE.ROLES.map((r) => {
        const all = linkButton(t('roleAll', {role: t('role_' + r.key)}), () => championsTab && championsTab.showRole(r.key));
        return el('article', {class: 'item-card'}, el('h4', {text: t('role_' + r.key)}), el('p', {}, ...glossaryNodes(pick(r.what))),
          el('p', {}, t('champSummoners') + ': ', ...r.spells.flatMap((x, i) => [...(i ? [' + '] : []), summonerButton(x)])),
          el('p', {class: 'guide-label', text: t('roleEasiest')}),
          el('ul', {}, ...easiest(r.key).map((id) => el('li', {}, champButton(id, () => championsTab && championsTab.open(id)),
            ' ' + t('difficultyShort', {n: DATA.champions[id].difficulty})))),
          el('p', {}, all));
      })),
      el('p', {class: 'note', text: t('startNote')}));
  }
  render();
  return {setLang: render};
}
let startTab = null;

// "Summoner spells" tab: the usual pair per role, then a card per spell.
function createSummonersTab(section) {
  function render() {
    const ids = Object.keys(DATA.summoners).sort((a, b) => byName(DATA.summoners[a], DATA.summoners[b]));
    section.replaceChildren(el('h2', {text: t('tabSummoners')}), el('p', {text: t('summonersIntro')}),
      el('h3', {text: t('summonersPairs')}),
      el('ul', {}, ...GUIDE.ROLES.map((r) => el('li', {}, el('strong', {text: t('role_' + r.key) + ': '}),
        ...r.spells.flatMap((x, i) => [...(i ? [' + '] : []), summonerButton(x)]), '. ' + pick(r.why)))),
      el('div', {class: 'guide-cards'}, ...ids.map((id) => {
        const s = DATA.summoners[id], usual = GUIDE.ROLES.filter((r) => r.spells.includes(id));
        return el('article', {class: 'item-card', id: 'summoner-' + id, tabindex: -1},
          el('div', {class: 'card-head small'}, icon(summonerIcon(id)), el('div', {}, el('h4', {text: nm(s.name)}),
            ...(s.cooldown ? [el('p', {class: 'rune-row', text: t('summonerCooldown', {n: s.cooldown})})] : []))),
          el('p', {text: stripTags(nm(s.desc))}),
          ...(usual.length ? [el('p', {class: 'note', text: t('summonerUsual') + ' ' + usual.map((r) => t('role_' + r.key)).join(', ')})] : []));
      })));
  }
  function open(id) {
    showTab('summoners');
    const card = section.querySelector('#summoner-' + id);
    if (card) { card.scrollIntoView({behavior: 'smooth', block: 'start'}); card.focus({preventScroll: true}); }
  }
  render();
  return {setLang: render, open};
}
let summonersTab = null;

// "What changed" tab: champion, item and rune changes since the previous patch the site had (prep.py change_details).
function createChangesTab(section) {
  const field = (f) => {
    const [a, b] = f.split('.');
    if (a === 'base') return b.endsWith('perlevel') ? `${t('stat_' + b.replace('perlevel', ''))} ${t('changePerLevel')}`
      : b === 'asratio' ? t('changeAsRatio') : t('stat_' + b);
    if (a === 'stat') return t('stat_' + b);
    if (b === 'cooldown' || b === 'cost' || b === 'details') return t('change_' + b, {key: a === 'P' ? t('passive') : a});
    return t('change_' + a);
  };
  const line = ([f, from, to]) => el('li', {text: field(f) + (from === null && to === null ? '' : `: ${from ?? '—'} → ${to ?? '—'}`)});
  function render() {
    const review = DATA.review || {}, changes = review.changes || [];
    const group = (kind, title, button) => {
      const list = changes.filter((c) => c.kind === kind && (kind === 'rune' ? DATA.runes.byId[c.id] : kind === 'item' ? DATA.items[c.id] : DATA.champions[c.id]));
      return list.length ? [el('h3', {text: title}), el('div', {class: 'guide-cards'}, ...list.map((c) => el('article', {class: 'item-card'},
        el('p', {}, button(c.id)), el('ul', {}, ...c.changes.map(line)))))] : [];
    };
    const body = !review.comparedWith ? [el('p', {text: t('changesNone')})]
      : !changes.length ? [el('p', {text: t('changesNothing')})]
        : [...group('champion', t('tabChampions'), (id) => champButton(id, () => championsTab && championsTab.open(id))),
          ...group('item', t('tabItems'), itemButton), ...group('rune', t('tabRunes'), runeButton)];
    section.replaceChildren(el('h2', {text: t('tabChanges')}),
      ...(review.comparedWith ? [el('p', {text: t('changesIntro', {patch: DATA.patch, old: review.comparedWith})})] : []), ...body);
  }
  render();
  return {setLang: render};
}
let changesTab = null;

// Tabs: the calculator (panels + advisor), the rankings and the champion optimizer. The choice is remembered.
// Only tabs present in the page: a cached older index.html next to a newer app.js must not break the page.
const TABS = ['calculator', 'rankings', 'optimize', 'champions', 'classes', 'start', 'items', 'runes', 'summoners', 'guide', 'glossary', 'changes', 'sources'].filter((id) => document.getElementById(id) && document.getElementById('tab-' + id));
function showTab(name) {
  for (const [tab, panel] of TABS.map((x) => [x, x])) {
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
  panels[1].results.append(counterBox(panels[0].getSelection(), panels[1].getSelection()));
}

// "How to beat them", under the enemy's damage: Engine.counterAdvice lines, each with a buy suggestion or counter items.
function counterBox(you, enemy) {
  const lines = Engine.counterAdvice(DATA, you, enemy).map((a) => {
    const vars = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'number' ? fmt(v, 0) : v]));
    const parts = [t('counter_' + a.id, vars)];
    if (a.stat) {
      const b = el('button', {type: 'button', class: 'link', text: t('counterSuggest', {stat: t('stat_' + a.stat)})});
      b.addEventListener('click', () => advisor && advisor.suggestBy(a.stat));
      parts.push(' ', b);
    } else {
      const items = CARDS[a.card].counter.filter((c) => c.items).flatMap(counterItems);
      parts.push(' ', ...items.flatMap((id, i) => [...(i ? [', '] : []), itemButton(id)]));
    }
    return el('li', {}, ...parts);
  });
  // Who wins a full trade at each level (both at that level, current items and runes), as level ranges.
  const byLevel = Engine.matchupByLevel(DATA, you, enemy), ranges = [];
  byLevel.forEach((w, i) => { const r = ranges.at(-1); if (r && r.w === w) r.b = i + 1; else ranges.push({w, a: i + 1, b: i + 1}); });
  const verdict = ranges.map((r) => t('matchup_' + r.w, {levels: r.a === r.b ? t('levelOne', {a: r.a}) : t('levelRange', r)})).join('; ');
  return el('div', {class: 'counters'}, el('h3', {text: t('counterTitle', {champ: nm(DATA.champions[enemy.champ].name)})}),
    el('p', {class: 'summary', text: t('matchupVerdict', {verdict})}),
    el('ul', {}, ...lines), el('p', {class: 'note', text: t('counterNote')}));
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
  document.title = t('title');
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
  document.querySelector('.patch').textContent = `${t('patch')} ${DATA.patch}`;
  document.getElementById('lang').textContent = t('switchLang');
  panels.forEach((p) => p.setLang());
  if (advisor) advisor.setLang();
  if (rankings) rankings.setLang();
  if (optimizer) optimizer.setLang();
  if (itemsTab) itemsTab.setLang();
  if (championsTab) championsTab.setLang();
  if (runesTab) runesTab.setLang();
  if (classesTab) classesTab.setLang();
  if (guideTab) guideTab.setLang();
  if (glossaryTab) glossaryTab.setLang();
  if (sourcesTab) sourcesTab.setLang();
  for (const [tab, name, key] of [[startTab, 'start', 'tabStart'], [summonersTab, 'summoners', 'tabSummoners'], [changesTab, 'changes', 'tabChanges']]) {
    if (tab) { tab.setLang(); document.getElementById('tab-' + name).textContent = t(key); }
  }
  shareButton.textContent = t('shareLink');
  document.getElementById('tab-calculator').textContent = t('tabCalculator');
  document.getElementById('tab-rankings').textContent = t('tabRankings');
  if (optimizer) document.getElementById('tab-optimize').textContent = t('tabOptimize');
  if (itemsTab) document.getElementById('tab-items').textContent = t('tabItems');
  if (runesTab) document.getElementById('tab-runes').textContent = t('tabRunes');
  if (championsTab) document.getElementById('tab-champions').textContent = t('tabChampions');
  if (classesTab) document.getElementById('tab-classes').textContent = t('tabClasses');
  if (guideTab) document.getElementById('tab-guide').textContent = t('tabGuide');
  if (glossaryTab) document.getElementById('tab-glossary').textContent = t('tabGlossary');
  if (sourcesTab) document.getElementById('tab-sources').textContent = t('tabSources');
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
// A link that opens this exact setup: both panels, encoded in the address after #b=.
const shareButton = el('button', {type: 'button'}), shareStatus = el('p', {class: 'note', role: 'status'});
const encodeShare = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decodeShare = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
shareButton.addEventListener('click', () => {
  const url = `${location.origin}${location.pathname}#b=${encodeShare({y: panels[0].share(), e: enemyShown ? panels[1].share() : null})}`;
  history.replaceState(null, '', url);
  const done = (key) => { shareStatus.textContent = t(key); };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => done('shareCopied'), () => done('shareInAddress'));
  else done('shareInAddress');
});
container.after(addEnemyButton, el('div', {class: 'share-row'}, shareButton, shareStatus));
panels.push(createPanel(container, 'you', renderMatchup));
panels.push(createPanel(container, 'enemy', renderMatchup));
advisor = createAdvisor(document.getElementById('advisor'));
setEnemyShown(enemyShown);
rankings = createRankings(document.getElementById('rankings'));
if (TABS.includes('optimize')) optimizer = createOptimizer(document.getElementById('optimize'));
if (TABS.includes('items')) itemsTab = createItemsTab(document.getElementById('items'));
if (TABS.includes('runes')) runesTab = createRunesTab(document.getElementById('runes'));
if (TABS.includes('champions')) championsTab = createChampionsTab(document.getElementById('champions'));
if (TABS.includes('classes') && typeof GUIDE === 'object') classesTab = createClassesTab(document.getElementById('classes'));
if (TABS.includes('guide') && typeof GUIDE === 'object') guideTab = createGuideTab(document.getElementById('guide'));
if (TABS.includes('glossary') && typeof GUIDE === 'object') glossaryTab = createGlossaryTab(document.getElementById('glossary'));
if (TABS.includes('start') && typeof GUIDE === 'object') startTab = createStartTab(document.getElementById('start'));
if (TABS.includes('summoners') && typeof GUIDE === 'object') summonersTab = createSummonersTab(document.getElementById('summoners'));
if (TABS.includes('changes')) changesTab = createChangesTab(document.getElementById('changes'));
if (TABS.includes('sources') && typeof GUIDE === 'object') sourcesTab = createSourcesTab(document.getElementById('sources'));
const ROW = TABS.filter((name) => document.getElementById('tab-' + name).getAttribute('role') === 'tab'); // Sources is in the footer
TABS.forEach((name) => {
  const tab = document.getElementById('tab-' + name);
  tab.addEventListener('click', () => showTab(name));
  tab.addEventListener('keydown', (e) => {
    const i = ROW.indexOf(name);
    if (i >= 0 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const other = ROW[(i + (e.key === 'ArrowRight' ? 1 : ROW.length - 1)) % ROW.length];
      showTab(other);
      document.getElementById('tab-' + other).focus();
    }
  });
});
showTab((() => { try { const s = storage.getItem('tab'); return TABS.includes(s) ? s : 'calculator'; } catch { return 'calculator'; } })());
renderPage();
// Opened from a shared link: load its setup into the calculator. A broken link is ignored.
(() => {
  const m = location.hash.match(/^#b=([\w-]{1,4000})$/);
  if (!m) return;
  try {
    const o = decodeShare(m[1]);
    if (!panels[0].loadShare(o.y)) return;
    if (o.e && panels[1].loadShare(o.e)) setEnemyShown(true);
    showTab('calculator');
  } catch { /* not a link this page made */ }
})();
