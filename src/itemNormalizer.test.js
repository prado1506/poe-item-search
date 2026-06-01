import { expect, test, describe } from "bun:test";
import { normalizeItemText } from "./itemNormalizer.js";

describe("normalizeItemText - roll range collapsing (0.5 format)", () => {
  test("collapses simple integer roll range to the rolled value", () => {
    expect(normalizeItemText("+35(30-39) to maximum Life")).toBe(
      "+35 to maximum Life"
    );
  });

  test("collapses percentage roll range", () => {
    expect(normalizeItemText("30(20-30)% increased Mana Regeneration Rate")).toBe(
      "30% increased Mana Regeneration Rate"
    );
  });

  test("collapses decimal roll range", () => {
    expect(
      normalizeItemText("Leeches 6.45(6-6.9)% of Physical Damage as Life")
    ).toBe("Leeches 6.45% of Physical Damage as Life");
  });

  test("collapses signed decimal roll range", () => {
    expect(normalizeItemText("+2.37(2.11-2.7)% to Critical Hit Chance")).toBe(
      "+2.37% to Critical Hit Chance"
    );
  });

  test("collapses both ranges in an 'Adds X to Y' mod", () => {
    expect(
      normalizeItemText("Adds 5(4-6) to 10(7-10) Fire Damage")
    ).toBe("Adds 5 to 10 Fire Damage");
  });

  test("collapses only the ranged number when the first number has no range", () => {
    expect(
      normalizeItemText("Adds 1 to 18(13-19) Lightning Damage")
    ).toBe("Adds 1 to 18 Lightning Damage");
  });

  test("collapses inverted ranges (reduced mods)", () => {
    expect(
      normalizeItemText("19(20-10)% reduced Attribute Requirements")
    ).toBe("19% reduced Attribute Requirements");
  });

  test("does not touch '(augmented)' or other non-roll parentheticals", () => {
    expect(normalizeItemText("Physical Damage: 17-29 (augmented)")).toBe(
      "Physical Damage: 17-29 (augmented)"
    );
  });
});

describe("normalizeItemText - modifier headers -> legacy inline tags", () => {
  test("tags an implicit mod with (implicit) and drops the header line", () => {
    const input = [
      "{ Implicit Modifier — Mana }",
      "30(20-30)% increased Mana Regeneration Rate",
    ].join("\n");
    expect(normalizeItemText(input)).toBe(
      "30% increased Mana Regeneration Rate (implicit)"
    );
  });

  test("prefix/suffix modifiers become plain explicit lines (no tag)", () => {
    const input = [
      '{ Prefix Modifier "Magpie\'s" (Tier: 3) }',
      "10(8-11)% increased Rarity of Items found",
      '{ Suffix Modifier "of Excitement" (Tier: 6) — Mana }',
      "18(10-19)% increased Mana Regeneration Rate",
    ].join("\n");
    expect(normalizeItemText(input)).toBe(
      [
        "10% increased Rarity of Items found",
        "18% increased Mana Regeneration Rate",
      ].join("\n")
    );
  });

  test("desecrated modifier gets the (desecrated) tag", () => {
    const input = [
      '{ Desecrated Prefix Modifier "Incinerating" (Tier: 3) — Fire }',
      "Adds 13(13-19) to 31(27-32) Fire damage to Attacks",
    ].join("\n");
    expect(normalizeItemText(input)).toBe(
      "Adds 13 to 31 Fire damage to Attacks (desecrated)"
    );
  });

  test("a single header applies its type to all following mod lines until the next header", () => {
    const input = [
      '{ Prefix Modifier "Thug\'s" (Tier: 5) — Life, Armour, Evasion }',
      "14(14-20)% increased Armour and Evasion",
      "+12(11-19) to maximum Life",
    ].join("\n");
    expect(normalizeItemText(input)).toBe(
      ["14% increased Armour and Evasion", "+12 to maximum Life"].join("\n")
    );
  });

  test("crafted modifier becomes a plain explicit line", () => {
    const input = [
      '{ Crafted Suffix Modifier "of the Kiln" (Tier: 5) — Fire, Resistance }',
      "+24(21-25)% to Fire Resistance",
    ].join("\n");
    expect(normalizeItemText(input)).toBe("+24% to Fire Resistance");
  });
});

describe("normalizeItemText - rune mods and separators", () => {
  test("rune mods keep their inline (rune) tag and are not double-tagged", () => {
    const input = [
      "Adds 3 to 5 Cold Damage (rune)",
      "--------",
      "{ Implicit Modifier — Attack }",
      "22(15-25)% chance to Maim on Hit",
    ].join("\n");
    expect(normalizeItemText(input)).toBe(
      [
        "Adds 3 to 5 Cold Damage (rune)",
        "--------",
        "22% chance to Maim on Hit (implicit)",
      ].join("\n")
    );
  });

  test("a separator resets the modifier block type", () => {
    const input = [
      "{ Implicit Modifier — Attack }",
      "22(15-25)% chance to Maim on Hit",
      "--------",
      "Grants Skill: Spear Throw",
    ].join("\n");
    expect(normalizeItemText(input)).toBe(
      [
        "22% chance to Maim on Hit (implicit)",
        "--------",
        "Grants Skill: Spear Throw",
      ].join("\n")
    );
  });
});

describe("normalizeItemText - backward compatibility (legacy / API format)", () => {
  test("legacy item text with inline tags is returned unchanged", () => {
    const legacy = [
      "Item Class: Rings",
      "Rarity: Unique",
      "Polcirkeln",
      "Sapphire Ring",
      "--------",
      "+22% to Cold Resistance (implicit)",
      "--------",
      "24% increased Cold Damage",
      "+53 to maximum Mana",
      "+13 to Strength",
    ].join("\n");
    expect(normalizeItemText(legacy)).toBe(legacy);
  });

  test("empty / non-string input is passed through", () => {
    expect(normalizeItemText("")).toBe("");
    expect(normalizeItemText(undefined)).toBe(undefined);
  });
});
