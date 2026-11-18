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
