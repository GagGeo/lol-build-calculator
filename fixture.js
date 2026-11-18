// Small hand-made DATA for engine tests (not real game values).
const champ = (id, extra = {}) => ({
  id, name: {en: id, fr: id}, title: {en: '', fr: ''}, resource: 'Mana', adaptiveAP: false, flags: [],
  base: {hp: 600, hpperlevel: 100, mp: 0, mpperlevel: 0, armor: 30, armorperlevel: 4, mr: 30, mrperlevel: 1.3,
         ad: 60, adperlevel: 3, as: 0.65, asratio: 0.625, asperlevel: 2, ms: 340, range: 125,
         hpregen: 0, hpregenperlevel: 0, mpregen: 0, mpregenperlevel: 0, ...extra},
});
const item = (id, stats, extra = {}) => ({
  id, name: {en: id, fr: 'fr ' + id}, desc: {en: '', fr: ''}, gold: {total: 1000, base: 1000},
  from: [], into: [], tier: 5, groups: [], boots: false, requiredChampion: null, stats, ...extra,
});
const tree = (id) => ({id, key: 'T' + id, name: {en: 'T' + id, fr: 'T' + id},
  slots: [0, 1, 2, 3].map((row) => [id + row * 10 + 1, id + row * 10 + 2])});
const trees = [tree(100), tree(200)];
const byId = {};
for (const t of trees) t.slots.forEach((ids, row) => ids.forEach((id) => {
  byId[id] = {id, name: {en: 'R' + id, fr: 'R' + id}, desc: {en: '', fr: ''}, tree: t.id, row};
}));

const D = {
  patch: 'test',
  champions: Object.fromEntries([
    champ('Testo'), champ('Veigar'), champ('Cassiopeia'), champ('Fiddlesticks'), champ('Senna'),
    champ('Chogath'), champ('Ranger', {range: 550}),
  ].map((c) => [c.id, c])),
  items: Object.fromEntries([
    item('ls', {ad: 10}, {gold: {total: 350, base: 350}}), item('bow', {as: 25}), item('cap', {ap: 130}),
    item('big', {as: 300}), item('boots', {ms: 100}, {groups: ['Boots'], boots: true, tier: 4}),
    item('boots2', {ms: 100}, {groups: ['Boots'], boots: true, tier: 4}),
    item('effigy', {}, {requiredChampion: 'FiddleSticks'}), item('bf', {ad: 40}, {gold: {total: 1300, base: 1300}}),
    item('ohp', {hp: 500}), item('wm', {hp: 1000}), item('eh', {ad: 50}), item('ruby', {hp: 150}),
    item('mrI', {mr: 20}),
  ].map((i) => [i.id, i])),
  groups: {Boots: 1},
  runes: {trees, byId},
  rules: {
    shards: {5008: {adaptive: 9}, 5005: {as: 10}, 5007: {ah: 8}, 5010: {msPct: 2.5}, 5001: {hpPerLevel: 10},
             5011: {hp: 65}, 5013: {tenacity: 15}},
    shardRows: [[5008, 5005, 5007], [5008, 5010, 5001], [5011, 5013, 5001]],
    noBoots: ['Cassiopeia'],
    asCap: 2.5,
    typicalGoldByLevel: [500, 800, 1100, 1500, 1900, 2400, 3000, 3700, 4400,
                         5200, 6100, 7000, 8000, 9000, 10200, 11500, 13000, 15000],
    goldWarningFactor: 1.5,
    itemStatPassives: {
      cap: [{op: 'mulTotal', stat: 'ap', value: 0.30}],
      ohp: [{op: 'convert', from: 'hp', basis: 'bonus', to: 'ad', value: 0.025}],
      wm: [{op: 'convert', from: 'hp', basis: 'items', to: 'hp', value: 0.12}],
    },
    itemStatPassivesReviewed: [],
    itemStatPassivesUnknown: ['eh'],
    stackers: {Veigar: {ap: 1}, Senna: {ad: 0.75, crit: {per: 20, value: 10}}, Chogath: {hp: {byRRank: [40, 80, 120]}}},
    runeStats: {
      101: [{stat: 'adaptive', min: 21.6, max: 48}],
      111: [{stat: 'as', value: 36, only: 'melee'}, {stat: 'as', value: 24, only: 'ranged'}],
      121: [{stat: 'armor', value: 8}, {stat: 'armor', mulTotal: 0.03}],
      211: [{stat: 'ah', steps: [[5, 5], [8, 10]], always: true}],
      221: [{op: 'jack', always: true}],
    },
    runeStatsReviewed: [],
  },
  review: {possibleStatPassives: [], possibleRuneStats: []},
};

// A legal page with no rune effects except the ones a test opts into.
const VALID_PAGE = {primary: 100, keystone: 102, primaryRunes: [112, 122, 132], secondary: 200,
                    secondaryRunes: [212, 232], shards: [5008, 5010, 5011]};

module.exports = {D, VALID_PAGE};
