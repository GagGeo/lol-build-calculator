"""Hand-written rules merged into DATA.rules. Review after each patch (update.sh says when)."""

RULES = {
    # Set to the patch once you've checked the hand rules below against it. check.py asks you to
    # re-check any rule whose item, rune or champion changed since the previous patch until this matches.
    "rulesCheckedForPatch": "16.23.1",
    # Stat shard values, checked against CommunityDragon perks.json for 16.23.
    "shards": {"5008": {"adaptive": 9}, "5005": {"as": 10}, "5007": {"ah": 8},
               "5010": {"msPct": 2.5}, "5001": {"hpPerLevel": 10},
               "5011": {"hp": 65}, "5013": {"tenacity": 15}},
    "shardRows": [[5008, 5005, 5007], [5008, 5010, 5001], [5011, 5013, 5001]],
    "noBoots": ["Cassiopeia"],
    "asCap": 2.5,
    "critBase": 1.75,  # base critical strike damage multiplier (verify in game)
    # ponytail: rough laner estimate, Riot publishes none; only drives a warning
    "typicalGoldByLevel": [500, 800, 1100, 1500, 1900, 2400, 3000, 3700, 4400,
                           5200, 6100, 7000, 8000, 9000, 10200, 11500, 13000, 15000],
    "goldWarningFactor": 1.5,
    # Item passives that change stats. Ops:
    #   {"op": "mulTotal", "stat", "value"}: total stat x (1 + value)
    #   {"op": "convert", "from", "basis": "bonus"|"total"|"items"|"base", "to", "value"}:
    #       adds value x source stat (bonus, total, from items only, or the champion's base) to target
    #   {"op": "add", "stat", "value"}: flat stat the description states outside the stats block
    #   {"op": "stacked", "stat", "value"}: stat from item stacks, counted when "fully stacked" is on
    # hpregen/mpregen are per 5 seconds. Values from CommunityDragon items.cdtb.bin.json mDataValues, 16.23.
    "itemStatPassives": {
        "3089": [{"op": "mulTotal", "stat": "ap", "value": 0.30}],                              # Rabadon's
        "2501": [{"op": "convert", "from": "hp", "basis": "bonus", "to": "ad", "value": 0.025}],  # Overlord's
        "3003": [{"op": "convert", "from": "mp", "basis": "bonus", "to": "ap", "value": 0.01},    # Archangel's
                 {"op": "stacked", "stat": "mp", "value": 360}],
        "3083": [{"op": "convert", "from": "hp", "basis": "items", "to": "hp", "value": 0.12}],   # Warmog's
        "4633": [{"op": "convert", "from": "hp", "basis": "bonus", "to": "ap", "value": 0.02}],   # Riftmaker
        "3053": [{"op": "convert", "from": "ad", "basis": "base", "to": "ad", "value": 0.5}],     # Sterak's
        "6621": [{"op": "convert", "from": "mpRegenPct", "basis": "bonus", "to": "ap", "value": 0.15},  # Dawncore
                 {"op": "convert", "from": "mpRegenPct", "basis": "bonus", "to": "hsp", "value": 0.02}],
        "1054": [{"op": "add", "stat": "hpregen", "value": 4}],                                  # Doran's Shield
        "1056": [{"op": "add", "stat": "mpregen", "value": 5}],                                  # Doran's Ring
        "2051": [{"op": "add", "stat": "hpregen", "value": 20}],                                 # Guardian's Horn
        "3112": [{"op": "add", "stat": "mpregen", "value": 10}],                                 # Guardian's Orb
        "1082": [{"op": "stacked", "stat": "ap", "value": 40}],                                  # Dark Seal 10x4
        "3041": [{"op": "stacked", "stat": "ap", "value": 125},                                  # Mejai's 25x5
                 {"op": "stacked", "stat": "msPct", "value": 10}],
        "3032": [{"op": "stacked", "stat": "crit", "value": 25}],                                # Yun Tal
        "3070": [{"op": "stacked", "stat": "mp", "value": 360}],                                 # Tear
        "3004": [{"op": "stacked", "stat": "mp", "value": 360}],                                 # Manamune
        "3119": [{"op": "stacked", "stat": "mp", "value": 360}],                                 # Winter's Approach
        "2526": [{"op": "stacked", "stat": "mp", "value": 360}],                                 # Whispering Circlet
        "6657": [{"op": "stacked", "stat": "hp", "value": 100},                                  # Rod of Ages 10x
                 {"op": "stacked", "stat": "mp", "value": 300}, {"op": "stacked", "stat": "ap", "value": 30}],
        "3008": [{"op": "stacked", "stat": "omnivamp", "value": 6}],                             # Gluttonous Greaves
        "3168": [{"op": "stacked", "stat": "omnivamp", "value": 6}],                             # Immortal Path
        "4401": [{"op": "stacked", "stat": "mr", "value": 70},                                   # Force of Nature
                 {"op": "stacked", "stat": "msPct", "value": 6}],
    },
    # Flagged items whose effect is not a permanent stat (actives, on-hit, combat-only, damage, healing, allies).
    "itemStatPassivesReviewed": [
        "1083", "1102", "1106", "2065", "2503", "2512", "2522", "2523", "2524", "2525", "3026", "3036", "3044",
        "3071", "3072", "3073", "3074", "3078", "3107", "3110", "3118", "3124", "3139", "3142", "3143", "3153",
        "3155", "3156", "3161", "3171", "3181", "3222", "3302", "3504", "3508", "3742", "3802", "3803", "3876",
        "4005", "4629", "4645", "4646", "6333", "6610", "6616", "6620", "6631", "6653", "6672", "6673", "6676", "6694",
        "6699", "8010"],
    # Permanent stat not counted (value in no data file, or unlimited stacks): shown as "check in game".
    "itemStatPassivesUnknown": [
        "2517",  # Endless Hunger: Ability Haste from bonus AD
        "3004",  # Manamune: AD from mana
        "3119",  # Winter's Approach: Health from mana
        "2526",  # Whispering Circlet: Heal and Shield Power
        "3170",  # Swiftmarch: Move Speed as Adaptive Force
        "3084",  # Heartsteel: unlimited Health stacks
        "6697",  # Hubris: AD stacks per kill
        "6665",  # Jak'Sho: +30% bonus resists in combat
    ],
    # Champions whose own passive changes their stats in a way not counted yet (stage 2 reads passives).
    "championStatsUnknown": ["Jhin", "Cassiopeia", "Aphelios", "Pyke", "Ornn", "Kayle"],
    # --- Stage 2: damage inside one combo ---------------------------------------------------------
    # Effect kinds (engine.js runCombo): proc, onHit, spellblade, afterSpell, amp, shred. See the stage 2 plan.
    # base: number or [level 1, level 18]; ratios are fractions of ad/bonusAd/baseAd/ap/hp/bonusHp/
    # targetMaxHp/targetCurrentHp/targetMissingHp. Optional: only melee|ranged, onHit every/limit.
    # In-combat ramps (Liandry's, Riftmaker, Haunting Guise) count from the 3rd hit (afterHits:3).
    # Values from CommunityDragon mDataValues and Data Dragon rune text, 16.23.
    "runeDamage": {
        "8112": [{"kind": "proc", "hits": 3, "type": "adaptive", "base": [70, 240],          # Electrocute
                  "ratios": {"bonusAd": 0.1, "ap": 0.05}}],
        "8229": [{"kind": "afterSpell", "type": "adaptive", "base": [15, 100],              # Arcane Comet
                  "ratios": {"bonusAd": 0.1, "ap": 0.05}}],
        "8005": [{"kind": "onHit", "every": 3, "limit": 1, "type": "adaptive", "base": [40, 160]},  # Press the Attack
                 {"kind": "amp", "pct": 0.08, "condition": "afterAutos:3", "applies": "all"}],
        "8014": [{"kind": "amp", "pct": 0.08, "condition": "targetBelow:40", "applies": "all"}],   # Coup de Grace
        "8017": [{"kind": "amp", "pct": 0.08, "condition": "targetAbove:60", "applies": "all"}],   # Cut Down
        "8369": [{"kind": "amp", "pct": 0.07, "condition": "always", "applies": "all"}],           # First Strike
        "8237": [{"kind": "afterSpell", "type": "magic", "base": [20, 40]}],                       # Scorch
        "8437": [{"kind": "onHit", "limit": 1, "type": "magic", "ratios": {"hp": 0.035}, "only": "melee"},  # Grasp
                 {"kind": "onHit", "limit": 1, "type": "magic", "ratios": {"hp": 0.014}, "only": "ranged"}],
        # Deathfire Touch: 4 s single-target burn, last second +75% → 4.75 x per-second values.
        "8992": [{"kind": "afterSpell", "type": "magic", "base": [14.25, 57],
                  "ratios": {"ap": 0.11875, "bonusAd": 0.3325}}],
        "8214": [{"kind": "proc", "hits": 1, "type": "adaptive", "base": [10, 50],              # Summon Aery
                  "ratios": {"ap": 0.05, "bonusAd": 0.1}}],
        "9923": [{"kind": "onHit", "limit": 3, "type": "true", "base": [2, 20],                # Hail of Blades
                  "ratios": {"bonusAd": 0.12, "ap": 0.1}}],
    },
    # Damage-related text but no single-target damage inside one combo (healing, shields, mana, towers, CC).
    "runeDamageNone": ["8009", "8010", "8139", "8233", "8299", "8351", "8360", "8401", "8444", "8446", "8465", "8473"],
    # Real damage the effect kinds can't express (needs CC, dashes, a health threshold, stacks or distance).
    "runeDamageUnknown": ["8008", "8126", "8128", "8143", "8224", "8439"],
    "itemDamage": {
        "1043": [{"kind": "onHit", "type": "physical", "base": 15}],                            # Recurve Bow
        "3115": [{"kind": "onHit", "type": "magic", "base": 15, "ratios": {"ap": 0.15}}],       # Nashor's Tooth
        "3124": [{"kind": "onHit", "type": "magic", "base": 30}],                               # Guinsoo's
        "3153": [{"kind": "onHit", "type": "physical", "ratios": {"targetCurrentHp": 0.09}, "only": "melee"},  # BotRK
                 {"kind": "onHit", "type": "physical", "ratios": {"targetCurrentHp": 0.06}, "only": "ranged"}],
        "3748": [{"kind": "onHit", "type": "physical", "ratios": {"hp": 0.01}, "only": "melee"},          # Titanic
                 {"kind": "onHit", "type": "physical", "ratios": {"hp": 0.005}, "only": "ranged"}],
        "3084": [{"kind": "onHit", "limit": 1, "type": "physical", "base": 70, "ratios": {"hp": 0.06}}],  # Heartsteel
        "3742": [{"kind": "onHit", "limit": 1, "type": "physical", "base": 40, "ratios": {"baseAd": 1.0}}],  # Dead Man's
        "3057": [{"kind": "spellblade", "type": "physical", "ratios": {"baseAd": 1.0}}],         # Sheen
        "3078": [{"kind": "spellblade", "type": "physical", "ratios": {"baseAd": 2.0}}],         # Trinity Force
        "6662": [{"kind": "spellblade", "type": "physical", "ratios": {"baseAd": 1.5}}],         # Iceborn Gauntlet
        "3100": [{"kind": "spellblade", "type": "magic", "ratios": {"baseAd": 0.75, "ap": 0.45}}],  # Lich Bane
        "3508": [{"kind": "spellblade", "type": "physical", "ratios": {"baseAd": 1.25}}],        # Essence Reaver
        # Luden's: 6 echoes on a single target = 1 full + 5 x 20% = 2x (75 + 5% AP).
        "6655": [{"kind": "afterSpell", "type": "magic", "base": 150, "ratios": {"ap": 0.1}}],
        "6653": [{"kind": "afterSpell", "type": "magic", "ratios": {"targetMaxHp": 0.06}},      # Liandry's 2%/s x 3 s
                 {"kind": "amp", "pct": 0.06, "condition": "afterHits:3", "applies": "all"}],
        "2503": [{"kind": "afterSpell", "type": "magic", "base": 60, "ratios": {"ap": 0.06}}],  # Blackfire 3 s
        "2508": [{"kind": "afterSpell", "type": "magic", "base": 15}],                          # Fated Ashes
        "3871": [{"kind": "afterSpell", "type": "magic", "base": 10,                            # Zaz'Zak's
                  "ratios": {"ap": 0.15, "targetMaxHp": 0.03}}],
        "4633": [{"kind": "amp", "pct": 0.08, "condition": "afterHits:3", "applies": "all"}],   # Riftmaker
        "3147": [{"kind": "amp", "pct": 0.06, "condition": "afterHits:3", "applies": "all"}],   # Haunting Guise
        "3168": [{"kind": "amp", "pct": 0.04, "condition": "always", "applies": "all"}],        # Immortal Path
        "3036": [{"kind": "amp", "pct": 0.15, "condition": "targetBonusHp:1500", "applies": "all"}],  # Lord Dominik's
        "4645": [{"kind": "amp", "pct": 0.2, "condition": "targetBelow:40", "applies": "magicTrue"}],  # Shadowflame
        "8020": [{"kind": "amp", "pct": 0.12, "condition": "always", "applies": "magic"}],      # Abyssal Mask
        "3071": [{"kind": "shred", "stat": "armor", "pctPerStack": 0.06, "maxStacks": 5, "on": "physical"}],  # Cleaver
        "8010": [{"kind": "shred", "stat": "mr", "pctPerStack": 0.075, "maxStacks": 4, "on": "magic"}],  # Bloodletter's
    },
    # Damage-related text but nothing single-target inside one combo: defensive, healing, wounds,
    # minion-only, splash/cleave, actives (not in the combo), allies, reflect when hit.
    "itemDamageNone": [
        "1054", "1056", "1120", "2051", "2501", "2504", "2517", "2522", "2525", "3004", "3026", "3033", "3047",
        "3053", "3070", "3074", "3075", "3076", "3077", "3082", "3083", "3085", "3107", "3109", "3123", "3137",
        "3143", "3146", "3152", "3155", "3156", "3165", "3171", "3173", "3174", "3179", "3504", "3803", "3869",
        "3870", "3916", "4401", "4628", "4629", "6333", "6609", "6620", "6631", "6657", "6673", "6696", "6697",
        "6698", "3032", "3116", "6694", "6695"],
    # Real single-target damage with no published value or a trigger the effect kinds can't express
    # (Energized attacks, damage thresholds, after-ultimate effects, distance, executes, auras).
    "itemDamageUnknown": [
        "2502", "2510", "2512", "2520", "2523", "3050", "3068", "3087", "3091", "3094", "3095", "3118", "3144",
        "3145", "3161", "3181", "3302", "3877", "4646", "6610", "6660", "6664", "6672", "6676", "6699"],
    # --- Stage 3: buy advisor -----------------------------------------------------------------------
    # Items whose main value is a shield, heal, stasis, revive, cleanse or help for allies: listed apart, not ranked
    # (their combat value isn't in the damage/survival scores, so a ranking would undersell them).
    "advisorNotScored": [
        "2502",  # Unending Despair: drain heal
        "2504",  # Kaenic Rookern: magic shield
        "2525",  # Protoplasm Harness: low-health max HP and heal
        "3026",  # Guardian Angel: revive
        "3053",  # Sterak's Gage: low-health shield
        "3065",  # Spirit Visage: +25% heals and shields
        "3072",  # Bloodthirster: lifesteal shield
        "3102",  # Banshee's Veil: spell shield
        "3107",  # Redemption: ally heal
        "3109",  # Knight's Vow: protects an ally
        "3137",  # Cryptbloom: heal nova
        "3156",  # Maw of Malmortius: magic shield
        "3157",  # Zhonya's Hourglass: stasis
        "3190",  # Locket of the Iron Solari: ally shield
        "3222",  # Mikael's Blessing: ally cleanse
        "3504",  # Ardent Censer: ally buff
        "3814",  # Edge of Night: spell shield
        "3870",  # Dream Maker: ally buff
        "3876",  # Solstice Sleigh: ally heal and speed
        "6333",  # Death's Dance: damage delay and heal
        "6616",  # Staff of Flowing Water: ally buff
        "6617",  # Moonstone Renewer: chained heals
        "6620",  # Echoes of Helia: ally heal
        "6673",  # Immortal Shieldbow: low-health shield
        "6692",  # Eclipse: shield
    ],
    # One-line notes for not-scored items whose Data Dragon short description is empty.
    "advisorNotes": {
        "2502": {"en": "Drains nearby enemies and heals you in long fights", "fr": "Draine les ennemis proches et vous soigne en combat prolongé"},
        "2504": {"en": "Magic shield after a while without taking magic damage", "fr": "Bouclier magique après un moment sans dégâts magiques"},
        "2525": {"en": "Extra health and healing when you drop low", "fr": "Vie supplémentaire et soins quand votre vie est basse"},
        "6333": {"en": "Delays part of the damage you take; heals on takedowns", "fr": "Retarde une partie des dégâts subis ; soigne sur élimination"},
        "6673": {"en": "Shield when you drop low", "fr": "Bouclier quand votre vie est basse"},
        "6692": {"en": "Shield after two quick hits on a champion", "fr": "Bouclier après deux coups rapides sur un champion"},
        "3870": {"en": "Your heals and shields on allies empower their next attack", "fr": "Vos soins et boucliers sur un allié renforcent sa prochaine attaque"},
        "3876": {"en": "Slowing an enemy near allies heals and speeds you and an ally", "fr": "Ralentir un ennemi près d'alliés vous soigne et accélère avec un allié"},
    },
    # Flagged items whose heal/shield text is a side note; their stats and damage are scored normally.
    "advisorScored": ["2501", "2510", "2522", "2526", "3036", "3083", "3084", "3119", "3153", "4633", "4645", "4646",
                      "6610", "6621", "6653", "6657", "6672", "6676", "6694", "6695", "6699"],
    # Permanent stat per stack. Value forms: number per stack; {"per": n, "value": v} = v every n stacks;
    # {"byRRank": [r1, r2, r3]} = per stack, by ultimate rank (R at levels 6/11/16).
    # Values from CommunityDragon champion files, 16.23.
    "stackers": {
        "Veigar": {"ap": 1},
        "Thresh": {"armor": 1, "ap": 1},
        "Sion": {"hp": 1},
        "Senna": {"ad": 0.75, "crit": {"per": 20, "value": 10}},
        "Chogath": {"hp": {"byRRank": [40, 80, 120]}},
    },
    # Rune id -> list of entries, applied when "assume fully stacked" is on (or always, if "always").
    # Entry forms: {"stat", "value"}; {"stat", "min", "max"} = linear from level 1 to 18;
    # {"stat", "steps": [[level, value], ...]}; {"stat", "mulTotal": x} = total x (1 + x);
    # {"op": "jack"} = Jack of All Trades. Optional "only": "melee"|"ranged".
    "runeStats": {
        "8008": [{"stat": "as", "value": 36, "only": "melee"}, {"stat": "as", "value": 24, "only": "ranged"}],
        "8010": [{"stat": "adaptive", "min": 21.6, "max": 48}],
        "8210": [{"stat": "ah", "steps": [[5, 5], [8, 10]], "always": True}],
        "8234": [{"stat": "msPct", "value": 1, "always": True}],
        "8316": [{"op": "jack", "always": True}],
        "8345": [{"stat": "hp", "value": 90}],
        "8429": [{"stat": "armor", "value": 8}, {"stat": "mr", "value": 8},
                 {"stat": "armor", "mulTotal": 0.03}, {"stat": "mr", "mulTotal": 0.03}],
    },
    # Flagged runes whose effect is not a permanent stat (combat, location, out of combat).
    "runeStatsReviewed": ["8021", "8105", "8106", "8141", "8230", "8232", "8242", "8275", "8304",
                          "8401", "8410", "8439", "8446", "8463", "9923"],
}
