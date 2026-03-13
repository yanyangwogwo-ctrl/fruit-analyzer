import { normalizeEnrichmentResult, type FruitEnrichmentResult } from "@/lib/enrichment";

/**
 * Merges stage-1 analysis data with stage-2 enrichment into a single catalog-ready object.
 * Stage-1 fields remain at top level; stage-2 fields live under `enrichment`.
 * Used for in-place upgrade from analyze card to deep catalog card and for saving.
 */
export function mergeAnalyzeAndEnrich(
  stage1Data: Record<string, unknown> | null,
  enrichData: FruitEnrichmentResult | Record<string, unknown> | null
): Record<string, unknown> & { enrichment?: FruitEnrichmentResult } {
  if (!stage1Data || typeof stage1Data !== "object") {
    return enrichData ? { enrichment: normalizeEnrichmentResult(enrichData) } : {};
  }
  const enrichment = enrichData ? normalizeEnrichmentResult(enrichData) : undefined;
  return {
    ...stage1Data,
    ...(enrichment ? { enrichment } : {}),
  };
}
