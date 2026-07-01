/**
 * Converts PoE Trade API item JSON to game's raw text format.
 * This format matches what you get when copying an item in-game (Ctrl+C).
 */

import type {
  TradeItem,
  TradeItemExtendedMod,
  TradeItemMod,
  TradeItemModObject,
  TradeItemProperty,
  TradeItemRequirement,
} from "@/types/tradeItem";

type ModCategory =
  | "implicit"
  | "explicit"
  | "fractured"
  | "desecrated"
  | "crafted";

const CLASS_NORMALYZER: Record<string, string> = {
  "Quarterstaff": "Quarterstaves",
};

const SEPARATOR = "--------";
const NUMBER_RE = /([+-]?\d+(?:\.\d+)?)/g;

type FormatMode = "legacy" | "modern";

interface FormatItemTextOptions {
  mode?: FormatMode;
}

interface ModernModEntry {
  category: "implicit" | "explicit" | "fractured" | "desecrated" | "crafted";
  rawMod: string;
  modData?: TradeItemExtendedMod;
}

/**
 * Strip bracket notation from mod text.
 * API returns mods like: "71% increased [Armour|Armour], [Evasion|Evasion]"
 * Game format shows: "71% increased Armour, Evasion"
 * Pattern: [Key|Display] → Display
 */
function stripBracketNotation(text: unknown): string {
  // The trade API response is cast to TradeItem without runtime validation, so
  // a mod/property entry can arrive as a non-string (seen on rune items).
  // Coerce defensively instead of throwing "text.replace is not a function".
  if (typeof text !== "string") {
    return text == null ? "" : String(text);
  }
  return text
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
    .replace(/\[([^\]]+)\]/g, "$1");
}

/**
 * The newer PoE2 trade API returns mod entries as objects instead of strings.
 * These helpers normalize either form so the rest of the formatter is agnostic.
 */
function isModObject(mod: TradeItemMod): mod is TradeItemModObject {
  return typeof mod === "object" && mod !== null;
}

/** The displayable mod text (still bracket-notated at this stage). */
function getModText(mod: TradeItemMod): string {
  return isModObject(mod) ? mod.description ?? "" : mod;
}

/** Affix metadata embedded in an object mod, shaped like extended.mods entries. */
function getModMeta(mod: TradeItemMod): TradeItemExtendedMod | undefined {
  if (!isModObject(mod)) return undefined;
  const affix = mod.mods?.[0];
  if (!affix) return undefined;
  return {
    name: affix.name ?? "",
    tier: affix.tier ?? "",
    level: affix.level ?? 0,
    // A line can be backed by multiple affixes (hybrids); flatten their ranges.
    magnitudes: (mod.mods ?? []).flatMap((entry) => entry.magnitudes ?? []),
  };
}

/**
 * The new format folds fractured/crafted/etc. mods into explicitMods, tagging
 * the real category via flags and the stat hash. Derive it, falling back to the
 * array the mod came from.
 */
function getModCategory(mod: TradeItemMod, fallback: ModCategory): ModCategory {
  if (!isModObject(mod)) return fallback;
  if (mod.flags?.fractured) return "fractured";
  if (mod.flags?.crafted) return "crafted";

  const hash = mod.hash ?? "";
  if (hash.includes(".implicit.")) return "implicit";
  if (hash.includes(".fractured.")) return "fractured";
  if (hash.includes(".desecrated.")) return "desecrated";
  if (hash.includes(".crafted.")) return "crafted";
  if (hash.includes(".explicit.")) return "explicit";
  return fallback;
}

/** True when any mod array uses the new object form (signals modern formatting). */
function hasObjectMods(item: TradeItem): boolean {
  const arrays = [
    item.implicitMods,
    item.explicitMods,
    item.fracturedMods,
    item.desecratedMods,
    item.craftedMods,
    item.runeMods,
    item.enchantMods,
    item.mutatedMods,
  ];
  return arrays.some((arr) => arr?.some(isModObject));
}

