import { create } from "zustand";
import type { AnalysisResult } from "@/lib/fruitProfile";
import type { FruitEnrichmentResult } from "@/lib/enrichment";

export type ResultMode = "analyze" | "deep";

type AnalyzeDraftState = {
  images: string[];
  analyzedImages: string[];
  stage1Result: AnalysisResult | null;
  rawStage1Result: Record<string, unknown> | null;
  analysisError: string | null;
  enrichmentResult: FruitEnrichmentResult | null;
  enrichmentError: string | null;
  isAnalyzing: boolean;
  isEnriching: boolean;
  hasAnalyzed: boolean;
  resultMode: ResultMode;
  finalCatalogData: Record<string, unknown> | null;
  setImages: (images: string[]) => void;
  setAnalyzedImages: (images: string[]) => void;
  setStage1Result: (result: AnalysisResult | null, raw?: Record<string, unknown> | null) => void;
  setAnalysisError: (error: string | null) => void;
  setEnrichmentResult: (result: FruitEnrichmentResult | null) => void;
  setEnrichmentError: (error: string | null) => void;
  setIsAnalyzing: (value: boolean) => void;
  setIsEnriching: (value: boolean) => void;
  setHasAnalyzed: (value: boolean) => void;
  setResultMode: (mode: ResultMode) => void;
  setFinalCatalogData: (data: Record<string, unknown> | null) => void;
  updateStage1Field: (field: "possible_variety_display" | "brand_or_farm_display" | "origin_display", value: string) => void;
  clearDraft: () => void;
};

const initialState = {
  images: [] as string[],
  analyzedImages: [] as string[],
  stage1Result: null as AnalysisResult | null,
  rawStage1Result: null as Record<string, unknown> | null,
  analysisError: null as string | null,
  enrichmentResult: null as FruitEnrichmentResult | null,
  enrichmentError: null as string | null,
  isAnalyzing: false,
  isEnriching: false,
  hasAnalyzed: false,
  resultMode: "analyze" as ResultMode,
  finalCatalogData: null as Record<string, unknown> | null,
};

export const useAnalyzeStore = create<AnalyzeDraftState>()((set) => ({
  ...initialState,
  setImages: (images) => set({ images }),
  setAnalyzedImages: (images) => set({ analyzedImages: images }),
  setStage1Result: (result, raw) =>
    set({
      stage1Result: result,
      rawStage1Result: typeof raw === "object" || raw === null ? (raw as Record<string, unknown> | null) : null,
      resultMode: "analyze",
      finalCatalogData: null,
    }),
  setAnalysisError: (analysisError) => set({ analysisError }),
  setEnrichmentResult: (enrichmentResult) => set({ enrichmentResult }),
  setEnrichmentError: (enrichmentError) => set({ enrichmentError }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setIsEnriching: (isEnriching) => set({ isEnriching }),
  setHasAnalyzed: (hasAnalyzed) => set({ hasAnalyzed }),
  setResultMode: (resultMode) => set({ resultMode }),
  setFinalCatalogData: (finalCatalogData) => set({ finalCatalogData }),
  updateStage1Field: (field, value) =>
    set((state) => {
      if (!state.stage1Result) return state;
      const nextStage1: AnalysisResult = { ...state.stage1Result, [field]: value };
      const nextRaw: Record<string, unknown> = {
        ...(state.rawStage1Result ?? {}),
        [field]: value,
      };
      return {
        stage1Result: nextStage1,
        rawStage1Result: nextRaw,
        resultMode: "analyze",
        finalCatalogData: null,
      };
    }),
  clearDraft: () => set({ ...initialState }),
}));


