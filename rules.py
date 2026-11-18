"""Hand-written rules merged into DATA.rules. Review after each patch (update.sh says when)."""

RULES = {
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
    #   {"op": "convert", "from", "basis": "bonus"|"total"|"items", "to", "value"}:
    #       adds value x source stat (bonus, total, or from items only) to target
    # Values from CommunityDragon items.cdtb.bin.json mDataValues, 16.23.
    "itemStatPassives": {
        "3089": [{"op": "mulTotal", "stat": "ap", "value": 0.30}],                              # Rabadon's
        "2501": [{"op": "convert", "from": "hp", "basis": "bonus", "to": "ad", "value": 0.025}],  # Overlord's
        "3003": [{"op": "convert", "from": "mp", "basis": "bonus", "to": "ap", "value": 0.01}],   # Archangel's
        "3083": [{"op": "convert", "from": "hp", "basis": "items", "to": "hp", "value": 0.12}],   # Warmog's
    },
    # Flagged items whose effect is not a permanent stat (damage, healing, conditional).
    "itemStatPassivesReviewed": ["2523", "3036", "3072", "3161", "6672"],
    # Permanent stat whose value no data file gives: shown as "check in game".
    "itemStatPassivesUnknown": ["2517"],  # Endless Hunger: Ability Haste from bonus AD
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