/**
 * Format a property value with augmented indicator.
 * values[0][1] === 1 means the value is augmented (modified by quality/mods)
 */
function formatPropertyValue(prop: TradeItemProperty): string {
  if (!prop.values || prop.values.length === 0) {
    return "";
  }

  const parts: string[] = [];
  for (const [value, augmented] of prop.values) {
    if (augmented === 1) {
      parts.push(`${value} (augmented)`);
    } else {
      parts.push(value);
    }
  }
  return parts.join(", ");
}

/**
 * Format properties section.
 * Includes: Quality, Armour, Evasion, Energy Shield, Physical Damage, etc.
 */
function formatProperties(properties: TradeItemProperty[]): string[] {
  const lines: string[] = [];

  for (const prop of properties) {
    const name = stripBracketNotation(prop.name);
    const value = formatPropertyValue(prop);

    // Properties with no value are category headers (e.g., "Body Armour")
    if (!value) {
      continue;
    }

    lines.push(`${name}: ${value}`);
  }

  return lines;
}

/**
 * Format requirements section.
 * Can be single line: "Requires: Level 65, 54 Str, 54 Dex"
 * Or multi-line with "Requirements:" header
 */
function formatRequirements(requirements: TradeItemRequirement[]): string[] {
  if (!requirements || requirements.length === 0) {
    return [];
  }

  const parts: string[] = [];

  for (const req of requirements) {
    const name = stripBracketNotation(req.name);
    const value = req.values?.[0]?.[0] || "";
    parts.push(`${name}: ${value}`);
  }

  // Single-line format for common case
  if (parts.length <= 4) {
    const formatted = parts.map((p) => {
      const [name, val] = p.split(": ");
      if (name === "Level") {
        return `Level ${val}`;
      }
      return `${val} ${name}`;
    });
    return [`Requires: ${formatted.join(", ")}`];
  }

  // Multi-line format
  return ["Requirements:", ...parts];
}

/**
 * Format sockets section.
 * API: [{ group: 0 }, { group: 0 }, { group: 1 }]
 * Game: "Sockets: S S S" (space separated)
 */
function formatSockets(sockets: TradeItem["sockets"]): string | null {
  if (!sockets || sockets.length === 0) {
    return null;
  }

  const socketStr = sockets.map(() => "S").join(" ");
  return `Sockets: ${socketStr}`;
}

/**
 * Get the item class from the first property (which is typically the category).
 * e.g., "Body Armour", "Wands", "Rings"
 */
function getItemClass(
  properties: TradeItemProperty[] | undefined
): string | null {
  if (!properties || properties.length === 0) {
    return null;
  }

  // First property with empty values is usually the item class
  const classProperty = properties.find(
    (p) => !p.values || p.values.length === 0
  );
  if (classProperty) {
    return stripBracketNotation(classProperty.name);
  }

  return null;
}

function pluralizeItemClass(itemClass: string): string {
  // Se já está mapeado, usar o mapeamento
  if (CLASS_NORMALYZER[itemClass]) {
    return CLASS_NORMALYZER[itemClass];
  }

  // Se já termina com 's', provavelmente já é plural
  if (itemClass.endsWith('s')) {
    return itemClass;
  }

  // Fallback: adicionar 's'
  return `${itemClass}s`;
}

/**
 * Format mods with their suffix type.
 */
function formatMod(mod: TradeItemMod, suffix?: string): string {
  const cleanMod = stripBracketNotation(getModText(mod));
  return suffix ? `${cleanMod} (${suffix})` : cleanMod;
}

function inferAffixKind(name?: string): "Prefix" | "Suffix" {
  if (!name) {
    return "Prefix";
  }

  return /^of\b/i.test(name.trim()) ? "Suffix" : "Prefix";
}

