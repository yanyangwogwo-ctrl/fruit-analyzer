import { type FruitRarityHint } from "@/lib/enrichment";

type RarityTier = "N" | "R" | "R+" | "SR" | "SSR";

export function getRarityBadge(hint: unknown): {
  tier: RarityTier;
  label: string;
  className: string;
} {
  const normalizedHint: FruitRarityHint =
    hint === "regional_specialty" ||
    hint === "premium_variety" ||
    hint === "luxury_gift" ||
    hint === "auction_grade"
      ? hint
      : "mass_market";

  if (normalizedHint === "auction_grade") {
    return {
      tier: "SSR",
      label: "夢幻極品",
      className: "text-amber-500 bg-amber-50 border-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.35)]",
    };
  }
  if (normalizedHint === "luxury_gift") {
    return {
      tier: "SR",
      label: "高端禮盒",
      className: "text-purple-600 bg-purple-50 border-purple-200",
    };
  }
  if (normalizedHint === "premium_variety") {
    return {
      tier: "R+",
      label: "精品品種",
      className: "text-indigo-600 bg-indigo-50 border-indigo-200",
    };
  }
  if (normalizedHint === "regional_specialty") {
    return {
      tier: "R",
      label: "區域特產",
      className: "text-blue-600 bg-blue-50 border-blue-200",
    };
  }
  return {
    tier: "N",
    label: "國民日常",
    className: "text-gray-500 bg-gray-50 border-gray-200",
  };
}
