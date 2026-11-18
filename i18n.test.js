const test = require('node:test');
const assert = require('node:assert/strict');
const I18N = require('./i18n.js');

test('same keys in both languages', () =>
  assert.deepEqual(Object.keys(I18N.LABELS.en).sort(), Object.keys(I18N.LABELS.fr).sort()));
test('loadLang default and throwing storage', () => {
  assert.equal(I18N.loadLang({getItem: () => null}), 'en');
  assert.equal(I18N.loadLang({getItem: () => { throw new Error('blocked'); }}), 'en');
  assert.equal(I18N.loadLang({getItem: () => 'fr'}), 'fr');
  assert.equal(I18N.loadLang({getItem: () => 'de'}), 'en');
  assert.equal(I18N.loadLang(undefined), 'en');
});
test('saveLang swallows errors', () =>
  assert.doesNotThrow(() => I18N.saveLang({setItem() { throw new Error('blocked'); }}, 'fr')));
test('t falls back to the key, name picks the language', () => {
  assert.equal(I18N.t('nope', 'fr'), 'nope');
  assert.equal(I18N.t('total', 'fr'), 'Total');
  assert.equal(I18N.name({en: 'Black Cleaver', fr: 'Couperet noir'}, 'fr'), 'Couperet noir');
  assert.equal(I18N.name({en: 'Only English'}, 'fr'), 'Only English');
});
test('disclaimer is exact', () =>
  assert.ok(I18N.LABELS.en.disclaimer.startsWith("LoL Build Calculator isn't endorsed by Riot Games")));
test('stage 2 labels exist in both languages', () => {
  for (const k of ['enemy', 'currentHp', 'skillOrder', 'combo', 'autos', 'notLearned', 'kills', 'hpLeft', 'damageTo',
                   'noDamage', 'excludedNote', 'customRanks', 'type_physical', 'type_magic', 'type_true', 'addStep',
                   'resetCombo', 'moveUp', 'moveDown', 'remove', 'basicAttack', 'nonCrit', 'crit', 'average', 'rank',
                   'unknownDamage', 'killsAt', 'leaves', 'passive', 'step', 'damage', 'perHit', 'perHitNote', 'checkInGame', 'comboLine', 'partNote']) {
    assert.ok(I18N.LABELS.en[k] && I18N.LABELS.fr[k], k);
  }
});
