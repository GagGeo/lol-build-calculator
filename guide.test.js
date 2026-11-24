const test = require('node:test');
const assert = require('node:assert/strict');
const GUIDE = require('./guide.js');
const I18N = require('./i18n.js');
const both = (o, where) => assert.ok(o && o.en && o.fr, `${where}: English and French text`);
const rules = {critBase: 1.75, asCap: 2.5, grievousWounds: {3033: 0.4}};

test('every card has both languages, a stat label and a known example', () => {
  for (const g of GUIDE.GROUPS) {
    both(g, 'group');
    for (const c of g.stats) {
      both(c.what, c.key);
      c.with.forEach((w) => both(w, c.key));
      if (c.title) both(c.title, c.key);
      else assert.ok(I18N.LABELS.en['stat_' + c.key] && I18N.LABELS.fr['stat_' + c.key], `${c.key}: stat label`);
      assert.ok(c.wiki, `${c.key}: wiki page`);
      if (c.example) assert.ok(GUIDE.EXAMPLES[c.example], `${c.key}: example ${c.example}`);
      for (const x of c.counter || []) {
        both(x, c.key);
        (x.see || []).forEach((k) => assert.ok(GUIDE.GROUPS.some((g) => g.stats.some((o) => o.key === k)), `${c.key}: see ${k}`));
      }
    }
  }
});

test('examples give finite numbers at the slider ends, in both languages', () => {
  for (const [id, ex] of Object.entries(GUIDE.EXAMPLES)) {
    ex.inputs.forEach((i) => both(i, id));
    for (const end of ['min', 'max', 'value']) {
      const r = ex.run(Object.fromEntries(ex.inputs.map((i) => [i.key, i[end]])), rules);
      r.rows.forEach((row) => { both(row, id); assert.ok(Number.isFinite(row.value), `${id} ${end}`); });
      both(r.note((n) => String(Math.round(n))), id);
    }
  }
});

test('armor example matches the damage formula', () => {
  const r = GUIDE.EXAMPLES.armor.run({r: 100, pct: 0, flat: 0}, rules);
  assert.equal(Math.round(r.rows[1].value), 100); // 100 armor halves a 200 hit
  const pen = GUIDE.EXAMPLES.armor.run({r: 100, pct: 30, flat: 10}, rules); // (100 x 0.7) - 10 = 60
  assert.equal(Math.round(pen.rows[0].value), 60);
});

test('sources: both languages and absolute links', () => {
  for (const s of GUIDE.SOURCES) {
    both(s.title, 'source'); both(s.text, 'source');
    s.links.forEach((l) => { both(l, l.url); assert.match(l.url, /^https:\/\//); });
  }
});

test('classes: both languages, known classes and stat labels', () => {
  const tags = GUIDE.CLASSES.map((c) => c.tag);
  for (const c of GUIDE.CLASSES) {
    both(c.what, c.tag);
    [...c.pros, ...c.cons, ...c.strong, ...c.weak].forEach((x) => both(x, c.tag));
    [...c.strong, ...c.weak].forEach((x) => assert.ok(tags.includes(x.tag), `${c.tag}: ${x.tag}`));
    for (const k of Object.keys(c.keyStats)) assert.ok(I18N.LABELS.en['stat_' + k], `${c.tag}: stat ${k}`);
    assert.ok(I18N.LABELS.en['tag_' + c.tag] && I18N.LABELS.fr['tag_' + c.tag], c.tag);
  }
});

test('glossary: both languages, words to link, known cards', () => {
  const cards = GUIDE.GROUPS.flatMap((g) => g.stats.map((c) => c.key));
  for (const g of GUIDE.GLOSSARY) {
    both(g.term, g.key); both(g.def, g.key);
    assert.ok(g.words.en.length && g.words.fr.length, `${g.key}: words`);
    if (g.see) assert.ok(cards.includes(g.see), `${g.key}: see ${g.see}`);
  }
  assert.equal(new Set(GUIDE.GLOSSARY.map((g) => g.key)).size, GUIDE.GLOSSARY.length);
});

test('class rune pages and tree texts: both languages', () => {
  for (const c of GUIDE.CLASSES) {
    both(c.runes.why, c.tag);
    assert.equal(c.runes.primary.length, 3, c.tag);
    assert.equal(c.runes.secondary.length, 2, c.tag);
    assert.equal(c.runes.shards.length, 3, c.tag);
  }
  Object.entries(GUIDE.TREES).forEach(([id, x]) => both(x, id));
});
