/**
 * Types for PoE Trade API item responses.
 * Based on /api/trade2/fetch/{item_id} response structure.
 */

export interface TradeItemProperty {
  name: string;
  values: [string, number][]; // [value, augmented_flag] - augmented_flag 1 = (augmented)
  displayMode: number;
  type?: number;
}

export interface TradeItemRequirement {
  name: string;
  values: [string, number][];
  displayMode: number;
  type?: number;
}

export interface TradeItemSocket {
  group: number;
  attr?: string; // Socket attribute (S for skill, etc.)
}

export interface TradeItemExtendedMod {
  name: string;
  tier: string;
  level: number;
  magnitudes: {
    hash?: string;
    min: string;
    max: string;
  }[];
}

/**
 * Object-form mod entry returned by the newer PoE2 trade API. The mod arrays
 * (explicitMods, implicitMods, ...) used to be plain strings; they now hold
 * objects that embed the display text, a stat hash, category flags and the
 * affix metadata (name/tier/magnitudes) that previously lived in extended.mods.
 */
export interface TradeItemModObject {
  description?: string;
  hash?: string; // e.g. "stat.fractured.stat_1573130764"
  flags?: {
    fractured?: boolean;
    crafted?: boolean;
    [key: string]: boolean | undefined;
  };
  mods?: Array<{
    name?: string;
    tier?: string;
    level?: number;
    magnitudes?: Array<{ hash?: string; min: string; max: string }>;
  }>;
}

/** A mod entry is either the legacy string form or the new object form. */
export type TradeItemMod = string | TradeItemModObject;

export interface TradeItemExtended {
  ar?: number; // Armour
  ev?: number; // Evasion
  es?: number; // Energy Shield
  mods?: {
    explicit?: TradeItemExtendedMod[];
    implicit?: TradeItemExtendedMod[];
    fractured?: TradeItemExtendedMod[];
    desecrated?: TradeItemExtendedMod[];
    rune?: TradeItemExtendedMod[];
    enchant?: TradeItemExtendedMod[];
  };
  // Maps each stat hash to the affix (group) index that produced it. Stats that
  // share an index belong to the same affix (hybrids). Present per category.
  hashes?: {
    explicit?: [string, number[] | null][];
    implicit?: [string, number[] | null][];
    fractured?: [string, number[] | null][];
    desecrated?: [string, number[] | null][];
    crafted?: [string, number[] | null][];
    rune?: [string, number[] | null][];
    enchant?: [string, number[] | null][];
    pseudo?: [string, number[] | null][];
  };
}

export interface TradeItem {
  id: string;
  realm: string;
  verified: boolean;
  w: number; // width
  h: number; // height
  icon: string;
  league: string;
  name: string;
  typeLine: string;
  baseType: string;
  rarity: "Normal" | "Magic" | "Rare" | "Unique";
  frameType: number; // 0=Normal, 1=Magic, 2=Rare, 3=Unique
  ilvl: number;
  identified: boolean;
  corrupted?: boolean;
  note?: string; // Price note (e.g., "~b/o 1 exalted")
  properties?: TradeItemProperty[];
  requirements?: TradeItemRequirement[];
  sockets?: TradeItemSocket[];
  socketedItems?: unknown[];
  implicitMods?: TradeItemMod[];
  explicitMods?: TradeItemMod[];
  fracturedMods?: TradeItemMod[];
  desecratedMods?: TradeItemMod[];
  mutatedMods?: TradeItemMod[];
  runeMods?: TradeItemMod[];
  enchantMods?: TradeItemMod[];
  craftedMods?: TradeItemMod[];
  fractured?: boolean;
  desecrated?: boolean;
  mutated?: boolean;
  flavourText?: string[];
  extended?: TradeItemExtended;
}

export interface TradeItemListing {
  method: string;
  indexed: string;
  stash: {
    name: string;
    x: number;
    y: number;
  };
  whisper: string;
  whisper_token: string;
  account: {
    name: string;
    online?: {
      league: string;
      status?: string;
    };
    lastCharacterName: string;
    language: string;
    realm: string;
  };
  price?: {
    type: string;
    amount: number;
    currency: string;
  };
}

export interface TradeItemResult {
  id: string;
  listing: TradeItemListing;
  item: TradeItem;
}

export interface TradeFetchResponse {
  result: TradeItemResult[];
}