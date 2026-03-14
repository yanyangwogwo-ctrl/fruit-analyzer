export const ENRICHMENT_RARITY_HINTS = [
  "mass_market",
  "regional_specialty",
  "premium_variety",
  "luxury_gift",
  "auction_grade",
] as const;

export type FruitRarityHint = (typeof ENRICHMENT_RARITY_HINTS)[number];

/** Allowed for user edits; AI still uses enum values. */
export type FruitEnrichmentResult = {
  standout_sensory_traits: string[];
  season: string;
  common_regions: string[];
  rarity_hint: FruitRarityHint | string;
  market_position: string;
  background_lore: string[];
  practical_guide: string[];
  catalog_summary: string;
};

export type FruitEnrichmentPayload = {
  fruit_category: string;
  confirmed_variety: string;
  confirmed_origin: string;
  ocr_package_info: string[];
};

const RARITY_HINT_SET = new Set<string>(ENRICHMENT_RARITY_HINTS);

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Strict: for AI output only. Enforces enum and array filters. */
export function normalizeEnrichmentResult(raw: unknown): FruitEnrichmentResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rarity = normalizeString(obj.rarity_hint);
  return {
    standout_sensory_traits: normalizeStringArray(obj.standout_sensory_traits),
    season: normalizeString(obj.season),
    common_regions: normalizeStringArray(obj.common_regions),
    rarity_hint: RARITY_HINT_SET.has(rarity) ? (rarity as FruitRarityHint) : "mass_market",
    market_position: normalizeString(obj.market_position),
    background_lore: normalizeStringArray(obj.background_lore),
    practical_guide: normalizeStringArray(obj.practical_guide),
    catalog_summary: normalizeString(obj.catalog_summary),
  };
}

function toArrayFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : String(item).trim())).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Lenient: for user edits and DB load. No enum/length constraints; arrays from newline-separated text. */
export function normalizeEnrichmentResultLenient(raw: unknown): FruitEnrichmentResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rarity = typeof obj.rarity_hint === "string" ? obj.rarity_hint.trim() : "";
  return {
    standout_sensory_traits: toArrayFromUnknown(obj.standout_sensory_traits),
    season: typeof obj.season === "string" ? obj.season.trim() : "",
    common_regions: toArrayFromUnknown(obj.common_regions),
    rarity_hint: rarity || "mass_market",
    market_position: typeof obj.market_position === "string" ? obj.market_position.trim() : "",
    background_lore: toArrayFromUnknown(obj.background_lore),
    practical_guide: toArrayFromUnknown(obj.practical_guide),
    catalog_summary: typeof obj.catalog_summary === "string" ? obj.catalog_summary.trim() : "",
  };
}

export function getGuideIcon(text: string): string {
  if (text.includes("冷")) return "🧊";
  if (text.includes("熟") || text.includes("放")) return "⏳";
  return "🔸";
}
