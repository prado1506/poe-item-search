import { expect, test } from "bun:test";
import { getSearchQuery } from "./item.js";
import stats from "../tests/fixtures/stats.json";

/**
 * In-game item text omits the "(Local)" suffix, so a weapon's
 * "#% increased Attack Speed" matches the GLOBAL stat id. On the trade site the
 * weapon's own roll is the (Local) variant. getSearchQuery must remap
 * global -> local based on the item's category.
 */

function flattenFilterIds(query) {
  return (query.stats || []).flatMap((group) =>
    (group.filters || []).map((f) => f.id)
  );
}

const weapon = `Item Class: Quarterstaves
Rarity: Rare
Test Pole
Expert Warstaff
--------
Physical Damage: 50-90
Critical Hit Chance: 10.00%
Attacks per Second: 1.40
--------
Requires: Level 60
--------
Item Level: 80
--------
25% increased Attack Speed
+148 to Accuracy Rating
`;

const gloves = `Item Class: Gloves
Rarity: Rare
Test Gloves
Expert Gloves
--------
Requires: Level 60
--------
Item Level: 80
--------
13% increased Attack Speed
`;

const bodyArmour = `Item Class: Body Armours
Rarity: Rare
Test Plate
Expert Plate
--------
Armour: 500
--------
Requires: Level 60
--------
Item Level: 80
--------
20% increased Armour
`;

test("weapon: increased Attack Speed maps to (Local) stat id", () => {
  const ids = flattenFilterIds(getSearchQuery(weapon, stats));
  expect(ids).toContain("explicit.stat_210067635"); // increased Attack Speed (Local)
  expect(ids).not.toContain("explicit.stat_681332047"); // global must not be used
});

test("weapon: +to Accuracy Rating maps to (Local) stat id", () => {
  const ids = flattenFilterIds(getSearchQuery(weapon, stats));
  expect(ids).toContain("explicit.stat_691932474"); // Accuracy Rating (Local)
  expect(ids).not.toContain("explicit.stat_803737631"); // global
});

test("gloves: increased Attack Speed stays GLOBAL (not local)", () => {
  const ids = flattenFilterIds(getSearchQuery(gloves, stats));
  expect(ids).toContain("explicit.stat_681332047"); // global Attack Speed
  expect(ids).not.toContain("explicit.stat_210067635"); // local must not be used
});

test("body armour: increased Armour maps to (Local) stat id", () => {
  const ids = flattenFilterIds(getSearchQuery(bodyArmour, stats));
  expect(ids).toContain("explicit.stat_1062208444"); // increased Armour (Local)
  expect(ids).not.toContain("explicit.stat_2866361420"); // global
});
