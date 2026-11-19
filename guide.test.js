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
      assert.ok(I18N.LABELS.en['stat_' + c.key] && I18N.LABELS.fr['stat_' + c.key], `${c.key}: stat label`);
      assert.ok(c.wiki, `${c.key}: wiki page`);
      if (c.example) assert.ok(GUIDE.EXAMPLES[c.example], `${c.key}: example ${c.example}`);
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