function buildHeaderLabel(
  category: "implicit" | "explicit" | "fractured" | "desecrated" | "crafted",
  modData?: TradeItemExtendedMod
): string {
  if (category === "implicit") return "Implicit Modifier";

  const affix = inferAffixKind(modData?.name);

  if (category === "crafted") {
    return `Crafted ${affix} Modifier`;
  }

  if (category === "fractured") {
    return `Fractured ${affix} Modifier`;
  }

  if (category === "desecrated") {
    return `Desecrated ${affix} Modifier`;
  }

  return `${affix} Modifier`;
}

function addMagnitudeRanges(mod: string, magnitudes?: TradeItemExtendedMod["magnitudes"]): string {
  if (!magnitudes || magnitudes.length === 0) {
    return mod;
  }

  let index = 0;
  return mod.replace(NUMBER_RE, (value) => {
    const magnitude = magnitudes[index++];
    if (!magnitude) {
      return value;
    }

    if (magnitude.min === magnitude.max && magnitude.min === value) {
      return value;
    }

    return `${value}(${magnitude.min}-${magnitude.max})`;
  });
}

function extractNumericValues(text: string): number[] {
  return Array.from(text.matchAll(NUMBER_RE), (match) => parseFloat(match[1]));
}

function scoreMagnitudeMatch(values: number[], modData?: TradeItemExtendedMod): number {
  const magnitudes = modData?.magnitudes;
  if (!magnitudes || magnitudes.length === 0) {
    return values.length === 0 ? 0 : Number.NEGATIVE_INFINITY;
  }

  let score = values.length === magnitudes.length ? 20 : -Math.abs(values.length - magnitudes.length) * 10;
  const compareCount = Math.min(values.length, magnitudes.length);

  for (let index = 0; index < compareCount; index++) {
    const value = values[index];
    const magnitude = magnitudes[index];
    const min = parseFloat(magnitude.min);
    const max = parseFloat(magnitude.max);

    if (Number.isNaN(min) || Number.isNaN(max)) {
      continue;
    }

    if (value >= min && value <= max) {
      score += 50;
      continue;
    }

    const distance = value < min ? min - value : value - max;
    score -= distance * 5;
  }

  return score;
}

function matchModsToMetadata(
  mods: string[] | undefined,
  modData: TradeItemExtendedMod[] | undefined
): Array<TradeItemExtendedMod | undefined> {
  if (!mods || mods.length === 0 || !modData || modData.length === 0) {
    return mods?.map(() => undefined) ?? [];
  }

  const remaining = new Set(modData.map((_, index) => index));

  return mods.map((rawMod) => {
    const values = extractNumericValues(stripBracketNotation(rawMod));
    let bestIndex: number | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidateIndex of remaining) {
      const candidateScore = scoreMagnitudeMatch(values, modData[candidateIndex]);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestIndex = candidateIndex;
      }
    }

    if (bestIndex === undefined || bestScore === Number.NEGATIVE_INFINITY) {
      return undefined;
    }

    remaining.delete(bestIndex);
    return modData[bestIndex];
  });
}

function formatModernHeader(
  category: "implicit" | "explicit" | "fractured" | "desecrated" | "crafted",
  modData?: TradeItemExtendedMod
): string {
  const label = buildHeaderLabel(category, modData);
  const name = modData?.name ? ` \"${modData.name}\"` : "";
  const normalizedTier = modData?.tier?.match(/(\d+)$/)?.[1] ?? modData?.tier;
  const tier = normalizedTier ? ` (Tier: ${normalizedTier})` : "";

  return `{ ${label}${name}${tier} }`;
}

