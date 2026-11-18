// Page labels in English and French, plus the remembered language choice.
const I18N = (() => {
  const LABELS = {
    en: {
      title: 'LoL Build Calculator', patch: 'Patch', switchLang: 'Français', you: 'You',
      champion: 'Champion', level: 'Level', stacks: 'Stacks', runes: 'Runes', primary: 'Primary tree',
      keystone: 'Keystone', secondary: 'Secondary tree', shards: 'Stat shards', offense: 'Offense', flex: 'Flex',
      defense: 'Defense', stacked: 'Assume runes fully stacked', items: 'Items', none: '—', stats: 'Stats',
      stat: 'Stat', base: 'Base', bonus: 'Bonus', total: 'Total', cost: 'Build cost', gold: 'gold',
      goldWarning: 'Unusual: {cost} gold of items at this level (typical: about {typical}).',
      removed: 'Removed because {champ} can\'t have them: {items}.',
      unknownPassive: '{item}: part of its bonus isn\'t counted here — check in game.',
      unknownChampion: '{champ}: part of this champion\'s stats comes from their passive and isn\'t counted here — check in game.',
      stat_energy: 'Energy',
      enemy: 'Enemy', currentHp: 'Current health %', skillOrder: 'Skill order', combo: 'Combo', autos: 'Basic attacks',
      notLearned: 'not learned yet', kills: 'kills', hpLeft: 'HP left', damageTo: 'Damage to {champ}',
      noDamage: 'no damage', excludedNote: '{spell}: part of this damage can\'t be read here — check in game. Not counted in the combo.',
      customRanks: '{champ} levels abilities differently from most champions; ranks shown are an estimate.',
      type_physical: 'physical', type_magic: 'magic', type_true: 'true', addStep: 'Add step', resetCombo: 'Reset combo',
      moveUp: 'Move up', moveDown: 'Move down', remove: 'Remove', basicAttack: 'Basic attack', nonCrit: 'Normal',
      crit: 'Critical', average: 'Average', rank: 'Rank', unknownDamage: '{name}: its damage isn\'t counted here — check in game.',
      killsAt: 'Kills at step {n}.', leaves: 'Leaves {hp} HP ({pct}%).', passive: 'Passive', step: 'Step', damage: 'Damage',
      ofMaxHp: '{pct}% of max health',
      checkInGame: 'check in game', comboLine: 'used in the combo',
      partNote: '{spell}: part of this spell\'s damage can\'t be read here — check in game.',
      perHit: 'per hit', perHitNote: '{spell}: this damage is per hit; the combo counts one hit. Add the other hits in your head.',
      boots: 'Boots', starter: 'Starter', legendary: 'Legendary', components: 'Components',
      stat_hp: 'Health', stat_mp: 'Mana', stat_ad: 'Attack Damage', stat_ap: 'Ability Power', stat_armor: 'Armor',
      stat_mr: 'Magic Resist', stat_as: 'Attack Speed', stat_ah: 'Ability Haste', stat_ms: 'Move Speed',
      stat_msPct: 'Move Speed %', stat_crit: 'Critical Strike Chance %', stat_critDmg: 'Critical Strike Damage %',
      stat_lifesteal: 'Life Steal %', stat_omnivamp: 'Omnivamp %', stat_lethality: 'Lethality',
      stat_armorPenPct: 'Armor Penetration %', stat_magicPen: 'Magic Penetration',
      stat_magicPenPct: 'Magic Penetration %', stat_hsp: 'Heal and Shield Power %', stat_tenacity: 'Tenacity %',
      stat_hpRegenPct: 'Base Health Regen %', stat_mpRegenPct: 'Base Mana Regen %', stat_hpregen: 'Health Regen (per 5s)',
      stat_mpregen: 'Mana Regen (per 5s)', stat_range: 'Attack Range', stat_adaptive: 'Adaptive Force',
      shard_hpPerLevel: 'Health (10 per level)', empty: 'Empty', chooseChampion: 'Pick a champion',
      asNote: 'Attack speed: base and total in attacks per second, bonus in %.',
      disclaimer: "LoL Build Calculator isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.",
    },
    fr: {
      title: 'LoL Build Calculator', patch: 'Patch', switchLang: 'English', you: 'Vous',
      champion: 'Champion', level: 'Niveau', stacks: 'Cumuls', runes: 'Runes', primary: 'Arbre principal',
      keystone: 'Rune clé', secondary: 'Arbre secondaire', shards: 'Fragments', offense: 'Attaque', flex: 'Flexible',
      defense: 'Défense', stacked: 'Supposer les runes entièrement cumulées', items: 'Objets', none: '—',
      stats: 'Statistiques', stat: 'Statistique', base: 'Base', bonus: 'Bonus', total: 'Total',
      cost: 'Coût du build', gold: 'po',
      goldWarning: 'Inhabituel : {cost} po d\'objets à ce niveau (habituel : environ {typical}).',
      removed: 'Retirés car {champ} ne peut pas les avoir : {items}.',
      unknownPassive: '{item} : une partie de son bonus n\'est pas comptée ici — vérifiez en jeu.',
      unknownChampion: '{champ} : une partie des statistiques de ce champion vient de son passif et n\'est pas comptée ici — vérifiez en jeu.',
      stat_energy: 'Énergie',
      enemy: 'Adversaire', currentHp: 'Vie actuelle %', skillOrder: 'Ordre des compétences', combo: 'Combo',
      autos: 'Attaques de base', notLearned: 'pas encore apprise', kills: 'tue', hpLeft: 'PV restants',
      damageTo: 'Dégâts sur {champ}', noDamage: 'aucun dégât',
      excludedNote: '{spell} : une partie de ces dégâts ne peut pas être lue ici — vérifiez en jeu. Non compté dans le combo.',
      customRanks: '{champ} monte ses compétences différemment de la plupart des champions ; les rangs affichés sont une estimation.',
      type_physical: 'physiques', type_magic: 'magiques', type_true: 'bruts', addStep: 'Ajouter une étape',
      resetCombo: 'Réinitialiser le combo', moveUp: 'Monter', moveDown: 'Descendre', remove: 'Retirer',
      basicAttack: 'Attaque de base', nonCrit: 'Normale', crit: 'Critique', average: 'Moyenne', rank: 'Rang',
      unknownDamage: '{name} : ses dégâts ne sont pas comptés ici — vérifiez en jeu.', killsAt: 'Tue à l\'étape {n}.',
      leaves: 'Laisse {hp} PV ({pct} %).', passive: 'Passif', step: 'Étape', damage: 'Dégâts',
      ofMaxHp: '{pct} % de la vie max',
      checkInGame: 'à vérifier en jeu', comboLine: 'utilisé dans le combo',
      partNote: '{spell} : une partie des dégâts de ce sort ne peut pas être lue ici — vérifiez en jeu.',
      perHit: 'par coup', perHitNote: '{spell} : ces dégâts sont par coup ; le combo compte un seul coup. Ajoutez les autres coups de tête.',
      boots: 'Bottes', starter: 'Départ', legendary: 'Légendaires', components: 'Composants',
      stat_hp: 'Points de vie', stat_mp: 'Mana', stat_ad: 'Dégâts d\'attaque', stat_ap: 'Puissance',
      stat_armor: 'Armure', stat_mr: 'Résistance magique', stat_as: 'Vitesse d\'attaque',
      stat_ah: 'Accélération de compétence', stat_ms: 'Vitesse de déplacement', stat_msPct: 'Vitesse de déplacement %',
      stat_crit: 'Chances de coup critique %', stat_critDmg: 'Dégâts des coups critiques %',
      stat_lifesteal: 'Vol de vie %', stat_omnivamp: 'Omnivampirisme %', stat_lethality: 'Létalité',
      stat_armorPenPct: 'Pénétration d\'armure %', stat_magicPen: 'Pénétration magique',
      stat_magicPenPct: 'Pénétration magique %', stat_hsp: 'Puissance des soins et boucliers %',
      stat_tenacity: 'Ténacité %', stat_hpRegenPct: 'Régénération de PV de base %',
      stat_mpRegenPct: 'Régénération de mana de base %', stat_hpregen: 'Régénération de PV (par 5 s)',
      stat_mpregen: 'Régénération de mana (par 5 s)', stat_range: 'Portée d\'attaque', stat_adaptive: 'Force adaptative',
      shard_hpPerLevel: 'Points de vie (10 par niveau)', empty: 'Vide', chooseChampion: 'Choisissez un champion',
      asNote: 'Vitesse d\'attaque : base et total en attaques par seconde, bonus en %.',
      disclaimer: "LoL Build Calculator n'est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ni de toute personne officiellement impliquée dans la production ou la gestion des propriétés de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou des marques déposées de Riot Games, Inc.",
    },
  };

  const t = (key, lang, vars = {}) =>
    (LABELS[lang][key] ?? key).replace(/\{(\w+)\}/g, (_, v) => (vars[v] ?? `{${v}}`));

  const name = (obj, lang) => obj[lang] || obj.en;

  function loadLang(storage) {
    try {
      const v = storage.getItem('lang');
      return v === 'fr' ? 'fr' : 'en';
    } catch {
      return 'en';
    }
  }

  function saveLang(storage, lang) {
    try { storage.setItem('lang', lang); } catch { /* storage blocked: choice lasts for this visit only */ }
  }

  return {LABELS, t, name, loadLang, saveLang};
})();

if (typeof module === 'object') module.exports = I18N;
