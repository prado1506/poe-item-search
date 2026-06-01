import { expect, test, describe } from "bun:test";
import { getSearchQuery } from "./item.js";
import stats from "../tests/fixtures/stats.json";

const dump = await Bun.file("tests/fixtures/exemplos_0.5.txt").text();
const items = dump
  .split(/\n\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

function flatFilters(query) {
  return (query.stats || []).flatMap((block) =>
    block.filters.map((f) => ({ block: block.type, ...f }))
  );
}

describe("getSearchQuery - PoE 0.5 in-game item format", () => {
  test("parses a magic amulet, collapsing ranges and distinguishing implicit from explicit", () => {
    // Magpie's Azure Amulet of Excitement: implicit + suffix are the same base
    // mod (Mana Regeneration Rate) and must keep distinct implicit/explicit ids.
    const amulet = items[0];
    expect(getSearchQuery(amulet, stats)).toStrictEqual({
      filters: {
        type_filters: {
          filters: { category: { option: "accessory.amulet" } },
        },
      },
      stats: [
        {
          type: "and",
          filters: [
            { id: "explicit.stat_3917489142", value: { min: "10" } }, // Rarity of Items
            { id: "explicit.stat_789117908", value: { min: "18" } }, // Mana Regen (suffix)
            { id: "implicit.stat_789117908", value: { min: "30" } }, // Mana Regen (implicit)
          ],
        },
      ],
    });
  });

  test("every produced stat filter has a defined id (no broken matches)", () => {
    for (const item of items) {
      const query = getSearchQuery(item, stats);
      for (const f of flatFilters(query)) {
        expect(f.id).toBeDefined();
        expect(typeof f.id).toBe("string");
      }
    }
  });

  test("rune mods are matched and emitted with a rune.* id", () => {
    // Item 1 is a Hunting Spear with "Adds 3 to 5 Cold Damage (rune)".
    const spear = items[1];
    const ids = flatFilters(getSearchQuery(spear, stats)).map((f) => f.id);
    expect(ids.some((id) => id.startsWith("rune."))).toBe(true);
  });

  test("at least 90% of sampled items produce non-empty stats", () => {
    // Regression guard: before the 0.5 normalizer, embedded roll ranges broke
    // nearly every per-line regex match and produced empty stat blocks.
    let withStats = 0;
    for (const item of items) {
      const query = getSearchQuery(item, stats);
      if ((query.stats || []).length > 0 || query.term) withStats++;
    }
    expect(withStats / items.length).toBeGreaterThanOrEqual(0.9);
  });
});