function buildModernModEntries(
  category: ModCategory,
  mods: TradeItemMod[] | undefined,
  modData: TradeItemExtendedMod[] | undefined
) : ModernModEntry[] {
  if (!mods || mods.length === 0) {
    return [];
  }

  // New object form: text, category and affix metadata are embedded per entry,
  // so no fuzzy matching against extended.mods is needed.
  if (mods.some(isModObject)) {
    return mods.map((mod) => ({
      category: getModCategory(mod, category),
      rawMod: getModText(mod),
      modData: getModMeta(mod),
    }));
  }

  // Legacy string form: match each mod to its parallel extended.mods metadata.
  const stringMods = mods as string[];
  const matchedMetadata = matchModsToMetadata(stringMods, modData);

  return stringMods.map((rawMod, index) => ({
    category,
    rawMod,
    modData: matchedMetadata[index],
  }));
}

function getModernAffixSortKey(entry: ModernModEntry): number {
  if (entry.category === "implicit") {
    return -10;
  }

  const affixKind = inferAffixKind(entry.modData?.name);
  const affixRank = affixKind === "Prefix" ? 0 : 10;
  const categoryRank = entry.category === "crafted" ? 5 : 0;

  return affixRank + categoryRank;
}

function pushModernModEntries(lines: string[], entries: ModernModEntry[]) {
  if (entries.length === 0) {
    return;
  }

  const sortedEntries = [...entries].sort(
    (left, right) => getModernAffixSortKey(left) - getModernAffixSortKey(right)
  );

  for (const entry of sortedEntries) {
    const cleanMod = stripBracketNotation(entry.rawMod);
    const rangedMod = addMagnitudeRanges(cleanMod, entry.modData?.magnitudes);

    lines.push(formatModernHeader(entry.category, entry.modData));
    lines.push(rangedMod);
  }
}

// --- Object-mod (newer API) grouped rendering -----------------------------
// The newer API embeds affix metadata in each mod and exposes extended.hashes,
// which lets us reproduce the in-game layout: hybrid affixes merged under one
// header, magnitude ranges mapped correctly, and mods ordered prefix→suffix.

type AffixKind = "implicit" | "prefix" | "suffix";

interface GroupedAffix {
  category: ModCategory;
  kind: AffixKind;
  affixIndex: number;
  name?: string;
  tier?: string;
  rawLines: string[]; // bracket-stripped, NOT yet range-annotated
  magnitudes: TradeItemExtendedMod["magnitudes"] | undefined;
}

const MOD_CATEGORY_ORDER: ModCategory[] = [
  "implicit",
  "fractured",
  "explicit",
  "desecrated",
  "crafted",
];

/** Map each full stat hash ("stat.<cat>.stat_x") to its affix group index. */
function buildAffixIndexLookup(item: TradeItem): Map<string, number> {
  const lookup = new Map<string, number>();
  const hashes = item.extended?.hashes;
  if (!hashes) return lookup;

  for (const entries of Object.values(hashes)) {
    if (!entries) continue;
    for (const [hash, indices] of entries) {
      const groupId = Array.isArray(indices) ? indices[0] : undefined;
      if (groupId === undefined || groupId === null) continue;
      // Mod objects carry "stat." + this hash.
      lookup.set(`stat.${hash}`, groupId);
    }
  }

  return lookup;
}

function affixKindFromTier(tier: string | undefined, category: ModCategory): AffixKind {
  if (category === "implicit") return "implicit";
  if (tier && /^p/i.test(tier)) return "prefix";
  if (tier && /^s/i.test(tier)) return "suffix";
  return "prefix";
}

