import { describe, test, expect } from "bun:test";
import { formatItemText } from "./itemFormatter";
import type { TradeItem } from "@/types/tradeItem";

describe("itemFormatter", () => {
  test("formats rare corrupted chest armour correctly", async () => {
    const itemJson = await Bun.file("tests/fixtures/api-chest-rare.json").json();
    const item = itemJson as TradeItem;

    const result = formatItemText(item);

    // Check key sections are present
    expect(result).toContain("Item Class: Body Armours");
    expect(result).toContain("Rarity: Rare");
    expect(result).toContain("Dragon Shelter");
    expect(result).toContain("Sacrificial Regalia");

    // Check properties with augmented values
    expect(result).toContain("Quality: +20% (augmented)");
    expect(result).toContain("Armour: 552 (augmented)");
    expect(result).toContain("Evasion Rating: 503 (augmented)");
    expect(result).toContain("Energy Shield: 191 (augmented)");

    // Check requirements
    expect(result).toContain("Requires: Level 65, 54 Str, 54 Dex, 54 Int");

    // Check sockets
    expect(result).toContain("Sockets: S S S");

    // Check item level
    expect(result).toContain("Item Level: 83");

    // Check implicit mods with (implicit) suffix
    expect(result).toContain("+1 to Level of all Corrupted Skill Gems (implicit)");

    // Check explicit mods (bracket notation should be stripped)
    expect(result).toContain("71% increased Armour, Evasion and Energy Shield");
    expect(result).toContain("+83 to maximum Life");
    expect(result).toContain("25% reduced Attribute Requirements");
    expect(result).toContain("+23% to Cold Resistance");
    expect(result).toContain("+249 to Stun Threshold");
    expect(result).toContain("115 to 154 Physical Thorns damage");

    // Check corrupted status
    expect(result).toContain("Corrupted");

    // Check note (price)
    expect(result).toContain("Note: ~b/o 1 exalted");

    // Should NOT contain bracket notation
    expect(result).not.toContain("[Armour|");
    expect(result).not.toContain("[Evasion|");
    expect(result).not.toContain("[EnergyShield|");
    expect(result).not.toContain("[Corrupted]");
  });

  test("strips bracket notation from mods", async () => {
    const item: TradeItem = {
      id: "test",
      realm: "poe2",
      verified: true,
      w: 1,
      h: 1,
      icon: "",
      league: "Test",
      name: "",
      typeLine: "Test Item",
      baseType: "Test Item",
      rarity: "Normal",
      frameType: 0,
      ilvl: 1,
      identified: true,
      explicitMods: [
        "+10% to [Resistances|Fire Resistance]",
        "Adds 5 to 10 [Physical|Physical] Damage",
        "[SingleKey] bonus",
      ],
    };

    const result = formatItemText(item);

    expect(result).toContain("+10% to Fire Resistance");
    expect(result).toContain("Adds 5 to 10 Physical Damage");
    expect(result).toContain("SingleKey bonus");
    expect(result).not.toContain("[Resistances|");
    expect(result).not.toContain("[Physical|");
    expect(result).not.toContain("[SingleKey]");
  });

  test("handles items without optional fields", () => {
    const item: TradeItem = {
      id: "test",
      realm: "poe2",
      verified: true,
      w: 1,
      h: 1,
      icon: "",
      league: "Test",
      name: "",
      typeLine: "Simple Wand",
      baseType: "Simple Wand",
      rarity: "Normal",
      frameType: 0,
      ilvl: 1,
      identified: true,
    };

    const result = formatItemText(item);

    expect(result).toContain("Rarity: Normal");
    expect(result).toContain("Simple Wand");
    expect(result).toContain("Item Level: 1");
    // Should not have corrupted line
    expect(result).not.toContain("Corrupted");
  });

  test("formats unique items with flavour text", () => {
    const item: TradeItem = {
      id: "test",
      realm: "poe2",
      verified: true,
      w: 1,
      h: 1,
      icon: "",
      league: "Test",
      name: "Polcirkeln",
      typeLine: "Sapphire Ring",
      baseType: "Sapphire Ring",
      rarity: "Unique",
      frameType: 3,
      ilvl: 66,
      identified: true,
      properties: [{ name: "Rings", values: [], displayMode: 0 }],
      implicitMods: ["+22% to [Resistances|Cold Resistance]"],
      explicitMods: [
        "24% increased Cold Damage",
        "+53 to maximum Mana",
      ],
      flavourText: [
        "I rule the north",
        "A legacy earned",
        "Time and time again",
        "Sing Meginord's song!",
      ],
    };

    const result = formatItemText(item);

    expect(result).toContain("Rarity: Unique");
    expect(result).toContain("Polcirkeln");
    expect(result).toContain("Sapphire Ring");
    expect(result).toContain("+22% to Cold Resistance (implicit)");
    expect(result).toContain("I rule the north");
    expect(result).toContain("Sing Meginord's song!");
  });

  test("formats modern copy style with modifier headers and ranges", async () => {
    const itemJson = await Bun.file("tests/fixtures/gloves.json").json();
    const item = (itemJson?.result?.[0]?.item ?? itemJson) as TradeItem;

    const result = formatItemText(item, { mode: "modern" });

    expect(result).toContain("{ Prefix Modifier");
    expect(result).toContain("{ Suffix Modifier");
    expect(result).toContain("(Tier: ");
    expect(result).not.toContain("(Tier: P");
    expect(result).not.toContain("(Tier: S");

    // Modern game copy includes rolled value with range hints.
    expect(result).toMatch(/\d+(?:\.\d+)?\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\)/);

    // Should not append legacy inline explicit suffixes.
    expect(result).not.toContain("(crafted)");
    expect(result).not.toContain("(fractured)");
    expect(result).not.toContain("(desecrated)");
  });

  test("keeps ranges attached to the correct modern mod lines when metadata order differs", () => {
    const item: TradeItem = {
      id: "test-quarterstaff",
      realm: "poe2",
      verified: true,
      w: 2,
      h: 4,
      icon: "",
      league: "Test",
      name: "Dire Roar",
      typeLine: "Waxing Quarterstaff",
      baseType: "Waxing Quarterstaff",
      rarity: "Rare",
      frameType: 2,
      ilvl: 82,
      identified: true,
      corrupted: true,
      properties: [
        { name: "Quarterstaff", values: [], displayMode: 0 },
        { name: "[Quality]", values: [["+20%", 1]], displayMode: 0 },
      ],
      explicitMods: [
        "Adds 12 to 20 [Physical|Physical] Damage",
        "Adds 116 to 187 [Fire] Damage",
        "16% increased [Attack] Speed",
        "+20 to [Dexterity]",
        "[ManaLeech|Leeches] 7.89% of [Physical] Damage as Mana",
      ],
      craftedMods: ["Adds 4 to 81 [Lightning] Damage"],
      extended: {
        mods: {
          explicit: [
            {
              name: "Cremating",
              tier: "P2",
              level: 1,
              magnitudes: [
                { hash: "a", min: "102", max: "130" },
                { hash: "a", min: "155", max: "198" },
              ],
            },
            {
              name: "Polished",
              tier: "P7",
              level: 1,
              magnitudes: [
                { hash: "b", min: "8", max: "12" },
                { hash: "b", min: "15", max: "22" },
              ],
            },
            {
              name: "of Renown",
              tier: "S5",
              level: 1,
              magnitudes: [{ hash: "c", min: "14", max: "16" }],
            },
            {
              name: "of the Falcon",
              tier: "S5",
              level: 1,
              magnitudes: [{ hash: "d", min: "17", max: "20" }],
            },
            {
              name: "of the Drought",
              tier: "S2",
              level: 1,
              magnitudes: [{ hash: "e", min: "7", max: "7.9" }],
            },
          ],
        },
      },
    };

    const result = formatItemText(item, { mode: "modern" });

    expect(result).toContain('{ Prefix Modifier "Polished" (Tier: 7) }\nAdds 12(8-12) to 20(15-22) Physical Damage');
    expect(result).toContain('{ Prefix Modifier "Cremating" (Tier: 2) }\nAdds 116(102-130) to 187(155-198) Fire Damage');
    expect(result).toContain('{ Suffix Modifier "of Renown" (Tier: 5) }\n16(14-16)% increased Attack Speed');
    expect(result).toContain('{ Suffix Modifier "of the Falcon" (Tier: 5) }\n+20(17-20) to Dexterity');
    expect(result).toContain('{ Suffix Modifier "of the Drought" (Tier: 2) }\nLeeches 7.89(7-7.9)% of Physical Damage as Mana');
    expect(result).toContain('{ Crafted Prefix Modifier }\nAdds 4 to 81 Lightning Damage');
  });

  test("does not throw when a mod entry is an unexpected primitive", () => {
    // The fetch response is cast straight to TradeItem with no runtime
    // validation, so stripBracketNotation must tolerate non-strings.
    const item = {
      rarity: "Normal",
      typeLine: "Runes of Aldur",
      ilvl: 80,
      runeMods: [123 as unknown as string, "Adds [Fire|Fire] Damage"],
    } as TradeItem;

    expect(() => formatItemText(item)).not.toThrow();
    const result = formatItemText(item);
    expect(result).toContain("Adds Fire Damage (rune)");
    expect(result).toContain("123 (rune)");
  });

  test("formats object-form mods from the newer PoE2 trade API", () => {
    // The API migrated mod arrays from string[] to objects that embed the
    // display text, stat hash, category flags and affix metadata, while
    // extended.mods is now empty. Fractured/crafted mods are folded into
    // explicitMods and must be relabeled from their hash/flags.
    const item = {
      rarity: "Rare",
      name: "Empyrean Mitts",
      typeLine: "Grand Bracers",
      ilvl: 82,
      corrupted: true,
      runeMods: ["Gain 1 [Rage|Rage] on [Melee] [HitDamage|Hit]"],
      explicitMods: [
        {
          description: "Adds 29 to 43 [Fire] damage to [Attack|Attacks]",
          hash: "stat.fractured.stat_1573130764",
          flags: { fractured: true },
          mods: [
            {
              name: "Cremating",
              tier: "P1",
              level: 75,
              magnitudes: [
                { min: "25", max: "29" },
                { min: "37", max: "45" },
              ],
            },
          ],
        },
        {
          description: "29% increased [CriticalDamageBonus|Critical Damage Bonus]",
          hash: "stat.crafted.stat_3556824919",
          flags: { crafted: true },
          mods: [
            { name: "of Fury", tier: "S2", level: 45, magnitudes: [{ min: "25", max: "29" }] },
          ],
        },
      ],
    } as unknown as TradeItem;

    const result = formatItemText(item, { mode: "modern" });

    expect(result).not.toContain("[object Object]");
    expect(result).toContain("Gain 1 Rage on Melee Hit (rune)");
    expect(result).toContain(
      '{ Fractured Prefix Modifier "Cremating" (Tier: 1) }\nAdds 29(25-29) to 43(37-45) Fire damage to Attacks'
    );
    expect(result).toContain(
      '{ Crafted Suffix Modifier "of Fury" (Tier: 2) }\n29(25-29)% increased Critical Damage Bonus'
    );
  });

  test("groups hybrid affixes, orders mods and maps ranges via extended.hashes", () => {
    // Reproduces the in-game layout for the new object format: a hybrid affix
    // (Stag's = evasion + life) is merged under one header with each line
    // mapped to its own magnitude, prefixes precede suffixes ordered by affix
    // index, fractured first / crafted last, and the "Bonded" rune line and
    // Corrupted/Fractured ordering match the game.
    const mod = (
      description: string,
      hash: string,
      name: string,
      tier: string,
      magnitudes: Array<{ min: string; max: string }>,
      flags?: Record<string, boolean>
    ) => ({ description, hash, ...(flags ? { flags } : {}), mods: [{ name, tier, level: 1, magnitudes }] });

    const item = {
      rarity: "Rare",
      name: "Empyrean Mitts",
      typeLine: "Grand Bracers",
      ilvl: 82,
      corrupted: true,
      fractured: true,
      note: "~b/o 3 divine",
      runeMods: [
        "Gain 1 [Rage|Rage] on [Melee] [HitDamage|Hit]",
        "[ShamanOnlyMods|Bonded]: 25% increased [Warcry|Warcry] Cooldown Recovery Rate",
      ],
      explicitMods: [
        mod("Adds 29 to 43 [Fire] damage to [Attack|Attacks]", "stat.fractured.stat_1573130764", "Cremating", "P1", [{ min: "25", max: "29" }, { min: "37", max: "45" }], { fractured: true }),
        mod("42% increased [Evasion|Evasion] Rating", "stat.explicit.stat_124859000", "Stag's", "P1", [{ min: "39", max: "42" }, { min: "42", max: "49" }]),
        mod("Adds 3 to 65 [Lightning] damage to [Attack|Attacks]", "stat.explicit.stat_1754445556", "Electrocuting", "P1", [{ min: "1", max: "4" }, { min: "60", max: "71" }]),
        mod("+42 to maximum Life", "stat.explicit.stat_3299347043", "Stag's", "P1", [{ min: "39", max: "42" }, { min: "42", max: "49" }]),
        mod("11% increased [ItemRarity|Rarity of Items] found", "stat.explicit.stat_3917489142", "of Raiding", "S2", [{ min: "11", max: "14" }]),
        mod("+35% to [Resistances|Cold Resistance]", "stat.explicit.stat_4220027924", "of the Polar Bear", "S3", [{ min: "31", max: "35" }]),
        mod("29% increased [CriticalDamageBonus|Critical Damage Bonus]", "stat.crafted.stat_3556824919", "of Fury", "S2", [{ min: "25", max: "29" }], { crafted: true }),
      ],
      extended: {
        mods: {},
        hashes: {
          explicit: [
            ["explicit.stat_124859000", [1]],
            ["explicit.stat_1754445556", [0]],
            ["explicit.stat_3299347043", [1]],
            ["explicit.stat_3917489142", [3]],
            ["explicit.stat_4220027924", [2]],
          ],
          fractured: [["fractured.stat_1573130764", [0]]],
          crafted: [["crafted.stat_3556824919", [0]]],
        },
      },
    } as unknown as TradeItem;

    const result = formatItemText(item, { mode: "modern" });

    // Hybrid merged under one header, each line mapped to its own magnitude.
    expect(result).toContain(
      '{ Prefix Modifier "Stag\'s" (Tier: 1) }\n42(39-42)% increased Evasion Rating\n+42(42-49) to maximum Life'
    );
    // "Bonded" rune line dropped.
    expect(result).not.toContain("Bonded");
    // Mod order and Corrupted-before-Fractured exactly as in-game.
    const modsBlock = result.slice(result.indexOf("Item Level: 82"));
    expect(modsBlock).toBe(
      [
        "Item Level: 82",
        "--------",
        "Gain 1 Rage on Melee Hit (rune)",
        "--------",
        '{ Fractured Prefix Modifier "Cremating" (Tier: 1) }',
        "Adds 29(25-29) to 43(37-45) Fire damage to Attacks",
        '{ Prefix Modifier "Electrocuting" (Tier: 1) }',
        "Adds 3(1-4) to 65(60-71) Lightning damage to Attacks",
        '{ Prefix Modifier "Stag\'s" (Tier: 1) }',
        "42(39-42)% increased Evasion Rating",
        "+42(42-49) to maximum Life",
        '{ Suffix Modifier "of the Polar Bear" (Tier: 3) }',
        "+35(31-35)% to Cold Resistance",
        '{ Suffix Modifier "of Raiding" (Tier: 2) }',
        "11(11-14)% increased Rarity of Items found",
        '{ Crafted Suffix Modifier "of Fury" (Tier: 2) }',
        "29(25-29)% increased Critical Damage Bonus",
        "--------",
        "Corrupted",
        "--------",
        "Fractured Item",
        "--------",
        "Note: ~b/o 3 divine",
      ].join("\n")
    );
  });

  test("reverses quality inflation, separates implicit block and omits tier 0", () => {
    // Item quality inflates the values the API reports (e.g. +20% attack mods),
    // while magnitudes stay at base. The implicit is still a string with its
    // metadata in extended.mods, and the crafted mod has tier 0 (no tier).
    const obj = (
      description: string,
      hash: string,
      name: string,
      tier: string,
      magnitudes: Array<{ min: string; max: string }>,
      flags?: Record<string, boolean>
    ) => ({ description, hash, ...(flags ? { flags } : {}), mods: [{ name, tier, level: 1, magnitudes }] });

    const item = {
      rarity: "Rare",
      name: "Glyph Circle",
      typeLine: "Ruby Ring",
      ilvl: 82,
      note: "~b/o 50 divine",
      properties: [
        { name: "Quality (Attack Modifiers)", values: [["+20%", 1]], displayMode: 0, type: 6 },
      ],
      implicitMods: ["+28% to [Resistances|Fire Resistance]"],
      explicitMods: [
        obj("Adds 28 to 43 [Cold] damage to [Attack|Attacks]", "stat.explicit.stat_4067062424", "Entombing", "P1", [{ min: "21", max: "24" }, { min: "32", max: "37" }]),
        obj("10% increased [Attack] Speed", "stat.crafted.stat_681332047", "of the Stars", "S0", [{ min: "7", max: "9" }], { crafted: true }),
      ],
      extended: {
        mods: { implicit: [{ name: "", tier: "", level: 10, magnitudes: [{ hash: "implicit.stat_3372524247", min: "20", max: "30" }] }] },
        hashes: {
          explicit: [["explicit.stat_4067062424", [0]]],
          implicit: [["implicit.stat_3372524247", [0]]],
          crafted: [["crafted.stat_681332047", [0]]],
        },
      },
    } as unknown as TradeItem;

    const result = formatItemText(item, { mode: "modern" });
    const block = result.slice(result.indexOf("Item Level: 82"));

    expect(block).toBe(
      [
        "Item Level: 82",
        "--------",
        "{ Implicit Modifier }",
        "+28(20-30)% to Fire Resistance",
        "--------",
        '{ Prefix Modifier "Entombing" (Tier: 1) }',
        // 28 -> 24, 43 -> 36 (quality reversed back into the base range)
        "Adds 24(21-24) to 36(32-37) Cold damage to Attacks",
        '{ Crafted Suffix Modifier "of the Stars" }', // tier 0 omitted
        "9(7-9)% increased Attack Speed", // 10 -> 9
        "--------",
        "Note: ~b/o 50 divine",
      ].join("\n")
    );
  });
});
