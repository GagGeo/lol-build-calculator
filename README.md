# LoL Build Calculator

Pick a champion, level, runes and items and see the resulting stats, in English or French.

## Use it

Open `index.html` in a browser. Everything it needs is in this folder.

## After each League patch

```sh
./update.sh
```

This downloads the new patch from Riot's Data Dragon and CommunityDragon, rebuilds `data.js`,
and runs every check. It ends with either "All good — patch … ready" or a list of items or
runes to review in `rules.py` (special effects that changed). The full report, including what
changed since the previous patch, is in `data/<patch>-report.txt`.

Needs Python 3 and Node.js; no packages to install.

LoL Build Calculator isn't endorsed by Riot Games and doesn't reflect the views or opinions of
Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot
Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