/** Collect mods into affix groups (merging hybrids that share an affix index). */
function buildGroupedAffixes(item: TradeItem): GroupedAffix[] {
  const lookup = buildAffixIndexLookup(item);
  const arraysByCategory: Record<ModCategory, TradeItemMod[] | undefined> = {
    implicit: item.implicitMods,
    fractured: item.fracturedMods,
    explicit: item.explicitMods,
    desecrated: item.desecratedMods,
    crafted: item.craftedMods,
  };

  const groups = new Map<string, GroupedAffix>();
  const ordered: GroupedAffix[] = [];
  let synthetic = 100; // fallback index for mods absent from extended.hashes

  for (const fallbackCategory of MOD_CATEGORY_ORDER) {
    const mods = arraysByCategory[fallbackCategory];
    if (!mods) continue;

    for (const mod of mods) {
      const category = getModCategory(mod, fallbackCategory);
      const meta = getModMeta(mod);
      const text = stripBracketNotation(getModText(mod));
      const hash = isModObject(mod) ? mod.hash ?? "" : "";
      const known = lookup.has(hash);
      const affixIndex = known ? lookup.get(hash)! : synthetic++;
      // Merge only when the affix index is known (hybrids); otherwise keep
      // each mod as its own group.
      const key = known ? `${category}#${affixIndex}` : `u#${affixIndex}`;

      const existing = groups.get(key);
      if (existing) {
        existing.rawLines.push(text);
        continue;
      }

      const group: GroupedAffix = {
        category,
        kind: affixKindFromTier(meta?.tier, category),
        affixIndex,
        name: meta?.name || undefined,
        tier: meta?.tier,
        rawLines: [text],
        magnitudes: meta?.magnitudes,
      };
      groups.set(key, group);
      ordered.push(group);
    }
  }

  return ordered;
}

function groupedAffixSortKey(group: GroupedAffix): number {
  const kindRank = group.kind === "implicit" ? 0 : group.kind === "prefix" ? 1 : 2;
  const categoryRank =
    group.category === "fractured"
      ? 0
      : group.category === "explicit" || group.category === "implicit"
      ? 1
      : group.category === "desecrated"
      ? 2
      : 9; // crafted last within its kind
  return kindRank * 100000 + categoryRank * 1000 + group.affixIndex;
}

function buildGroupedHeader(group: GroupedAffix): string {
  const kindWord = group.kind === "suffix" ? "Suffix" : "Prefix";
  let label: string;
  if (group.kind === "implicit") {
    label = "Implicit Modifier";
  } else if (group.category === "fractured") {
    label = `Fractured ${kindWord} Modifier`;
  } else if (group.category === "crafted") {
    label = `Crafted ${kindWord} Modifier`;
  } else if (group.category === "desecrated") {
    label = `Desecrated ${kindWord} Modifier`;
  } else {
    label = `${kindWord} Modifier`;
  }

  const name = group.name ? ` "${group.name}"` : "";
  const normalizedTier = group.tier?.match(/(\d+)$/)?.[1] ?? group.tier;
  const tier = normalizedTier ? ` (Tier: ${normalizedTier})` : "";

  return `{ ${label}${name}${tier} }`;
}

function pushGroupedAffixes(lines: string[], groups: GroupedAffix[]) {
  const sorted = [...groups].sort(
    (left, right) => groupedAffixSortKey(left) - groupedAffixSortKey(right)
  );

  for (const group of sorted) {
    // Apply ranges across the whole affix block so each stat line maps to its
    // own magnitude (fixes hybrid affixes like evasion+life sharing one affix).
    const block = group.rawLines.join("\n");
    const ranged = addMagnitudeRanges(block, group.magnitudes);

    lines.push(buildGroupedHeader(group));
    lines.push(...ranged.split("\n"));
  }
}

