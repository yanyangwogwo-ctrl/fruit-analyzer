import Dexie, { type Table } from "dexie";
import { normalizeAnalysisResult } from "@/lib/fruitProfile";
import {
  normalizeEnrichmentResult,
  normalizeEnrichmentResultLenient,
  type FruitEnrichmentResult,
} from "@/lib/enrichment";
import {
  normalizeAnalysisRecordFields,
  normalizeCatalogCoreFields,
} from "@/lib/normalizer";

export type CatalogStatus = "want" | "tried";

export type FruitCatalogEntry = {
  id?: number;
  image_data: string;
  images: string[];
  image_hash?: string;
  created_at: number;
  updated_at: number;
  app_version: string;
  analysis_result: Record<string, unknown>;
  fruit_category_display: string;
  fruit_category_original: string;
  identified_product_name: string;
  possible_variety_display: string;
  possible_variety_original: string;
  possible_variety_basis: string;
  variety_characteristics: string;
  origin_display: string;
  brand_or_farm_display: string;
  season_months: string;
  status: CatalogStatus;
  rating: number | null;
  tasting_note: string;
  is_edited: boolean;
  enrichment?: FruitEnrichmentResult;
  /** "cover" = fill card; "contain" = full image + blur background. Default cover. */
  imageDisplayMode?: "cover" | "contain";
  /** Crop for thumbnail: cropX/cropY 0–100, zoom >= 1 (cover) or >= 0.5 (contain). null = no crop. */
  thumbnailCrop?: { cropX: number; cropY: number; zoom: number } | null;
};

class FruitCatalogDB extends Dexie {
  entries!: Table<FruitCatalogEntry, number>;

  constructor() {
    super("fruitCatalogDB");
    this.version(1).stores({
      entries: "++id, created_at, fruit_category_display, possible_variety_display, origin_display",
    });
    this.version(2)
      .stores({
        entries:
          "++id, created_at, updated_at, status, fruit_category_display, possible_variety_display, origin_display, *tags",
      })
      .upgrade(async (tx) => {
        await tx
          .table("entries")
          .toCollection()
          .modify((entry) => {
            Object.assign(entry, normalizeCatalogEntry(entry as Record<string, unknown>));
          });
      });
  }
}

export const catalogDB = new FruitCatalogDB();

function normalizeRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 2) / 2;
  if (rounded < 0 || rounded > 5) return null;
  return rounded;
}

function normalizeImageArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.startsWith("data:image/"))
    .slice(0, 3);
}

export function getEntryImages(entry: Partial<Pick<FruitCatalogEntry, "images" | "image_data">>): string[] {
  const fromImages = normalizeImageArray(entry.images);
  if (fromImages.length > 0) return fromImages;
  if (typeof entry.image_data === "string" && entry.image_data.startsWith("data:image/")) {
    return [entry.image_data];
  }
  return [];
}

export function normalizeCatalogEntry(raw: Record<string, unknown>): FruitCatalogEntry {
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const bool = (value: unknown) => value === true;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

  const analysisResultRaw =
    raw.analysis_result && typeof raw.analysis_result === "object"
      ? (raw.analysis_result as Record<string, unknown>)
      : {};
  const analysisResult = normalizeAnalysisRecordFields(analysisResultRaw);
  const normalizedAnalysis = normalizeAnalysisResult(analysisResult);
  const analysisStr = (key: string) => str(analysisResult[key]);
  const createdAt = num(raw.created_at) ?? Date.now();
  const status: CatalogStatus = raw.status === "tried" ? "tried" : "want";
  const rating = normalizeRating(raw.rating);
  const enrichment =
    raw.enrichment && typeof raw.enrichment === "object"
      ? normalizeEnrichmentResultLenient(raw.enrichment)
      : undefined;

  const normalizedCore = normalizeCatalogCoreFields({
    fruit_category_display:
      str(raw.fruit_category_display) || normalizedAnalysis.fruit_category_display,
    possible_variety_display:
      str(raw.possible_variety_display) || normalizedAnalysis.possible_variety_display,
    possible_variety_original:
      str(raw.possible_variety_original) || normalizedAnalysis.possible_variety_original,
    origin_display: str(raw.origin_display) || normalizedAnalysis.origin_display,
  });

  const normalizedImages = getEntryImages({
    images: normalizeImageArray(raw.images),
    image_data: str(raw.image_data),
  });
  const coverImage = normalizedImages[0] ?? "";
  const imageDisplayMode = raw.imageDisplayMode === "contain" ? "contain" : "cover";
  const rawCrop = raw.thumbnailCrop;
  const thumbnailCrop =
    rawCrop &&
    typeof rawCrop === "object" &&
    typeof (rawCrop as Record<string, unknown>).cropX === "number" &&
    typeof (rawCrop as Record<string, unknown>).cropY === "number" &&
    typeof (rawCrop as Record<string, unknown>).zoom === "number"
      ? {
          cropX: (rawCrop as { cropX: number }).cropX,
          cropY: (rawCrop as { cropY: number }).cropY,
          zoom: Math.max(0.5, (rawCrop as { zoom: number }).zoom),
        }
      : undefined;

  return {
    id: num(raw.id) ?? undefined,
    image_data: coverImage,
    images: normalizedImages,
    image_hash: str(raw.image_hash) || undefined,
    created_at: createdAt,
    updated_at: num(raw.updated_at) ?? createdAt,
    app_version: str(raw.app_version),
    analysis_result: analysisResult,
    fruit_category_display: normalizedCore.fruit_category_display,
    fruit_category_original: str(raw.fruit_category_original) || analysisStr("fruit_category_original"),
    identified_product_name:
      str(raw.identified_product_name) || analysisStr("identified_product_name"),
    possible_variety_display: normalizedCore.possible_variety_display,
    possible_variety_original: normalizedCore.possible_variety_original,
    possible_variety_basis: str(raw.possible_variety_basis) || analysisStr("possible_variety_basis"),
    variety_characteristics:
      str(raw.variety_characteristics) || normalizedAnalysis.variety_characteristics,
    origin_display: normalizedCore.origin_display,
    brand_or_farm_display:
      str(raw.brand_or_farm_display) || normalizedAnalysis.brand_or_farm_display,
    season_months: str(raw.season_months) || normalizedAnalysis.season_months,
    status,
    rating,
    tasting_note: str(raw.tasting_note),
    is_edited: bool(raw.is_edited),
    enrichment,
    imageDisplayMode,
    thumbnailCrop,
  };
}

