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
  assert.ok(I18N.LABELS.en.disclaimer.startsWith("Summoner's Notebook isn't endorsed by Riot Games")));
test('stage 2 labels exist in both languages', () => {
  for (const k of ['enemy', 'currentHp', 'skillOrder', 'combo', 'autos', 'notLearned', 'kills', 'hpLeft', 'damageTo',
                   'noDamage', 'excludedNote', 'customRanks', 'type_physical', 'type_magic', 'type_true', 'addStep',
                   'resetCombo', 'moveUp', 'moveDown', 'remove', 'basicAttack', 'nonCrit', 'crit', 'average', 'rank',
                   'unknownDamage', 'killsAt', 'leaves', 'passive', 'step', 'damage', 'perHit', 'perHitNote', 'checkInGame', 'comboLine', 'partNote']) {
    assert.ok(I18N.LABELS.en[k] && I18N.LABELS.fr[k], k);
  }
});
test('stage 3 labels exist in both languages', () => {
  for (const k of ['goldInPocket', 'advisor', 'suggest', 'sortBy', 'sortOffense', 'sortDefense', 'perGold', 'buy', 'costCol',
                   'damageGain', 'killStep', 'survivalGain', 'apply', 'notScored', 'stale', 'unlimitedNote', 'nothingAffordable',
                   'partlyCounted', 'completes', 'baseline', 'notScoredIntro']) {
    assert.ok(I18N.LABELS.en[k] && I18N.LABELS.fr[k], k);
  }
});
test('the gold unit label is still the short unit (not overwritten by another label)', () => {
  assert.equal(I18N.LABELS.en.gold, 'gold');
  assert.equal(I18N.LABELS.fr.gold, 'po');
  assert.ok(I18N.LABELS.en.goldInPocket && I18N.LABELS.fr.goldInPocket);
});
test('stage 4 labels exist in both languages', () => {
  for (const k of ['tabCalculator', 'tabRankings', 'rankStat', 'rankCount', 'rankLevel', 'rankMaxGold', 'rankMaxGoldHint',
                   'rankStacks', 'rankButton', 'rankCol', 'valueCol', 'itemsCol', 'runesCol', 'openInCalculator', 'rankNote',
                   'rankEmpty', 'rankTime', 'rankingsTitle']) {
    assert.ok(I18N.LABELS.en[k] && I18N.LABELS.fr[k], k);
  }
});
test('optional enemy labels exist in both languages', () => {
  for (const k of ['addEnemy', 'removeEnemy', 'needEnemy', 'openAs']) assert.ok(I18N.LABELS.en[k] && I18N.LABELS.fr[k], k);
  assert.ok(I18N.t('openAs', 'en', {who: 'Enemy'}).includes('Enemy'));
});