function formatItemTextLegacy(item: TradeItem): string {
  const lines: string[] = [];

  // Item Class
  const itemClass = getItemClass(item.properties);
  if (itemClass) {
    const pluralClass = pluralizeItemClass(itemClass);
    lines.push(`Item Class: ${pluralClass}`);
  }

  // Rarity
  lines.push(`Rarity: ${item.rarity}`);

  // Name (for rare/unique items)
  if (item.name && (item.rarity === "Rare" || item.rarity === "Unique")) {
    lines.push(item.name);
  }

  // Type line (base type)
  lines.push(item.typeLine);

  // Properties (Quality, Armour, etc.)
  if (item.properties && item.properties.length > 0) {
    const propLines = formatProperties(item.properties);
    if (propLines.length > 0) {
      lines.push(SEPARATOR);
      lines.push(...propLines);
    }
  }

  // Requirements
  if (item.requirements && item.requirements.length > 0) {
    lines.push(SEPARATOR);
    lines.push(...formatRequirements(item.requirements));
  }

  // Sockets
  const socketsLine = formatSockets(item.sockets);
  if (socketsLine) {
    lines.push(SEPARATOR);
    lines.push(socketsLine);
  }

  // Item Level
  lines.push(SEPARATOR);
  lines.push(`Item Level: ${item.ilvl}`);

  // Rune mods (if any)
  if (item.runeMods && item.runeMods.length > 0) {
    lines.push(SEPARATOR);
    for (const mod of item.runeMods) {
      lines.push(formatMod(mod, "rune"));
    }
  }

  // Enchant mods (if any)
  if (item.enchantMods && item.enchantMods.length > 0) {
    lines.push(SEPARATOR);
    for (const mod of item.enchantMods) {
      lines.push(formatMod(mod, "enchant"));
    }
  }

  // Implicit mods
  if (item.implicitMods && item.implicitMods.length > 0) {
    lines.push(SEPARATOR);
    for (const mod of item.implicitMods) {
      lines.push(formatMod(mod, "implicit"));
    }
  }

  // Explicit + fractured + desecrated mods juntos (como no jogo)
  const explicitBlock: string[] = [];

  if (item.fracturedMods && item.fracturedMods.length > 0) {
    for (const mod of item.fracturedMods) {
      explicitBlock.push(formatMod(mod, "fractured"));
    }
  }

  if (item.explicitMods && item.explicitMods.length > 0) {
    for (const mod of item.explicitMods) {
      explicitBlock.push(formatMod(mod));
    }
  }

  if (item.desecratedMods && item.desecratedMods.length > 0) {
    for (const mod of item.desecratedMods) {
      explicitBlock.push(formatMod(mod, "desecrated"));
    }
  }

  if (explicitBlock.length > 0) {
    lines.push(SEPARATOR);
    lines.push(...explicitBlock);
  }

  // Crafted mods (ficam em bloco separado, se existirem)
  if (item.mutatedMods && item.mutatedMods.length > 0) {
    for (const mod of item.mutatedMods) {
      lines.push(formatMod(mod, "mutated"));
    }
  }

  // Crafted mods
  if (item.craftedMods && item.craftedMods.length > 0) {
    lines.push(SEPARATOR);
    for (const mod of item.craftedMods) {
      lines.push(formatMod(mod, "crafted"));
    }
  }

  // Fractured Item flag (linha extra, como no jogo)
  if (item.fractured) {
    lines.push(SEPARATOR);
    lines.push("Fractured Item");
  }

  // Corrupted
  if (item.corrupted) {
    lines.push(SEPARATOR);
    lines.push("Corrupted");
  }

  // Flavour text (for uniques)
  if (item.flavourText && item.flavourText.length > 0) {
    lines.push(SEPARATOR);
    for (const text of item.flavourText) {
      lines.push(text);
    }
  }

  // Note (price)
  if (item.note) {
    lines.push(SEPARATOR);
    lines.push(`Note: ${item.note}`);
  }

  return lines.join("\n");
}

