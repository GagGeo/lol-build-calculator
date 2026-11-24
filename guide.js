// Content of the "Stats explained" and "Sources" tabs, English and French side by side.
// Examples compute with the same Engine functions as the calculator, so the page and the numbers agree.
const GUIDE = (() => {
  const Eng = typeof Engine === 'object' ? Engine : require('./engine.js');
  const WIKI = 'https://wiki.leagueoflegends.com/en-us/';

  // Example: armor or magic resist against penetration, on a 200-damage hit.
  const resist = (type) => {
    const phys = type === 'physical';
    return {
      inputs: [
        {key: 'r', min: 0, max: 300, step: 5, value: 120,
          en: phys ? 'Enemy armor' : 'Enemy magic resist', fr: phys ? 'Armure adverse' : 'Résistance magique adverse'},
        {key: 'pct', min: 0, max: 40, step: 5, value: 0, unit: '%',
          en: phys ? 'Your armor penetration' : 'Your magic penetration',
          fr: phys ? 'Votre pénétration d\'armure' : 'Votre pénétration magique'},
        {key: 'flat', min: 0, max: 60, step: 1, value: 0,
          en: phys ? 'Your lethality' : 'Your flat magic penetration', fr: phys ? 'Votre létalité' : 'Votre pénétration magique fixe'},
      ],
      run(v) {
        const attacker = {total: phys ? {armorPenPct: v.pct, lethality: v.flat} : {magicPenPct: v.pct, magicPen: v.flat}};
        const target = {total: phys ? {armor: v.r} : {mr: v.r}};
        const dealt = Eng.mitigate(200, type, attacker, target);
        const raw = Eng.mitigate(200, type, {total: {}}, target);
        const counts = 200 * 100 / dealt - 100; // the resist left after penetration
        return {
          rows: [
            {en: phys ? 'Armor that counts' : 'Magic resist that counts', fr: phys ? 'Armure qui compte' : 'Résistance qui compte',
              value: counts, max: 300},
            {en: 'Damage dealt (of 200)', fr: 'Dégâts infligés (sur 200)', value: dealt, max: 200, strong: true},
          ],
          note: (f) => {
            const blocked = f(100 - dealt / 2, 0), without = f(100 - raw / 2, 0);
            return v.pct || v.flat
              ? {en: `The enemy blocks ${blocked}% of the hit. Without your penetration, they would block ${without}%.`,
                 fr: `L'adversaire bloque ${blocked} % du coup. Sans votre pénétration, il en bloquerait ${without} %.`}
              : {en: `The enemy blocks ${blocked}% of the hit. Move the penetration sliders to see how much you get back.`,
                 fr: `L'adversaire bloque ${blocked} % du coup. Bougez les curseurs de pénétration pour voir ce que vous récupérez.`};
          },
        };
      },
    };
  };

  // Example: health or mana regeneration, shown per minute.
  const regen = (type) => {
    const hp = type === 'hp';
    return {
      inputs: [{key: 'r', min: 0, max: hp ? 100 : 50, step: 1, value: hp ? 20 : 10,
        en: hp ? 'Health regen per 5 seconds' : 'Mana regen per 5 seconds', fr: hp ? 'Régén. de PV par 5 secondes' : 'Régén. de mana par 5 secondes'}],
      run(v) {
        const perMin = v.r * 12;
        return {
          rows: hp
            ? [{en: 'Health back per minute', fr: 'PV récupérés par minute', value: perMin, max: 1200, strong: true}]
            : [{en: 'Mana back per minute', fr: 'Mana récupéré par minute', value: perMin, max: 600},
              {en: '60-mana spells it pays for, per minute', fr: 'Sorts à 60 de mana payés, par minute', value: perMin / 60, max: 10, digits: 1, strong: true}],
          note: (f) => (hp
            ? {en: `It keeps ticking in fights, but it shines between them: ${f(perMin / 2, 0)} health back while you walk back to lane for 30 seconds.`,
               fr: `Elle continue en combat, mais brille entre deux : ${f(perMin / 2, 0)} PV récupérés pendant 30 secondes de retour en voie.`}
            : {en: `Every 5 seconds you get back ${f(v.r, 0)} mana, in a fight or not.`,
               fr: `Toutes les 5 secondes, vous récupérez ${f(v.r, 0)} de mana, en combat ou non.`}),
        };
      },
    };
  };

  const EXAMPLES = {
    armor: resist('physical'),
    mr: resist('magic'),
    ehp: {
      inputs: [
        {key: 'hp', min: 500, max: 4000, step: 50, value: 2000, en: 'Your health', fr: 'Vos PV'},
        {key: 'armor', min: 0, max: 300, step: 5, value: 100, en: 'Your armor', fr: 'Votre armure'},
      ],
      run(v) {
        const ehp = v.hp / Eng.mitigate(1, 'physical', {total: {}}, {total: {armor: v.armor}});
        return {
          rows: [{en: 'Physical damage needed to kill you', fr: 'Dégâts physiques pour vous tuer', value: ehp, max: 16000, strong: true}],
          note: (f) => ({
            en: `Here, 10 more armor would add ${f(v.hp / 10, 0)} of it, and 100 more health would add ${f(100 + v.armor, 0)}. They cost about the same gold, so the bigger number is the better buy.`,
            fr: `Ici, 10 d'armure en plus en ajouteraient ${f(v.hp / 10, 0)}, et 100 PV en plus en ajouteraient ${f(100 + v.armor, 0)}. Les deux coûtent à peu près le même or : le plus grand chiffre est le meilleur achat.`,
          }),
        };
      },
    },
    crit: {
      inputs: [
        {key: 'ad', min: 50, max: 400, step: 5, value: 150, en: 'Your attack damage', fr: 'Vos dégâts d\'attaque'},
        {key: 'crit', min: 0, max: 100, step: 5, value: 50, unit: '%', en: 'Critical strike chance', fr: 'Chances de coup critique'},
        {key: 'dmg', min: 0, max: 50, step: 5, value: 0, unit: '%', en: 'Bonus critical damage', fr: 'Dégâts critiques en plus'},
      ],
      run(v, rules) {
        const mult = rules.critBase + v.dmg / 100, avg = v.ad * (1 + (v.crit / 100) * (mult - 1));
        return {
          rows: [
            {en: 'Normal hit', fr: 'Coup normal', value: v.ad, max: 900},
            {en: 'Critical hit', fr: 'Coup critique', value: v.ad * mult, max: 900},
            {en: 'Average hit', fr: 'Coup moyen', value: avg, max: 900, strong: true},
          ],
          note: (f) => (v.crit
            ? {en: `Crits deal ${f(mult * 100, 0)}% damage. On average, your hits deal ${f(100 * avg / v.ad - 100, 0)}% more than a normal hit.`,
               fr: `Les critiques infligent ${f(mult * 100, 0)} % des dégâts. En moyenne, vos coups infligent ${f(100 * avg / v.ad - 100, 0)} % de plus qu'un coup normal.`}
            : {en: 'With no critical strike chance, critical damage does nothing.',
               fr: 'Sans chances de coup critique, les dégâts critiques ne servent à rien.'}),
        };
      },
    },
    as: {
      inputs: [
        {key: 'ad', min: 50, max: 400, step: 5, value: 150, en: 'Your attack damage', fr: 'Vos dégâts d\'attaque'},
        {key: 'bonus', min: 0, max: 300, step: 5, value: 50, unit: '%', en: 'Bonus attack speed', fr: 'Vitesse d\'attaque en plus'},
      ],
      run(v, rules) {
        const aps = Math.min(rules.asCap, 0.65 * (1 + v.bonus / 100));
        return {
          rows: [
            {en: 'Attacks per second', fr: 'Attaques par seconde', value: aps, max: rules.asCap, digits: 2},
            {en: 'Basic attack damage per second', fr: 'Dégâts des attaques par seconde', value: v.ad * aps, max: 1000, strong: true},
          ],
          note: (f) => (aps >= rules.asCap
            ? {en: `Capped at ${f(rules.asCap, 1)} attacks per second: more attack speed adds nothing.`,
               fr: `Plafonnée à ${f(rules.asCap, 1)} attaques par seconde : plus de vitesse d'attaque n'ajoute rien.`}
            : {en: 'For a champion with 0.65 base attack speed. Each attack also applies on-hit effects and life steal, so attack speed multiplies those too.',
               fr: 'Pour un champion à 0,65 de vitesse d\'attaque de base. Chaque attaque applique aussi les effets à l\'impact et le vol de vie : la vitesse d\'attaque les multiplie aussi.'}),
        };
      },
    },
    ah: {
      inputs: [{key: 'ah', min: 0, max: 150, step: 5, value: 0, en: 'Your ability haste', fr: 'Votre accélération de compétence'}],
      run(v) {
        const cd = 10 * 100 / (100 + v.ah);
        return {
          rows: [
            {en: 'Cooldown of a 10-second ability', fr: 'Délai d\'un sort de 10 secondes', value: cd, max: 10, unit: ' s'},
            {en: 'Casts per minute', fr: 'Lancers par minute', value: 60 / cd, max: 15, strong: true},
          ],
          note: (f) => ({
            en: `Each point of haste adds 1% more casts: here ${f(v.ah, 0)}% more than with no haste, for a ${f(100 - cd * 10, 0)}% shorter cooldown.`,
            fr: `Chaque point d'accélération ajoute 1 % de lancers : ici ${f(v.ah, 0)} % de plus que sans accélération, pour un délai ${f(100 - cd * 10, 0)} % plus court.`,
          }),
        };
      },
    },
    ms: {
      inputs: [{key: 'ms', min: 300, max: 700, step: 5, value: 450, en: 'Move speed before soft caps', fr: 'Vitesse avant les plafonds'}],
      run(v) {
        const ms = Eng.capMoveSpeed(v.ms);
        return {
          rows: [{en: 'Move speed you get', fr: 'Vitesse obtenue', value: ms, max: 700, strong: true}],
          note: (f) => (v.ms > 415
            ? {en: `${f(v.ms - ms, 0)} speed lost to the soft caps.`, fr: `${f(v.ms - ms, 0)} de vitesse perdue à cause des plafonds.`}
            : {en: 'Below 415, every point counts in full.', fr: 'Sous 415, chaque point compte en entier.'}),
        };
      },
    },
    heal: {
      inputs: [
        {key: 'dmg', min: 100, max: 2000, step: 50, value: 1000, en: 'Damage you deal', fr: 'Dégâts que vous infligez'},
        {key: 'ls', min: 0, max: 40, step: 1, value: 10, unit: '%', en: 'Life steal or omnivamp', fr: 'Vol de vie ou omnivampirisme'},
      ],
      run(v, rules) {
        const gw = Math.max(0, ...Object.values(rules.grievousWounds || {})), heal = v.dmg * v.ls / 100;
        return {
          rows: [
            {en: 'You heal', fr: 'Vous vous soignez de', value: heal, max: 800, strong: true},
            {en: 'Against Grievous Wounds', fr: 'Contre les Blessures graves', value: heal * (1 - gw), max: 800},
          ],
          note: () => ({
            en: `Grievous Wounds (from items like Executioner's Calling) cut healing by ${Math.round(gw * 100)}%. Healing above your maximum health is lost.`,
            fr: `Les Blessures graves (d'objets comme la Marque du bourreau) réduisent les soins de ${Math.round(gw * 100)} %. Les soins au-delà de vos PV max sont perdus.`,
          }),
        };
      },
    },
    levels: {
      inputs: [{key: 'level', min: 1, max: 18, step: 1, value: 9, en: 'Champion level', fr: 'Niveau du champion'}],
      run(v) {
        const share = 100 * Eng.growth(v.level) / Eng.growth(18);
        return {
          rows: [
            {en: 'Armor gained from levels (4 per level)', fr: 'Armure gagnée par les niveaux (4 par niveau)', value: 4 * Eng.growth(v.level), max: 68},
            {en: 'Share of the level-18 gain', fr: 'Part du gain du niveau 18', value: share, max: 100, unit: '%', strong: true},
          ],
          note: (f) => ({
            en: `Level ${v.level}: ${f(share, 0)}% of what this stat gains by level 18, after ${f(100 * (v.level - 1) / 17, 0)}% of the level-ups.`,
            fr: `Niveau ${v.level} : ${f(share, 0)} % de ce que cette stat gagne jusqu'au niveau 18, après ${f(100 * (v.level - 1) / 17, 0)} % des montées de niveau.`,
          }),
        };
      },
    },
    damageTypes: {
      inputs: [
        {key: 'hp', min: 500, max: 5000, step: 100, value: 2000, en: 'Enemy health', fr: 'PV adverses'},
        {key: 'armor', min: 0, max: 300, step: 5, value: 100, en: 'Enemy armor', fr: 'Armure adverse'},
      ],
      run(v) {
        const target = {total: {armor: v.armor}}, none = {total: {}};
        return {
          rows: [
            {en: '300 physical damage', fr: '300 dégâts physiques', value: Eng.mitigate(300, 'physical', none, target), max: 500},
            {en: '300 true damage', fr: '300 dégâts bruts', value: 300, max: 500},
            {en: '10% of max health, physical', fr: '10 % des PV max, physiques', value: Eng.mitigate(v.hp / 10, 'physical', none, target), max: 500, strong: true},
          ],
          note: (f) => ({
            en: `True damage ignores armor. Damage based on max health grows with the target: here 10% is ${f(v.hp / 10, 0)} before armor.`,
            fr: `Les dégâts bruts ignorent l'armure. Les dégâts en % des PV max grandissent avec la cible : ici 10 % font ${f(v.hp / 10, 0)} avant l'armure.`,
          }),
        };
      },
    },
    shred: {
      inputs: [
        {key: 'armor', min: 0, max: 300, step: 5, value: 150, en: 'Enemy armor', fr: 'Armure adverse'},
        {key: 'shred', min: 0, max: 30, step: 6, value: 30, unit: '%', en: 'Armor shred (Black Cleaver)', fr: 'Réduction d\'armure (Couperet noir)'},
      ],
      run(v) {
        const target = {total: {armor: v.armor}}, ally = {total: {}};
        const before = Eng.mitigate(200, 'physical', ally, target), after = Eng.mitigate(200, 'physical', ally, target, {armor: v.shred / 100, mr: 0});
        return {
          rows: [
            {en: 'A teammate\'s hit (of 200), no shred', fr: 'Coup d\'un allié (sur 200), sans réduction', value: before, max: 200},
            {en: 'The same hit with your shred', fr: 'Le même coup avec votre réduction', value: after, max: 200, strong: true},
          ],
          note: (f) => ({
            en: `Your shred makes every teammate's physical damage ${f(100 * after / before - 100, 0)}% stronger on this target. Armor penetration would only help you.`,
            fr: `Votre réduction rend les dégâts physiques de chaque allié ${f(100 * after / before - 100, 0)} % plus forts sur cette cible. La pénétration d'armure n'aiderait que vous.`,
          }),
        };
      },
    },
    ap: {
      inputs: [
        {key: 'ap', min: 0, max: 800, step: 10, value: 100, en: 'Your ability power', fr: 'Votre puissance'},
        {key: 'mr', min: 0, max: 200, step: 5, value: 50, en: 'Enemy magic resist', fr: 'Résistance magique adverse'},
      ],
      run(v) {
        const raw = 80 + 0.6 * v.ap, dealt = Eng.mitigate(raw, 'magic', {total: {}}, {total: {mr: v.mr}});
        return {
          rows: [
            {en: 'Spell damage before magic resist', fr: 'Dégâts du sort avant la résistance', value: raw, max: 600},
            {en: 'Spell damage dealt', fr: 'Dégâts du sort infligés', value: dealt, max: 600, strong: true},
          ],
          note: (f) => ({
            en: `A spell dealing 80 magic damage plus 60% of your AP. Here your AP adds ${f(0.6 * v.ap, 0)} of its ${f(raw, 0)} damage, before magic resist.`,
            fr: `Un sort de 80 dégâts magiques plus 60 % de votre AP. Ici votre AP en ajoute ${f(0.6 * v.ap, 0)} sur ${f(raw, 0)}, avant la résistance.`,
          }),
        };
      },
    },
    tenacity: {
      inputs: [
        {key: 'a', min: 0, max: 60, step: 5, value: 30, unit: '%', en: 'First source', fr: 'Première source'},
        {key: 'b', min: 0, max: 60, step: 5, value: 20, unit: '%', en: 'Second source', fr: 'Deuxième source'},
      ],
      run(v) {
        const total = 100 - (100 - v.a) * (100 - v.b) / 100;
        return {
          rows: [
            {en: 'Your tenacity', fr: 'Votre ténacité', value: total, max: 100, unit: '%'},
            {en: 'A 2-second stun lasts', fr: 'Un étourdissement de 2 secondes dure', value: 2 * (1 - total / 100), max: 2, digits: 2, unit: ' s', strong: true},
          ],
          note: (f) => ({
            en: `Added up, the two sources would give ${f(Math.min(100, v.a + v.b), 0)}%. Each one shortens what the other leaves, so you get ${f(total, 0)}%.`,
            fr: `Additionnées, les deux sources donneraient ${f(Math.min(100, v.a + v.b), 0)} %. Chacune raccourcit ce que l'autre laisse : vous avez ${f(total, 0)} %.`,
          }),
        };
      },
    },
    hsp: {
      inputs: [
        {key: 'heal', min: 50, max: 800, step: 10, value: 300, en: 'Heal or shield of your ability', fr: 'Soin ou bouclier de votre sort'},
        {key: 'hsp', min: 0, max: 50, step: 1, value: 15, unit: '%', en: 'Heal and shield power', fr: 'Puissance des soins et boucliers'},
      ],
      run(v) {
        const given = v.heal * (1 + v.hsp / 100);
        return {
          rows: [{en: 'You give', fr: 'Vous donnez', value: given, max: 1200, strong: true}],
          note: (f) => ({
            en: `${f(given - v.heal, 0)} more health or shield on every cast, for you or the ally you target.`,
            fr: `${f(given - v.heal, 0)} PV ou bouclier en plus à chaque lancer, pour vous ou l'allié ciblé.`,
          }),
        };
      },
    },
    hpregen: regen('hp'),
    mpregen: regen('mp'),
  };

  // Stat cards by group. "with": how the stat works with others. "wiki": page on the LoL Wiki.
  // "counter": what beats it; "items": item ids (or 'gw': the Grievous Wounds items), "see": other cards.
  const GROUPS = [
    {en: 'Basic attacks', fr: 'Attaques de base', stats: [
      {key: 'ad', wiki: 'Attack_damage', example: 'as',
        what: {en: 'The damage of your basic attacks. Many abilities also deal extra damage based on it (their "AD ratio").',
          fr: 'Les dégâts de vos attaques de base. Beaucoup de sorts infligent aussi des dégâts en plus selon elle (leur « ratio AD »).'},
        with: [
          {en: 'Attack speed: more attacks per second, each one dealing your AD.', fr: 'Vitesse d\'attaque : plus d\'attaques par seconde, chacune infligeant votre AD.'},
          {en: 'Critical strikes multiply it.', fr: 'Les coups critiques la multiplient.'},
          {en: 'It is physical damage: the enemy\'s armor reduces it.', fr: 'Ce sont des dégâts physiques : l\'armure adverse les réduit.'},
        ],
        counter: [{en: 'Armor: it reduces physical damage.', fr: 'L\'armure : elle réduit les dégâts physiques.', see: ['armor']}]},
      {key: 'as', wiki: 'Attack_speed', example: 'as',
        what: {en: 'How many basic attacks you make per second. Bonus attack speed is a percentage of your champion\'s own attack speed, and it is capped at 2.5 attacks per second for most champions.',
          fr: 'Le nombre d\'attaques de base par seconde. La vitesse d\'attaque en plus est un pourcentage de celle de votre champion, plafonnée à 2,5 attaques par seconde pour la plupart des champions.'},
        with: [
          {en: 'Attack damage and critical strikes: each extra attack deals them again.', fr: 'Dégâts d\'attaque et coups critiques : chaque attaque en plus les inflige à nouveau.'},
          {en: 'On-hit effects and life steal trigger on every attack.', fr: 'Les effets à l\'impact et le vol de vie se déclenchent à chaque attaque.'},
        ],
        counter: [{en: 'Lower their attack speed by 20%:', fr: 'Réduire leur vitesse d\'attaque de 20 % :', items: ['3110']},
          {en: 'Take 10% less damage from basic attacks:', fr: 'Subir 10 % de dégâts en moins des attaques de base :', items: ['3047']}]},
      {key: 'crit', wiki: 'Critical_strike', example: 'crit',
        what: {en: 'The chance for a basic attack to be a critical strike, which deals 175% damage. Capped at 100%. Most abilities can\'t crit.',
          fr: 'La chance qu\'une attaque de base soit un coup critique, qui inflige 175 % des dégâts. Plafonnée à 100 %. La plupart des sorts ne peuvent pas faire de critique.'},
        with: [
          {en: 'Critical damage makes each crit bigger, but only matters if you have crit chance.', fr: 'Les dégâts critiques rendent chaque critique plus fort, mais ne comptent que si vous avez des chances de critique.'},
          {en: 'Attack damage: a crit multiplies it.', fr: 'Dégâts d\'attaque : un critique les multiplie.'},
        ],
        counter: [{en: 'Take 30% less damage from critical strikes:', fr: 'Subir 30 % de dégâts en moins des coups critiques :', items: ['3143']},
          {en: 'Armor: crits are physical damage.', fr: 'L\'armure : les critiques sont des dégâts physiques.', see: ['armor']}]},
      {key: 'critDmg', wiki: 'Critical_strike', example: 'crit',
        what: {en: 'Raises the damage of your critical strikes above 175%.', fr: 'Augmente les dégâts de vos coups critiques au-delà de 175 %.'},
        with: [{en: 'Useless without critical strike chance (see the example).', fr: 'Inutile sans chances de coup critique (voir l\'exemple).'}],
        counter: [{en: 'Take 30% less damage from critical strikes:', fr: 'Subir 30 % de dégâts en moins des coups critiques :', items: ['3143']}]},
      {key: 'range', wiki: 'Range',
        what: {en: 'How far away your basic attacks reach. Ranged champions can hit from a distance; melee champions must stay close.',
          fr: 'La distance à laquelle portent vos attaques de base. Les champions à distance frappent de loin ; ceux de mêlée doivent rester au contact.'},
        with: [{en: 'Move speed: helps you stay at the right distance.', fr: 'Vitesse de déplacement : aide à rester à la bonne distance.'}],
        counter: [{en: 'Move speed and slows: reach them, or keep them from walking away.', fr: 'Vitesse de déplacement et ralentissements : les rattraper, ou les empêcher de reculer.', see: ['ms']}]},
    ]},
    {en: 'Abilities', fr: 'Sorts', stats: [
      {key: 'ap', wiki: 'Ability_power', example: 'ap',
        what: {en: 'Makes abilities stronger: each ability adds a share of your AP (its "AP ratio") to its damage, and often to its heals and shields.',
          fr: 'Renforce les sorts : chaque sort ajoute une part de votre AP (son « ratio AP ») à ses dégâts, et souvent à ses soins et boucliers.'},
        with: [
          {en: 'Most AP damage is magic damage: the enemy\'s magic resist reduces it.', fr: 'La plupart des dégâts AP sont magiques : la résistance magique adverse les réduit.'},
          {en: 'Ability haste: more casts, so more of that damage.', fr: 'Accélération de compétence : plus de lancers, donc plus de ces dégâts.'},
          {en: 'It does nothing for champions whose abilities don\'t scale with AP.', fr: 'Elle ne sert à rien aux champions dont les sorts n\'en dépendent pas.'},
        ],
        counter: [{en: 'Magic resist: it reduces magic damage.', fr: 'La résistance magique : elle réduit les dégâts magiques.', see: ['mr']},
          {en: 'Spell shields and magic shields:', fr: 'Boucliers anti-sort et anti-magie :', items: ['3102', '3156', '2504']}]},
      {key: 'ah', wiki: 'Ability_haste', example: 'ah',
        what: {en: 'Shortens your ability cooldowns. 100 ability haste halves them, so you cast twice as often.',
          fr: 'Réduit le délai de récupération de vos sorts. 100 d\'accélération le divisent par deux : vous lancez deux fois plus souvent.'},
        with: [
          {en: 'Every point is worth the same: the cooldown gains shrink, but the extra casts don\'t.', fr: 'Chaque point vaut autant : le délai gagné diminue, mais les lancers en plus non.'},
          {en: 'AP, AD and mana: more casts means more damage but also more mana spent.', fr: 'AP, AD et mana : plus de lancers, c\'est plus de dégâts mais aussi plus de mana dépensé.'},
        ]},
      {key: 'mp', wiki: 'Mana',
        what: {en: 'What most champions spend to cast abilities. Some champions use energy or nothing instead.',
          fr: 'Ce que la plupart des champions dépensent pour lancer leurs sorts. Certains utilisent de l\'énergie, ou rien.'},
        with: [
          {en: 'Mana regeneration refills it.', fr: 'La régénération de mana la remplit.'},
          {en: 'Some items turn mana into other stats (Archangel\'s Staff gives AP from mana).', fr: 'Certains objets transforment le mana en autres stats (le Bâton de l\'archange donne de l\'AP selon le mana).'},
        ]},
      {key: 'mpregen', wiki: 'Mana_regeneration', example: 'mpregen',
        what: {en: 'Mana you get back every 5 seconds, even in a fight.', fr: 'Le mana récupéré toutes les 5 secondes, même en combat.'},
        with: [{en: 'Base mana regen % multiplies only your champion\'s own regen, not the regen from items.',
          fr: 'La régénération de mana de base % multiplie seulement celle de votre champion, pas celle des objets.'}]},
    ]},
    {en: 'Getting through defenses', fr: 'Percer les défenses', stats: [
      {key: 'lethality', wiki: 'Lethality', example: 'armor',
        what: {en: 'Ignores a fixed amount of the enemy\'s armor. 18 lethality against 50 armor removes a third of it; against 250 armor, much less.',
          fr: 'Ignore une quantité fixe de l\'armure adverse. 18 de létalité contre 50 d\'armure en retire un tiers ; contre 250, beaucoup moins.'},
        with: [
          {en: 'Best against low-armor targets (mages, marksmen).', fr: 'Idéale contre les cibles à peu d\'armure (mages, tireurs).'},
          {en: 'Applied after armor penetration %. It can\'t bring armor below 0.', fr: 'Appliquée après la pénétration d\'armure %. Elle ne descend pas l\'armure sous 0.'},
        ],
        counter: [{en: 'Building armor: a fixed amount ignored matters less when there is more armor.', fr: 'Acheter de l\'armure : une quantité fixe ignorée compte moins quand il y en a plus.', see: ['armor']},
          {en: 'Health: lethality does nothing to it.', fr: 'Les PV : la létalité n\'y change rien.', see: ['hp']}]},
      {key: 'armorPenPct', wiki: 'Armor_penetration', example: 'armor',
        what: {en: 'Ignores a percentage of the enemy\'s armor. The more armor they have, the more it removes.',
          fr: 'Ignore un pourcentage de l\'armure adverse. Plus l\'adversaire en a, plus elle en retire.'},
        with: [
          {en: 'Best against tanks.', fr: 'Idéale contre les tanks.'},
          {en: 'Applied before lethality.', fr: 'Appliquée avant la létalité.'},
        ],
        counter: [{en: 'Health: penetration does nothing to it.', fr: 'Les PV : la pénétration n\'y change rien.', see: ['hp']}]},
      {key: 'magicPen', wiki: 'Magic_penetration', example: 'mr',
        what: {en: 'Ignores a fixed amount of the enemy\'s magic resist, like lethality does for armor.',
          fr: 'Ignore une quantité fixe de la résistance magique adverse, comme la létalité pour l\'armure.'},
        with: [
          {en: 'Best against low magic resist targets. Applied after magic penetration %.', fr: 'Idéale contre les cibles à peu de résistance magique. Appliquée après la pénétration magique %.'},
        ],
        counter: [{en: 'Building magic resist: a fixed amount ignored matters less when there is more of it.', fr: 'Acheter de la résistance magique : une quantité fixe ignorée compte moins quand il y en a plus.', see: ['mr']},
          {en: 'Health: penetration does nothing to it.', fr: 'Les PV : la pénétration n\'y change rien.', see: ['hp']}]},
      {key: 'magicPenPct', wiki: 'Magic_penetration', example: 'mr',
        what: {en: 'Ignores a percentage of the enemy\'s magic resist.', fr: 'Ignore un pourcentage de la résistance magique adverse.'},
        with: [
          {en: 'Best against tanks. Applied before flat magic penetration.', fr: 'Idéale contre les tanks. Appliquée avant la pénétration magique fixe.'},
        ],
        counter: [{en: 'Health: penetration does nothing to it.', fr: 'Les PV : la pénétration n\'y change rien.', see: ['hp']}]},
    ]},
    {en: 'Defense', fr: 'Défense', stats: [
      {key: 'hp', wiki: 'Health', example: 'ehp',
        what: {en: 'How much damage you can take before dying.', fr: 'La quantité de dégâts que vous pouvez encaisser avant de mourir.'},
        with: [
          {en: 'Armor and magic resist multiply it: 2000 health with 100 armor takes 4000 physical damage to kill.',
            fr: 'L\'armure et la résistance magique la multiplient : 2000 PV avec 100 d\'armure demandent 4000 dégâts physiques pour mourir.'},
          {en: 'Health and armor help each other, so buying some of both is better than only one.',
            fr: 'PV et armure se renforcent l\'un l\'autre : en acheter un peu des deux vaut mieux qu\'un seul.'},
          {en: 'Damage based on maximum health hurts high-health champions more.', fr: 'Les dégâts en % des PV max font plus mal aux champions à beaucoup de PV.'},
        ],
        counter: [{en: 'Damage based on the target\'s health:', fr: 'Les dégâts selon les PV de la cible :', items: ['3153', '6653'], see: ['damageTypes']}]},
      {key: 'armor', wiki: 'Armor', example: 'armor',
        what: {en: 'Reduces the physical damage you take: basic attacks and most AD abilities. 100 armor means you take half the damage.',
          fr: 'Réduit les dégâts physiques subis : attaques de base et la plupart des sorts AD. 100 d\'armure, et vous subissez moitié moins.'},
        with: [
          {en: 'Health: armor multiplies it (see the example under Health).', fr: 'PV : l\'armure les multiplie (voir l\'exemple sous PV).'},
          {en: 'The attacker\'s armor penetration % then lethality reduce the armor that counts.', fr: 'La pénétration d\'armure % puis la létalité de l\'attaquant réduisent l\'armure qui compte.'},
          {en: 'Each point adds the same: 1% of your health against physical damage.', fr: 'Chaque point ajoute autant : 1 % de vos PV face aux dégâts physiques.'},
          {en: 'Armor can go below 0 (some abilities remove a fixed amount): the target then takes more than full damage, 17% more at -20 armor.',
            fr: 'L\'armure peut passer sous 0 (certains sorts en retirent une quantité fixe) : la cible subit alors plus que les dégâts entiers, 17 % de plus à -20 d\'armure.'},
        ],
        counter: [{en: 'Lethality, armor penetration % and armor shred.', fr: 'La létalité, la pénétration d\'armure % et la réduction d\'armure.', see: ['lethality', 'armorPenPct', 'shred']},
          {en: 'Magic and true damage: armor does nothing against them.', fr: 'Les dégâts magiques et bruts : l\'armure n\'y peut rien.'}]},
      {key: 'mr', wiki: 'Magic_resistance', example: 'mr',
        what: {en: 'Like armor, against magic damage: most AP abilities. 100 magic resist means you take half the damage.',
          fr: 'Comme l\'armure, contre les dégâts magiques : la plupart des sorts AP. 100 de résistance, et vous subissez moitié moins.'},
        with: [
          {en: 'Health: magic resist multiplies it, like armor does.', fr: 'PV : la résistance magique les multiplie, comme l\'armure.'},
          {en: 'The attacker\'s magic penetration % then flat magic penetration reduce it.', fr: 'La pénétration magique % puis fixe de l\'attaquant la réduisent.'},
        ],
        counter: [{en: 'Flat and % magic penetration.', fr: 'La pénétration magique fixe et %.', see: ['magicPen', 'magicPenPct']},
          {en: 'Physical and true damage: magic resist does nothing against them.', fr: 'Les dégâts physiques et bruts : la résistance magique n\'y peut rien.'}]},
      {key: 'tenacity', wiki: 'Tenacity', example: 'tenacity',
        what: {en: 'Shortens most crowd control on you (stuns, slows, roots). It doesn\'t shorten knock-ups or suppression.',
          fr: 'Raccourcit la plupart des contrôles subis (étourdissements, ralentissements, immobilisations). Pas les projections ni les suppressions.'},
        with: [
          {en: 'Mercury\'s Treads, Sterak\'s Gage and the Tenacity stat shard give it.', fr: 'Les Sandales de Mercure, le Gage de Sterak et le fragment de Ténacité en donnent.'},
          {en: 'Sources multiply instead of adding up: 30% and 20% make 44%, not 50%.', fr: 'Les sources se multiplient au lieu de s\'additionner : 30 % et 20 % font 44 %, pas 50 %.'},
        ],
        counter: [{en: 'Knock-ups and suppression: tenacity doesn\'t shorten them.', fr: 'Projections et suppressions : la ténacité ne les raccourcit pas.'}]},
      {key: 'hpregen', wiki: 'Health_regeneration', example: 'hpregen',
        what: {en: 'Health you get back every 5 seconds.', fr: 'Les PV récupérés toutes les 5 secondes.'},
        with: [{en: 'Base health regen % multiplies only your champion\'s own regen, not the regen from items.',
          fr: 'La régénération de PV de base % multiplie seulement celle de votre champion, pas celle des objets.'}],
        counter: [{en: 'Grievous Wounds cut regen too:', fr: 'Les Blessures graves réduisent aussi la régénération :', items: 'gw'}]},
    ]},
    {en: 'Healing', fr: 'Soins', stats: [
      {key: 'lifesteal', wiki: 'Life_steal', example: 'heal',
        what: {en: 'Heals you for a percentage of the damage your basic attacks deal (after the enemy\'s armor).',
          fr: 'Vous soigne d\'un pourcentage des dégâts de vos attaques de base (après l\'armure adverse).'},
        with: [
          {en: 'Attack damage, attack speed and crits: more damage, more healing.', fr: 'Dégâts d\'attaque, vitesse d\'attaque et critiques : plus de dégâts, plus de soins.'},
          {en: 'Grievous Wounds cut it.', fr: 'Les Blessures graves le réduisent.'},
        ],
        counter: [{en: 'Grievous Wounds:', fr: 'Les Blessures graves :', items: 'gw'},
          {en: 'Armor: less damage taken means less healing for them.', fr: 'L\'armure : moins de dégâts subis, c\'est moins de soins pour eux.', see: ['armor']}]},
      {key: 'omnivamp', wiki: 'Omnivamp', example: 'heal',
        what: {en: 'Like life steal, but heals from all the damage you deal, abilities included.',
          fr: 'Comme le vol de vie, mais soigne sur tous vos dégâts, sorts compris.'},
        with: [{en: 'Grievous Wounds cut it too.', fr: 'Les Blessures graves le réduisent aussi.'}],
        counter: [{en: 'Grievous Wounds:', fr: 'Les Blessures graves :', items: 'gw'}]},
      {key: 'hsp', wiki: 'Heal_and_shield_power', example: 'hsp',
        what: {en: 'Makes the heals and shields you give stronger, on yourself and on allies. Here, it boosts your champion\'s own healing abilities.',
          fr: 'Renforce les soins et boucliers que vous donnez, à vous et à vos alliés. Ici, il renforce les sorts de soin de votre champion.'},
        with: [{en: 'Mostly for supports and champions with healing abilities.', fr: 'Surtout pour les supports et les champions qui ont des sorts de soin.'}],
        counter: [{en: 'Grievous Wounds cut the heals:', fr: 'Les Blessures graves réduisent les soins :', items: 'gw'},
          {en: 'Shields shrink when you damage the target:', fr: 'Les boucliers rétrécissent quand vous blessez la cible :', items: ['6695']}]},
    ]},
    {en: 'Movement', fr: 'Déplacement', stats: [
      {key: 'ms', wiki: 'Movement_speed', example: 'ms',
        what: {en: 'How fast you move. Above 415, only 80% of the extra speed counts, and above 490 only 50%.',
          fr: 'La vitesse à laquelle vous vous déplacez. Au-delà de 415, seuls 80 % de la vitesse en plus comptent, et 50 % au-delà de 490.'},
        with: [{en: 'Move speed % multiplies flat move speed (from boots), so buy boots first.',
          fr: 'La vitesse de déplacement % multiplie la vitesse fixe (des bottes) : achetez les bottes d\'abord.'}],
        counter: [{en: 'Slows:', fr: 'Les ralentissements :', items: ['3116', '3143']}]},
    ]},
    {en: 'Game mechanics', fr: 'Mécaniques du jeu', stats: [
      {key: 'levels', wiki: 'Champion_statistic', example: 'levels', title: {en: 'Level growth', fr: 'Progression par niveau'},
        what: {en: 'Each level raises your champion\'s base stats (health, armor, AD…), but not evenly: early levels give less than late ones.',
          fr: 'Chaque niveau augmente les stats de base de votre champion (PV, armure, AD…), mais pas de façon égale : les premiers niveaux donnent moins que les derniers.'},
        with: [
          {en: 'Only base stats grow with levels; items and runes give the same at every level.', fr: 'Seules les stats de base grandissent avec les niveaux ; objets et runes donnent autant à tout niveau.'},
          {en: 'Being one or two levels behind matters more late in the game.', fr: 'Avoir un ou deux niveaux de retard compte plus en fin de partie.'},
        ]},
      {key: 'damageTypes', wiki: 'Damage', example: 'damageTypes', title: {en: 'Damage types', fr: 'Types de dégâts'},
        what: {en: 'Physical damage is reduced by armor, magic damage by magic resist, and true damage by nothing. Some damage is a percentage of the target\'s maximum, current or missing health.',
          fr: 'Les dégâts physiques sont réduits par l\'armure, les magiques par la résistance magique, et les dégâts bruts par rien. Certains dégâts sont un pourcentage des PV max, actuels ou manquants de la cible.'},
        with: [
          {en: 'Max health damage is strong against tanks; missing health damage finishes off low targets.', fr: 'Les dégâts en % des PV max sont forts contre les tanks ; ceux en % des PV manquants achèvent les cibles affaiblies.'},
          {en: 'The calculator shows each spell\'s type (physical, magic, true) in the combo.', fr: 'Le calculateur indique le type de chaque sort (physique, magique, brut) dans le combo.'},
        ]},
      {key: 'shred', wiki: 'Armor_reduction', example: 'shred', title: {en: 'Armor shred', fr: 'Réduction d\'armure'},
        what: {en: 'Lowers the target\'s armor itself, for a few seconds. Black Cleaver does it: 6% per hit, up to 30%.',
          fr: 'Baisse l\'armure de la cible elle-même, pendant quelques secondes. Le Couperet noir le fait : 6 % par coup, jusqu\'à 30 %.'},
        with: [
          {en: 'Unlike armor penetration, it helps every teammate hitting that target.', fr: 'Contrairement à la pénétration d\'armure, elle aide chaque allié qui frappe cette cible.'},
          {en: 'Applied before penetration: shred first, then armor penetration %, then lethality.', fr: 'Appliquée avant la pénétration : réduction d\'abord, puis pénétration d\'armure %, puis létalité.'},
        ]},
    ]},
  ];

  // Sources tab. {patch} and {minor} are replaced with the current patch ("16.23.1", "16.23").
  const SOURCES = [
    {title: {en: 'Game data', fr: 'Données du jeu'},
      text: {en: 'Champions (base stats and how they grow per level), items, runes, and their English and French names. Downloaded again for every patch.',
        fr: 'Champions (stats de base et leur progression par niveau), objets, runes, et leurs noms en anglais et en français. Retéléchargés à chaque patch.'},
      links: [
        {en: 'Data Dragon, by Riot Games', fr: 'Data Dragon, par Riot Games', url: 'https://developer.riotgames.com/docs/lol#data-dragon'},
        {en: 'Champion file for this patch', fr: 'Fichier des champions de ce patch', url: 'https://ddragon.leagueoflegends.com/cdn/{patch}/data/en_US/champion.json'},
        {en: 'Item file for this patch', fr: 'Fichier des objets de ce patch', url: 'https://ddragon.leagueoflegends.com/cdn/{patch}/data/en_US/item.json'},
      ]},
    {title: {en: 'Spell and effect numbers', fr: 'Chiffres des sorts et effets'},
      text: {en: 'Exact numbers for spells, item passives and rune shards, read from the game files.',
        fr: 'Les chiffres exacts des sorts, des passifs d\'objets et des fragments de runes, lus dans les fichiers du jeu.'},
      links: [
        {en: 'CommunityDragon', fr: 'CommunityDragon', url: 'https://www.communitydragon.org/'},
        {en: 'Game files for this patch', fr: 'Fichiers du jeu de ce patch', url: 'https://raw.communitydragon.org/{minor}/game/'},
      ]},
    {title: {en: 'Champion roles', fr: 'Rôles des champions'},
      text: {en: 'Riot\'s files don\'t say where a champion is played. The usual roles (Top, Jungle, Mid, Bot, Support) come from a community dataset, downloaded again for every patch.',
        fr: 'Les fichiers de Riot n\'indiquent pas où un champion est joué. Les rôles habituels (Haut, Jungle, Milieu, Bas, Support) viennent de données communautaires, retéléchargées à chaque patch.'},
      links: [
        {en: 'Meraki Analytics static data', fr: 'Données statiques de Meraki Analytics', url: 'https://github.com/meraki-analytics/lolstaticdata'},
        {en: 'Champion file', fr: 'Fichier des champions', url: 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json'},
      ]},
    {title: {en: 'Hand-checked rules', fr: 'Règles vérifiées à la main'},
      text: {en: 'What the files don\'t state clearly is written by hand and checked each patch: item passives that change stats, caps, critical damage, Grievous Wounds.',
        fr: 'Ce que les fichiers n\'indiquent pas clairement est écrit à la main et vérifié à chaque patch : passifs d\'objets qui changent les stats, plafonds, dégâts critiques, Blessures graves.'},
      links: [{en: 'rules.py on GitHub', fr: 'rules.py sur GitHub', url: 'https://github.com/GagGeo/lol-build-calculator/blob/main/rules.py'}]},
    {title: {en: 'Game formulas', fr: 'Formules du jeu'},
      text: {en: 'How stats combine (damage after armor, level growth, soft caps…) follows the game mechanics as documented on the League of Legends Wiki (in English).',
        fr: 'La façon dont les stats se combinent (dégâts après armure, progression par niveau, plafonds…) suit les mécaniques du jeu décrites sur le League of Legends Wiki (en anglais).'},
      links: [
        ['Champion_statistic', 'Champion statistics', 'Statistiques des champions'], ['Armor', 'Armor', 'Armure'],
        ['Magic_resistance', 'Magic resistance', 'Résistance magique'], ['Armor_penetration', 'Armor penetration', 'Pénétration d\'armure'],
        ['Lethality', 'Lethality', 'Létalité'], ['Magic_penetration', 'Magic penetration', 'Pénétration magique'],
        ['Critical_strike', 'Critical strike', 'Coup critique'], ['Attack_speed', 'Attack speed', 'Vitesse d\'attaque'],
        ['Ability_haste', 'Ability haste', 'Accélération de compétence'], ['Movement_speed', 'Movement speed', 'Vitesse de déplacement'],
        ['Life_steal', 'Life steal', 'Vol de vie'], ['Omnivamp', 'Omnivamp', 'Omnivampirisme'],
        ['Grievous_Wounds', 'Grievous Wounds', 'Blessures graves'],
      ].map(([page, en, fr]) => ({en, fr, url: WIKI + page}))},
    {title: {en: 'Legal', fr: 'Mentions légales'},
      text: {en: 'This site uses Riot Games data under Riot\'s policy for fan projects. It is free and not endorsed by Riot Games.',
        fr: 'Ce site utilise les données de Riot Games selon la politique de Riot pour les projets de fans. Il est gratuit et n\'est pas approuvé par Riot Games.'},
      links: [{en: 'Riot Games legal policies', fr: 'Politiques légales de Riot Games', url: 'https://www.riotgames.com/en/legal'}]},
  ];

  // Classes tab, one card per Riot class (Data Dragon tags). "keyStats": weights for ranking items (Engine.classItems);
  // "strong"/"weak": other classes it tends to beat or lose to, with why.
  const CLASSES = [
    {tag: 'Fighter', keyStats: {ad: 2, hp: 2, ah: 1, omnivamp: 1},
      what: {en: 'Fighters deal steady damage up close and can take a beating. They win long fights rather than one-shot.',
        fr: 'Les combattants infligent des dégâts réguliers au contact et encaissent bien. Ils gagnent les combats longs plutôt qu\'en un coup.'},
      pros: [{en: 'Good damage and good health at once.', fr: 'De bons dégâts et de bons PV à la fois.'},
        {en: 'Strong in long fights and duels, often with healing.', fr: 'Forts dans les combats longs et les duels, souvent avec des soins.'}],
      cons: [{en: 'Must walk up to the target: easy to kite with slows and range.', fr: 'Doivent aller au contact : faciles à tenir à distance avec ralentissements et portée.'},
        {en: 'Fall behind against Grievous Wounds when they rely on healing.', fr: 'Souffrent des Blessures graves quand ils comptent sur les soins.'}],
      strong: [{tag: 'Assassin', en: 'enough health to survive their burst', fr: 'assez de PV pour survivre à leur explosion'},
        {tag: 'Tank', en: 'they keep dealing damage while the tank can\'t', fr: 'ils continuent de frapper quand le tank ne peut pas'}],
      weak: [{tag: 'Marksman', en: 'shot from range while walking up', fr: 'touchés de loin en approchant'},
        {tag: 'Mage', en: 'slowed and poked before reaching them', fr: 'ralentis et harcelés avant de les atteindre'}]},
    {tag: 'Tank', keyStats: {hp: 2, armor: 2, mr: 2, ah: 1},
      what: {en: 'Tanks soak damage and lock enemies down with crowd control so their team can hit them.',
        fr: 'Les tanks absorbent les dégâts et immobilisent les ennemis pour que leur équipe puisse frapper.'},
      pros: [{en: 'Very hard to kill; they start fights and protect carries.', fr: 'Très durs à tuer ; ils lancent les combats et protègent les carrys.'},
        {en: 'Much crowd control (stuns, knock-ups, taunts).', fr: 'Beaucoup de contrôles (étourdissements, projections, provocations).'}],
      cons: [{en: 'Low damage: they rely on their team to finish kills.', fr: 'Peu de dégâts : ils comptent sur leur équipe pour tuer.'},
        {en: 'Melted late by penetration % and damage based on health.', fr: 'Fondent en fin de partie face à la pénétration % et aux dégâts en % des PV.'}],
      strong: [{tag: 'Assassin', en: 'too tanky to burst, and their crowd control stops the dive', fr: 'trop solides pour être tués d\'un coup, et leurs contrôles arrêtent le plongeon'}],
      weak: [{tag: 'Marksman', en: 'steady damage, penetration % and on-hit health damage', fr: 'dégâts réguliers, pénétration % et dégâts en % des PV'},
        {tag: 'Mage', en: 'magic penetration % and health-based burns (Liandry\'s)', fr: 'pénétration magique % et brûlures en % des PV (Liandry)'}]},
    {tag: 'Mage', keyStats: {ap: 3, magicPen: 2, magicPenPct: 1, ah: 1},
      what: {en: 'Mages deal magic damage with their abilities from range: burst, poke or area damage.',
        fr: 'Les mages infligent des dégâts magiques avec leurs sorts à distance : explosion, harcèlement ou zone.'},
      pros: [{en: 'High damage from a safe distance, often to several enemies.', fr: 'Beaucoup de dégâts à distance de sécurité, souvent sur plusieurs ennemis.'},
        {en: 'Much crowd control and zone control.', fr: 'Beaucoup de contrôles et de contrôle de zone.'}],
      cons: [{en: 'Fragile: little health and armor.', fr: 'Fragiles : peu de PV et d\'armure.'},
        {en: 'Weak while their abilities are on cooldown.', fr: 'Faibles quand leurs sorts sont en récupération.'}],
      strong: [{tag: 'Fighter', en: 'slows and range keep them away', fr: 'ralentissements et portée les tiennent à distance'},
        {tag: 'Tank', en: 'magic penetration % and health-based damage', fr: 'pénétration magique % et dégâts en % des PV'}],
      weak: [{tag: 'Assassin', en: 'jumped on and killed before casting', fr: 'attrapés et tués avant de lancer leurs sorts'}]},
    {tag: 'Assassin', keyStats: {ad: 2, lethality: 3, ah: 1},
      what: {en: 'Assassins jump on one fragile target, kill it in a burst, then get away. AP assassins build mage items instead.',
        fr: 'Les assassins sautent sur une cible fragile, la tuent d\'un coup, puis s\'enfuient. Les assassins AP prennent plutôt des objets de mage.'},
      pros: [{en: 'Kill mages and marksmen before they can act.', fr: 'Tuent mages et tireurs avant qu\'ils agissent.'},
        {en: 'Very mobile: dashes, blinks, stealth.', fr: 'Très mobiles : ruées, téléportations, camouflage.'}],
      cons: [{en: 'Fragile: if the burst fails, they die.', fr: 'Fragiles : si l\'explosion échoue, ils meurent.'},
        {en: 'Lethality is weak against armor: tanks shrug them off.', fr: 'La létalité est faible contre l\'armure : les tanks les ignorent.'}],
      strong: [{tag: 'Mage', en: 'low health and no escape', fr: 'peu de PV et pas de fuite'},
        {tag: 'Marksman', en: 'low health, out of position', fr: 'peu de PV, mal placés'}],
      weak: [{tag: 'Tank', en: 'too much health and armor to burst', fr: 'trop de PV et d\'armure pour les tuer d\'un coup'},
        {tag: 'Fighter', en: 'survive the burst and hit back', fr: 'survivent à l\'explosion et répliquent'}]},
    {tag: 'Marksman', keyStats: {ad: 2, as: 2, crit: 3, armorPenPct: 1},
      what: {en: 'Marksmen deal steady damage with basic attacks from range. Weak early, they carry fights late in the game.',
        fr: 'Les tireurs infligent des dégâts réguliers avec leurs attaques de base à distance. Faibles au début, ils portent les combats en fin de partie.'},
      pros: [{en: 'The highest steady damage late in the game, from range.', fr: 'Les dégâts réguliers les plus élevés en fin de partie, à distance.'},
        {en: 'Their damage keeps up against tanks (penetration %, on-hit).', fr: 'Leurs dégâts tiennent contre les tanks (pénétration %, effets à l\'impact).'}],
      cons: [{en: 'Fragile and short on escapes.', fr: 'Fragiles et avec peu de fuites.'},
        {en: 'Need many items before they are strong.', fr: 'Ont besoin de beaucoup d\'objets pour être forts.'}],
      strong: [{tag: 'Tank', en: 'steady damage that ignores much of their armor', fr: 'des dégâts réguliers qui ignorent une bonne part de leur armure'},
        {tag: 'Fighter', en: 'hit them from range as they walk up', fr: 'les touchent de loin pendant qu\'ils approchent'}],
      weak: [{tag: 'Assassin', en: 'burst before they can attack', fr: 'tués d\'un coup avant de pouvoir attaquer'}]},
    {tag: 'Support', keyStats: {hsp: 3, ah: 2, mpRegenPct: 2, ap: 1},
      what: {en: 'Supports help their team more than they deal damage: heals, shields, crowd control and vision. Riot\'s Support class covers enchanters and catchers.',
        fr: 'Les supports aident leur équipe plus qu\'ils n\'infligent de dégâts : soins, boucliers, contrôles et vision. La classe Support de Riot couvre enchanteurs et attrapeurs.'},
      pros: [{en: 'Make their carries much stronger and harder to kill.', fr: 'Rendent leurs carrys bien plus forts et plus durs à tuer.'},
        {en: 'Need few items to be useful.', fr: 'Ont besoin de peu d\'objets pour être utiles.'}],
      cons: [{en: 'Little damage of their own.', fr: 'Peu de dégâts par eux-mêmes.'},
        {en: 'Heals are cut by Grievous Wounds; shields by Serpent\'s Fang.', fr: 'Les soins sont réduits par les Blessures graves ; les boucliers par le Crochet de serpent.'}],
      strong: [{tag: 'Assassin', en: 'shields, heals and crowd control save the target', fr: 'boucliers, soins et contrôles sauvent la cible'}],
      weak: [{tag: 'Assassin', en: 'enchanters themselves are an easy kill', fr: 'les enchanteurs eux-mêmes sont faciles à tuer'},
        {tag: 'Mage', en: 'poked down before they can help', fr: 'harcelés avant de pouvoir aider'}]},
  ];

  // Items tab: counters for what an item's description mentions outside its stats.
  const ITEM_COUNTERS = {
    shield: {en: 'Its shield shrinks when you damage the holder:', fr: 'Son bouclier rétrécit quand vous blessez son porteur :', items: ['6695']},
    heal: {en: 'Its healing is cut by Grievous Wounds:', fr: 'Ses soins sont réduits par les Blessures graves :', items: 'gw'},
  };

  return {WIKI, EXAMPLES, GROUPS, SOURCES, ITEM_COUNTERS, CLASSES};
})();

if (typeof module === 'object') module.exports = GUIDE;
