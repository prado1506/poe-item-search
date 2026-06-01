/**
 * Normalizes Path of Exile 0.5+ in-game item text into the legacy line format
 * that the stat matcher (stat.js / item.js) understands.
 *
 * The 0.5 patch changed the text you get when copying an item in-game in two ways:
 *
 *   1. Roll ranges are embedded in the value:
 *        "+35(30-39) to maximum Life"  ->  "+35 to maximum Life"
 *      The number before the parentheses is the actual rolled value; the
 *      "(min-max)" part is only informational and breaks the per-line regex.
 *
 *   2. Each mod is preceded by an annotation header carrying its type:
 *        "{ Implicit Modifier — Mana }"
 *        "{ Prefix Modifier \"Magpie's\" (Tier: 3) }"
 *        "{ Desecrated Suffix Modifier ... }"
 *      The legacy inline tags ("(implicit)", "(fractured)", "(desecrated)")
 *      that the matcher relies on are gone, so we re-attach them from the header
 *      and drop the header line itself. Prefix/Suffix/Unique/Crafted all map to
 *      plain explicit lines (no tag), matching the legacy format.
 *
 * If the text contains neither headers nor roll ranges (legacy game text or text
 * rebuilt from the trade API via itemFormatter), it is returned unchanged.
 */

const SEPARATOR = "--------";

// A modifier annotation header line, e.g. "{ Prefix Modifier "..." (Tier: 3) — ... }".
const HEADER_RE = /^\{.*\}$/;

// Detects whether the text uses the new annotation-header format.
const HAS_HEADERS_RE = /\{[^}]*\b(?:Modifier|Enhancement)\b[^}]*\}/;

// Detects an embedded roll range like "35(30-39)" or "6.45(6-6.9)" (incl. inverted).
const HAS_RANGES_RE = /\d\((?:[+-]?\d)/;

// Matches "<value>(<min>-<max>)" and keeps only <value>.
const RANGE_RE =
  /(\d+(?:\.\d+)?)\((?:[+-]?\d+(?:\.\d+)?)-(?:[+-]?\d+(?:\.\d+)?)\)/g;

// Mods that already carry an inline tag must not be tagged again (e.g. runes).
const INLINE_TAG_RE =
  /\((?:implicit|fractured|desecrated|rune|enchant|crafted|augment)\)$/;

function collapseRanges(line) {
  return line.replace(RANGE_RE, "$1");
}

function typeFromHeader(header) {
  const lower = header.toLowerCase();
  if (lower.includes("implicit")) return "implicit";
  if (lower.includes("desecrated")) return "desecrated";
  if (lower.includes("fractured")) return "fractured";
  // Prefix / Suffix / Unique / Crafted / Corruption Enhancement -> explicit
  return "explicit";
}

export function normalizeItemText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return text;
  }

  if (!HAS_HEADERS_RE.test(text) && !HAS_RANGES_RE.test(text)) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  const out = [];
  let currentType = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === SEPARATOR || trimmed === "") {
      // Separators and blank lines end the current modifier block.
      currentType = null;
      out.push(line);
      continue;
    }

    if (HEADER_RE.test(trimmed)) {
      // Annotation header: remember the type, drop the line.
      currentType = typeFromHeader(trimmed);
      continue;
    }

    let processed = collapseRanges(line);

    const needsTag =
      currentType === "implicit" ||
      currentType === "desecrated" ||
      currentType === "fractured";

    if (needsTag && !INLINE_TAG_RE.test(processed.trim())) {
      processed = `${processed} (${currentType})`;
    }

    out.push(processed);
  }

  return out.join("\n");
}