function formatItemTextModern(item: TradeItem): string {
  const lines: string[] = [];

  const itemClass = getItemClass(item.properties);
  if (itemClass) {
    const pluralClass = pluralizeItemClass(itemClass);
    lines.push(`Item Class: ${pluralClass}`);
  }

  lines.push(`Rarity: ${item.rarity}`);

  if (item.name && (item.rarity === "Rare" || item.rarity === "Unique")) {
    lines.push(item.name);
  }

  lines.push(item.typeLine);

  if (item.properties && item.properties.length > 0) {
    const propLines = formatProperties(item.properties);
    if (propLines.length > 0) {
      lines.push(SEPARATOR);
      lines.push(...propLines);
    }
  }

  if (item.requirements && item.requirements.length > 0) {
    lines.push(SEPARATOR);
    lines.push(...formatRequirements(item.requirements));
  }

  const socketsLine = formatSockets(item.sockets);
  if (socketsLine) {
    lines.push(SEPARATOR);
    lines.push(socketsLine);
  }

  lines.push(SEPARATOR);
  lines.push(`Item Level: ${item.ilvl}`);

  // "Bonded" rune lines are a secondary socket effect the game omits from the
  // item's own mod list, so drop them to match the in-game copy.
  const runeMods = (item.runeMods ?? []).filter(
    (mod) => !/^bonded\b/i.test(stripBracketNotation(getModText(mod)))
  );
  if (runeMods.length > 0) {
    lines.push(SEPARATOR);
    for (const mod of runeMods) {
      lines.push(formatMod(mod, "rune"));
    }
  }

  if (item.enchantMods && item.enchantMods.length > 0) {
    lines.push(SEPARATOR);
    for (const mod of item.enchantMods) {
      lines.push(formatMod(mod, "enchant"));
    }
  }

  const hasModHeaders =
    (item.implicitMods && item.implicitMods.length > 0) ||
    (item.fracturedMods && item.fracturedMods.length > 0) ||
    (item.explicitMods && item.explicitMods.length > 0) ||
    (item.desecratedMods && item.desecratedMods.length > 0);

  if (hasModHeaders) {
    lines.push(SEPARATOR);
  }

  if (hasObjectMods(item)) {
    // Newer API: group hybrids, order by affix, map ranges via extended.hashes.
    pushGroupedAffixes(lines, buildGroupedAffixes(item));
  } else {
    const modernModEntries = [
      ...buildModernModEntries(
        "implicit",
        item.implicitMods,
        item.extended?.mods?.implicit
      ),
      ...buildModernModEntries(
        "fractured",
        item.fracturedMods,
        item.extended?.mods?.fractured
      ),
      ...buildModernModEntries(
        "explicit",
        item.explicitMods,
        item.extended?.mods?.explicit
      ),
      ...buildModernModEntries(
        "desecrated",
        item.desecratedMods,
        item.extended?.mods?.desecrated
      ),
      ...buildModernModEntries("crafted", item.craftedMods, undefined),
    ];

    pushModernModEntries(lines, modernModEntries);
  }

  if (item.mutatedMods && item.mutatedMods.length > 0) {
    for (const mod of item.mutatedMods) {
      lines.push(formatMod(mod, "mutated"));
    }
  }

  // The game lists Corrupted before Fractured Item.
  if (item.corrupted) {
    lines.push(SEPARATOR);
    lines.push("Corrupted");
  }

  if (item.fractured) {
    lines.push(SEPARATOR);
    lines.push("Fractured Item");
  }

  if (item.flavourText && item.flavourText.length > 0) {
    lines.push(SEPARATOR);
    for (const text of item.flavourText) {
      lines.push(text);
    }
  }

  if (item.note) {
    lines.push(SEPARATOR);
    lines.push(`Note: ${item.note}`);
  }

  return lines.join("\n");
}

/**
 * Convert a TradeItem from the API to the game's raw text format.
 */
export function formatItemText(
  item: TradeItem,
  options: FormatItemTextOptions = {}
): string {
  if (options.mode === "modern") {
    const hasExtendedMods =
      !!item.extended?.mods?.explicit ||
      !!item.extended?.mods?.implicit ||
      !!item.extended?.mods?.fractured ||
      !!item.extended?.mods?.desecrated;

    // Newer API items carry no extended.mods but embed metadata in object mods.
    if (!hasExtendedMods && !hasObjectMods(item)) {
      return formatItemTextLegacy(item);
    }

    return formatItemTextModern(item);
  }

  return formatItemTextLegacy(item);
}