export type CatalogSaveDraft = {
  possible_variety_display: string;
  origin_display: string;
  status: CatalogStatus;
  rating: number | null;
  tasting_note: string;
};

export function createCatalogSaveDraftFromAnalysis(analysisResult: Record<string, unknown>): CatalogSaveDraft {
  const normalizedRecord = normalizeAnalysisRecordFields(analysisResult);
  const normalized = normalizeAnalysisResult(normalizedRecord);
  return {
    possible_variety_display: normalized.possible_variety_display,
    origin_display: normalized.origin_display,
    status: "want",
    rating: null,
    tasting_note: "",
  };
}

export function createCatalogEntryFromAnalysis(input: {
  image_data?: string;
  images?: string[];
  analysis_result: Record<string, unknown>;
  app_version: string;
  created_at?: number;
  overrides?: Partial<CatalogSaveDraft>;
  is_edited?: boolean;
  enrichment?: FruitEnrichmentResult | null;
}): Omit<FruitCatalogEntry, "id"> {
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const normalizedAnalysisRecord = normalizeAnalysisRecordFields(input.analysis_result);
  const normalized = normalizeAnalysisResult(normalizedAnalysisRecord);
  const draftDefaults = createCatalogSaveDraftFromAnalysis(normalizedAnalysisRecord);
  const status = input.overrides?.status === "tried" ? "tried" : draftDefaults.status;
  const rating = normalizeRating(input.overrides?.rating);
  const normalizedOverrideCore = normalizeCatalogCoreFields({
    fruit_category_display: normalized.fruit_category_display,
    possible_variety_display:
      input.overrides?.possible_variety_display ?? draftDefaults.possible_variety_display,
    possible_variety_original: normalized.possible_variety_original,
    origin_display: input.overrides?.origin_display ?? draftDefaults.origin_display,
  });
  const timestamp = input.created_at ?? Date.now();

  const images = getEntryImages({
    images: input.images,
    image_data: input.image_data,
  });
  const coverImage = images[0] ?? "";
  const enrichment = input.enrichment ? normalizeEnrichmentResult(input.enrichment) : undefined;

  return {
    image_data: coverImage,
    images,
    created_at: timestamp,
    updated_at: timestamp,
    app_version: input.app_version,
    analysis_result: normalizedAnalysisRecord,
    fruit_category_display: normalized.fruit_category_display,
    fruit_category_original: str(normalizedAnalysisRecord.fruit_category_original),
    identified_product_name: str(normalizedAnalysisRecord.identified_product_name),
    possible_variety_display: normalizedOverrideCore.possible_variety_display,
    possible_variety_original: normalizedOverrideCore.possible_variety_original,
    possible_variety_basis: str(normalizedAnalysisRecord.possible_variety_basis),
    variety_characteristics: normalized.variety_characteristics,
    origin_display: normalizedOverrideCore.origin_display,
    brand_or_farm_display: normalized.brand_or_farm_display,
    season_months: normalized.season_months,
    status,
    rating,
    tasting_note: input.overrides?.tasting_note ?? draftDefaults.tasting_note,
    is_edited: input.is_edited ?? false,
    enrichment,
    imageDisplayMode: "cover",
    thumbnailCrop: undefined,
  };
}

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortObject(item));
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const sorted: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sorted[key] = stableSortObject(obj[key]);
    }
    return sorted;
  }

  return value;
}

export function serializeAnalysisResult(result: Record<string, unknown>): string {
  return JSON.stringify(stableSortObject(result));
}
