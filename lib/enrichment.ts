export const ENRICHMENT_RARITY_HINTS = [
  "mass_market",
  "regional_specialty",
  "premium_variety",
  "luxury_gift",
  "auction_grade",
] as const;

export type FruitRarityHint = (typeof ENRICHMENT_RARITY_HINTS)[number];

export type FruitEnrichmentResult = {
  standout_sensory_traits: string[];
  season: string;
  common_regions: string[];
  rarity_hint: FruitRarityHint;
  market_position: string;
  background_lore: string[];
  practical_guide: string[];
  catalog_summary: string;
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

export function getRarityBadge(rarityHint: FruitRarityHint): { label: string; className: string } {
  if (rarityHint === "auction_grade") {
    return {
      label: "SSR",
      className:
        "border-amber-300 bg-amber-100 text-amber-900 shadow-[0_0_12px_rgba(251,191,36,0.45)]",
    };
  }
  if (rarityHint === "luxury_gift") {
    return {
      label: "SR",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (rarityHint === "premium_variety") {
    return {
      label: "R+",
      className: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }
  if (rarityHint === "regional_specialty") {
    return {
      label: "R",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }
  return {
    label: "N",
    className: "border-gray-200 bg-gray-50 text-gray-600",
  };
}

export function getGuideIcon(text: string): string {
  if (text.includes("冷")) return "🧊";
  if (text.includes("熟") || text.includes("放")) return "⏳";
  return "🔸";
}
