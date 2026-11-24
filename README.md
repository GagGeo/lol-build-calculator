# LoL Build Calculator

**[English](#english)** | **[Français](#français)**

---

## English

### Open it

**👉 https://gaggeo.github.io/lol-build-calculator/**

Click the link. That's all: it opens in your browser (Edge, Chrome, Firefox, Safari), on Windows, Mac or a phone. There is nothing to install and no account to create.

To share it, send that link.

### What it does

- **Stats:** pick a champion, a level (1 to 18), runes and up to 6 items, and see the resulting stats. Builds the game wouldn't allow (two pairs of boots, two copies of the same legendary…) can't be picked. Open **Temporary buffs** to add an elixir, Baron, Ghost or dragon stacks.
- **Damage:** click **+ Add an enemy** and pick their champion, level, runes and items. You see what your basic attacks and spells deal to them after armor and magic resist, and the result of a full combo: "kills at step 3" or "leaves 420 HP". The same is shown in the other direction. **How to beat them** reads both combos and says what to buy against the enemy (armor or magic resist, penetration, Grievous Wounds…).
- **What to buy:** type the gold you're carrying and click **Suggest purchases**. The tool ranks what you can buy right now, including finishing an item from parts you already own, by extra damage to the enemy, by how much more of their combo you survive, or by any stat (Health, Armor, Life Steal…; no enemy needed). With no gold typed, there is no gold limit: single items, cheapest first, then the best. **Apply** puts the purchase into your items.

- **Rankings** (second tab): pick a stat, for example Health or Move Speed. You get the champions and builds (level, 6 items, rune page) that reach the most of it, 10 by default. You can also set a gold limit. **Open as You** or **Open as Enemy** loads a row into the calculator.
- **Champ Optimization** (third tab): pick a champion, a level and a stat, and optionally a gold limit and the champion's stacks. You get the build (6 items and a rune page) that reaches the most of it, its cost and all its stats, plus the next best builds. Untick an item to see the stats without it; **Item details** opens it in the Items tab.
- **Items** (fourth tab): every item, searchable, filtered by type or stat and sorted by price or gold efficiency. Click one for its stats, cost, build path, limits, what the calculator counts and its description.
- **Champions** (fifth tab): every champion with its usual roles (Top, Jungle, Mid, Bot, Support), its class, and the stats its abilities scale with best, measured with the calculator's own damage. Filter by role; **Open as You** or **Open as Enemy** loads it into the calculator.
- **Classes** (sixth tab): Riot's six classes (Fighter, Tank, Mage, Assassin, Marksman, Support): what each does, its strengths and weaknesses, which classes it beats or loses to, where it's usually played, the items and boots that fit it, and its champions whose abilities scale best.
- **Stats explained** (seventh tab): what each stat does and how it works with the others, for newer players, one sub tab per category (Basic attacks, Abilities, Defense…), with small examples you can move with sliders, what counters each stat, and a list of the items that give each stat.
- **Sources** (eighth tab): where the data and formulas come from, with links.
- In any stats table, **Show details** splits the bonus into one column per item, the runes and the champion.

The whole page switches between English and French with the button at the top right.

### How to use it

1. Under **You**, choose your champion and level. Runes and items are optional.
2. Click **+ Add an enemy** and choose who you're fighting. You can remove it again with **Remove enemy**.
3. Read **Damage to…** under each side. You can reorder or remove steps of the combo.
4. To get buying advice (this needs an enemy), type your gold in **Gold in pocket** (or leave it empty for no limit), then click **Suggest purchases** at the bottom.

When a number can't be calculated reliably, the page says **check in game** instead of guessing.

### Use it without internet (Windows)

1. Download **[this ZIP file](https://github.com/GagGeo/lol-build-calculator/archive/refs/heads/main.zip)**.
2. In your Downloads folder, **right-click the ZIP → Extract All… → Extract**. This step matters: opening the page from inside the ZIP without extracting it won't work.
3. Open the extracted folder and **double-click `index.html`**.

This offline copy doesn't update itself. Download it again after a new League patch, or just use the link above, which is always up to date.

### Updates

Every day, GitHub checks whether Riot released a new patch. When everything checks out, the website updates by itself, usually within a day of the patch. The patch number is shown at the top of the page.

### Limits

- The numbers come from Riot's game data, so they're as good as that data. Some spells and item effects can't be read reliably. The page marks them **check in game** and leaves them out of totals rather than guessing.
- Multi-hit spells are marked **per hit**: the combo counts one hit.
- The combo is a sequence of hits, not a fight simulation: no cooldowns, movement or shields. Healing counts life steal (basic attacks and on-hit), omnivamp (all damage) and your champion's own spell and passive heals, boosted by Heal and Shield Power, up to your missing health. Grievous Wounds from the enemy's items cuts it by 40%. Heals from runes and items, heals that need something outside the combo (a kill, being out of combat, a revive) and heals for allies are not counted.
- Champion passives: permanent stats (Tristana's range, Nasus's life steal, Pyke's health to AD…) are counted. A passive that deals damage is one step of the combo, counted once, whatever its trigger (marks, stacks, missing health). Temporary buffs (on kill, out of combat…) are not counted.

### For whoever maintains it

Most patches need nothing from you.

**When GitHub opens a pull request named "Patch X needs a quick review":**
1. Open it. It lists exactly what changed and needs a look, usually an item or rune whose special effect has a hand-written rule in `rules.py`.
2. Click `rules.py` on that branch, then the pencil icon, make the change the list asks for, and commit.
3. GitHub rebuilds and re-checks automatically. When the check is green, click **Merge pull request**. The website updates a minute later.

**Other things to know:**
- **Run an update now:** **Actions** tab → **Patch update** → **Run workflow**.
- **Paused updates:** GitHub pauses daily jobs in a repository after 60 days without activity. If updates stop, go to **Actions** → **Patch update** and click **Enable workflow**.
- **On a computer, for developers:** you need Python 3 and Node.js, no packages. Run `./update.sh` (Mac, Linux, or Git Bash on Windows). It downloads the patch, rebuilds `data.js` and runs every check. `python3 -m unittest test_prep` and `node --test` run the tests.
- **After editing a script by hand** (`app.js`, `engine.js`…): run `python3 stamp.py` (or `./update.sh`). It updates the fingerprints in `index.html` so visitors' browsers load the new file instead of a cached old one; `node --test` fails until you do.

---

## Français

### L'ouvrir

**👉 https://gaggeo.github.io/lol-build-calculator/**

Cliquez sur le lien, c'est tout. Il s'ouvre dans votre navigateur (Edge, Chrome, Firefox, Safari), sur Windows, Mac ou téléphone. Rien à installer, aucun compte à créer.

Pour le partager, envoyez ce lien.

### Ce qu'il fait

- **Statistiques :** choisissez un champion, un niveau (1 à 18), des runes et jusqu'à 6 objets, et voyez les statistiques obtenues. Les builds impossibles en jeu (deux paires de bottes, deux fois le même objet légendaire…) ne peuvent pas être choisis. Ouvrez **Bonus temporaires** pour ajouter un élixir, le Baron, Fantôme ou des cumuls de dragons.
- **Dégâts :** cliquez sur **+ Ajouter un adversaire** et choisissez son champion, son niveau, ses runes et ses objets. Vous voyez ce que vos attaques de base et vos sorts lui infligent après armure et résistance magique, et le résultat d'un combo complet : « tue à l'étape 3 » ou « laisse 420 PV ». La même chose est affichée dans l'autre sens. **Comment battre** lit les deux combos et dit quoi acheter contre l'adversaire (armure ou résistance magique, pénétration, Blessures graves…).
- **Quoi acheter :** indiquez l'or que vous avez en poche et cliquez sur **Proposer des achats**. L'outil classe ce que vous pouvez acheter maintenant, y compris terminer un objet à partir des composants que vous possédez déjà, selon les dégâts en plus sur l'adversaire, la vie qu'il vous reste en plus après son combo, ou n'importe quelle statistique (Points de vie, Armure, Vol de vie… ; sans adversaire). Sans or indiqué, il n'y a pas de limite : objets seuls, les moins chers d'abord, puis les meilleurs. **Appliquer** ajoute l'achat à vos objets.

- **Classements** (second onglet) : choisissez une statistique, par exemple Points de vie ou Vitesse de déplacement. Vous obtenez les champions et les builds (niveau, 6 objets, page de runes) qui en atteignent le plus, 10 par défaut. Vous pouvez aussi fixer une limite d'or. **Ouvrir pour Vous** ou **Ouvrir pour Adversaire** charge une ligne dans le calculateur.
- **Optimisation** (troisième onglet) : choisissez un champion, un niveau et une statistique, et si vous voulez une limite d'or et les cumuls du champion. Vous obtenez le build (6 objets et une page de runes) qui en atteint le plus, son coût et toutes ses statistiques, ainsi que les builds suivants. Décochez un objet pour voir les statistiques sans lui ; **Détails de l'objet** l'ouvre dans l'onglet Objets.
- **Objets** (quatrième onglet) : tous les objets, avec recherche, filtre par type ou statistique et tri par prix ou rentabilité. Cliquez sur un objet pour ses statistiques, son coût, ses composants, ses limites, ce que le calculateur compte et sa description.
- **Champions** (cinquième onglet) : chaque champion avec ses rôles habituels (Haut, Jungle, Milieu, Bas, Support), sa classe et les stats avec lesquelles ses sorts évoluent le mieux, mesurées avec les dégâts du calculateur. Filtre par rôle ; **Ouvrir pour Vous** ou **Ouvrir pour Adversaire** le charge dans le calculateur.
- **Classes** (sixième onglet) : les six classes de Riot (Combattant, Tank, Mage, Assassin, Tireur, Support) : ce que fait chacune, ses points forts et faibles, les classes qu'elle bat ou qui la battent, où elle est jouée, les objets et bottes qui lui vont, et ses champions dont les sorts évoluent le mieux.
- **Les stats expliquées** (septième onglet) : à quoi sert chaque stat et comment elle agit avec les autres, pour les joueurs débutants, un sous-onglet par catégorie (Attaques de base, Sorts, Défense…), avec de petits exemples à curseurs, ce qui contre chaque stat, et la liste des objets qui donnent chaque stat.
- **Sources** (huitième onglet) : d'où viennent les données et les formules, avec des liens.
- Dans tout tableau de statistiques, **Afficher le détail** répartit le bonus en une colonne par objet, les runes et le champion.

Toute la page passe de l'anglais au français avec le bouton en haut à droite.

### Comment s'en servir

1. Sous **Vous**, choisissez votre champion et votre niveau. Runes et objets sont facultatifs.
2. Cliquez sur **+ Ajouter un adversaire** et choisissez contre qui vous jouez. Vous pouvez le retirer avec **Retirer l'adversaire**.
3. Lisez **Dégâts sur…** sous chaque côté. Vous pouvez réordonner ou retirer des étapes du combo.
4. Pour des conseils d'achat (il faut un adversaire), indiquez votre or dans **Or en poche** (ou laissez vide pour aucune limite), puis cliquez sur **Proposer des achats** en bas de page.

Quand un chiffre ne peut pas être calculé de façon fiable, la page indique **à vérifier en jeu** au lieu de deviner.

### L'utiliser sans internet (Windows)

1. Téléchargez **[ce fichier ZIP](https://github.com/GagGeo/lol-build-calculator/archive/refs/heads/main.zip)**.
2. Dans votre dossier Téléchargements, **clic droit sur le ZIP → Extraire tout… → Extraire**. Cette étape compte : ouvrir la page depuis l'intérieur du ZIP sans l'extraire ne fonctionne pas.
3. Ouvrez le dossier extrait et **double-cliquez sur `index.html`**.

Cette copie hors ligne ne se met pas à jour toute seule. Retéléchargez-la après un nouveau patch de League, ou utilisez simplement le lien ci-dessus, qui est toujours à jour.

### Mises à jour

Chaque jour, GitHub vérifie si Riot a publié un nouveau patch. Quand tout est vérifié, le site se met à jour tout seul, en général dans la journée qui suit le patch. Le numéro du patch est affiché en haut de la page.

### Limites

- Les chiffres viennent des données de jeu de Riot ; ils sont aussi bons que ces données. Certains sorts et effets d'objets ne peuvent pas être lus de façon fiable. La page les marque **à vérifier en jeu** et les retire des totaux plutôt que de deviner.
- Les sorts à plusieurs coups sont marqués **par coup** : le combo compte un seul coup.
- Le combo est une suite de coups, pas une simulation de combat : pas de délais de récupération, de déplacements ni de boucliers. Les soins comptent le vol de vie (attaques de base et effets à l'impact), l'omnivampirisme (tous les dégâts) et les soins des sorts et du passif de votre champion, augmentés par la puissance des soins et boucliers, dans la limite de votre vie manquante. Les Blessures graves des objets adverses les réduisent de 40 %. Les soins des runes et objets, ceux qui demandent autre chose que le combo (une élimination, être hors combat, une résurrection) et les soins pour les alliés ne sont pas comptés.
- Passifs des champions : les stats permanentes (portée de Tristana, vol de vie de Nasus, vie convertie en AD de Pyke…) sont comptées. Un passif qui inflige des dégâts est une étape du combo, comptée une fois, quel que soit son déclencheur (marques, cumuls, vie manquante). Les bonus temporaires (sur élimination, hors combat…) ne sont pas comptés.

### Pour la personne qui le maintient

La plupart des patchs ne demandent rien.

**Quand GitHub ouvre une pull request nommée « Patch X needs a quick review » :**
1. Ouvrez-la. Elle liste exactement ce qui a changé et doit être regardé, en général un objet ou une rune dont l'effet spécial a une règle écrite à la main dans `rules.py`.
2. Cliquez sur `rules.py` dans cette branche, puis sur l'icône crayon, faites la modification demandée, et validez (commit).
3. GitHub reconstruit et revérifie tout seul. Quand la vérification est verte, cliquez sur **Merge pull request**. Le site se met à jour une minute plus tard.

**À savoir aussi :**
- **Lancer une mise à jour tout de suite :** onglet **Actions** → **Patch update** → **Run workflow**.
- **Mises à jour en pause :** GitHub met en pause les tâches quotidiennes d'un dépôt après 60 jours sans activité. Si les mises à jour s'arrêtent, allez dans **Actions** → **Patch update** et cliquez sur **Enable workflow**.
- **Sur un ordinateur, pour les développeurs :** il faut Python 3 et Node.js, sans aucun paquet. Lancez `./update.sh` (Mac, Linux, ou Git Bash sous Windows). Il télécharge le patch, reconstruit `data.js` et lance toutes les vérifications. `python3 -m unittest test_prep` et `node --test` lancent les tests.
- **Après avoir modifié un script à la main** (`app.js`, `engine.js`…) : lancez `python3 stamp.py` (ou `./update.sh`). Il met à jour les empreintes dans `index.html` pour que les navigateurs chargent le nouveau fichier et non une ancienne copie en cache ; `node --test` échoue tant que ce n'est pas fait.

---

LoL Build Calculator isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

LoL Build Calculator n'est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ni de toute personne officiellement impliquée dans la production ou la gestion des propriétés de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou des marques déposées de Riot Games, Inc.
