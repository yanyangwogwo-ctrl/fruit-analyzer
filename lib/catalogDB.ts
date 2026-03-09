import Dexie, { type Table } from "dexie";
import { normalizeAnalysisResult } from "@/lib/fruitProfile";

export type CatalogStatus = "want" | "tried";

export type FruitCatalogEntry = {
  id?: number;
  image_data: string;
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
  summary_zh_tw: string;
  notes: string;
  status: CatalogStatus;
  rating: number | null;
  tasting_note: string;
  tags: string[];
  is_edited: boolean;
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

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "");
}

function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizeTag(value))
    .filter((value) => value.length > 0);
  return Array.from(new Set(normalized));
}

function extractOriginTags(originDisplay: string): string[] {
  const value = originDisplay.trim();
  if (!value) return [];

  const countries = ["日本", "韓國", "台灣", "中國", "美國", "澳洲", "紐西蘭", "智利", "秘魯", "泰國", "越南"];
  const tags: string[] = [];
  let countryTag = "";

  for (const country of countries) {
    if (value.includes(country)) {
      countryTag = country;
      tags.push(country);
      break;
    }
  }

  const regionRegex = /([\u3400-\u9fffA-Za-z]{1,10})(?:縣|道|州|府|市|郡|省|區)/g;
  let regionTag = "";
  for (const match of value.matchAll(regionRegex)) {
    if (match[1]) {
      const normalized = match[1].trim();
      if (normalized && normalized !== countryTag) {
        regionTag = normalized;
        break;
      }
    }
  }

  if (regionTag) tags.push(regionTag);
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 2);
}

export function generateDefaultTags(input: {
  fruit_category_display: string;
  origin_display: string;
}): string[] {
  const tags: string[] = [];
  if (input.fruit_category_display.trim()) {
    tags.push(input.fruit_category_display.trim());
  }
  tags.push(...extractOriginTags(input.origin_display));
  return Array.from(new Set(tags.map((tag) => normalizeTag(tag)).filter(Boolean))).slice(0, 4);
}

export function normalizeCatalogEntry(raw: Record<string, unknown>): FruitCatalogEntry {
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const bool = (value: unknown) => value === true;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

  const analysisResult =
    raw.analysis_result && typeof raw.analysis_result === "object"
      ? (raw.analysis_result as Record<string, unknown>)
      : {};
  const normalizedAnalysis = normalizeAnalysisResult(analysisResult);
  const analysisStr = (key: string) => str(analysisResult[key]);
  const createdAt = num(raw.created_at) ?? Date.now();
  const normalizedTags = normalizeTags(raw.tags);
  const status: CatalogStatus = raw.status === "tried" ? "tried" : "want";
  const ratingRaw = num(raw.rating);
  const rating =
    ratingRaw !== null && Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5
      ? ratingRaw
      : null;

  return {
    id: num(raw.id) ?? undefined,
    image_data: str(raw.image_data),
    image_hash: str(raw.image_hash) || undefined,
    created_at: createdAt,
    updated_at: num(raw.updated_at) ?? createdAt,
    app_version: str(raw.app_version),
    analysis_result: analysisResult,
    fruit_category_display:
      str(raw.fruit_category_display) || normalizedAnalysis.fruit_category_display,
    fruit_category_original: str(raw.fruit_category_original) || analysisStr("fruit_category_original"),
    identified_product_name:
      str(raw.identified_product_name) || analysisStr("identified_product_name"),
    possible_variety_display:
      str(raw.possible_variety_display) || normalizedAnalysis.possible_variety_display,
    possible_variety_original:
      str(raw.possible_variety_original) || normalizedAnalysis.possible_variety_original,
    possible_variety_basis: str(raw.possible_variety_basis) || analysisStr("possible_variety_basis"),
    variety_characteristics:
      str(raw.variety_characteristics) || normalizedAnalysis.variety_characteristics,
    origin_display: str(raw.origin_display) || normalizedAnalysis.origin_display,
    brand_or_farm_display:
      str(raw.brand_or_farm_display) || normalizedAnalysis.brand_or_farm_display,
    season_months: str(raw.season_months) || normalizedAnalysis.season_months,
    summary_zh_tw: str(raw.summary_zh_tw) || normalizedAnalysis.summary_zh_tw,
    notes: str(raw.notes) || normalizedAnalysis.notes,
    status,
    rating,
    tasting_note: str(raw.tasting_note),
    tags: normalizedTags,
    is_edited: bool(raw.is_edited),
  };
}

export type CatalogSaveDraft = {
  possible_variety_display: string;
  origin_display: string;
  status: CatalogStatus;
  tags: string[];
  rating: number | null;
  tasting_note: string;
};

export function createCatalogSaveDraftFromAnalysis(analysisResult: Record<string, unknown>): CatalogSaveDraft {
  const normalized = normalizeAnalysisResult(analysisResult);
  return {
    possible_variety_display: normalized.possible_variety_display,
    origin_display: normalized.origin_display,
    status: "want",
    tags: generateDefaultTags({
      fruit_category_display: normalized.fruit_category_display,
      origin_display: normalized.origin_display,
    }),
    rating: null,
    tasting_note: "",
  };
}

export function createCatalogEntryFromAnalysis(input: {
  image_data: string;
  analysis_result: Record<string, unknown>;
  app_version: string;
  created_at?: number;
  overrides?: Partial<CatalogSaveDraft>;
  is_edited?: boolean;
}): Omit<FruitCatalogEntry, "id"> {
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const normalized = normalizeAnalysisResult(input.analysis_result);
  const draftDefaults = createCatalogSaveDraftFromAnalysis(input.analysis_result);
  const status = input.overrides?.status === "tried" ? "tried" : draftDefaults.status;
  const hasTagsOverride =
    !!input.overrides && Object.prototype.hasOwnProperty.call(input.overrides, "tags");
  const normalizedOverrideTags = normalizeTags(input.overrides?.tags);
  const tags = hasTagsOverride ? normalizedOverrideTags : draftDefaults.tags;
  const ratingRaw = input.overrides?.rating;
  const rating =
    typeof ratingRaw === "number" && Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5
      ? ratingRaw
      : null;
  const possibleVarietyDisplay =
    input.overrides?.possible_variety_display ?? draftDefaults.possible_variety_display;
  const originDisplay = input.overrides?.origin_display ?? draftDefaults.origin_display;
  const timestamp = input.created_at ?? Date.now();

  return {
    image_data: input.image_data,
    created_at: timestamp,
    updated_at: timestamp,
    app_version: input.app_version,
    analysis_result: input.analysis_result,
    fruit_category_display: normalized.fruit_category_display,
    fruit_category_original: str(input.analysis_result.fruit_category_original),
    identified_product_name: str(input.analysis_result.identified_product_name),
    possible_variety_display: possibleVarietyDisplay,
    possible_variety_original: normalized.possible_variety_original,
    possible_variety_basis: str(input.analysis_result.possible_variety_basis),
    variety_characteristics: normalized.variety_characteristics,
    origin_display: originDisplay,
    brand_or_farm_display: normalized.brand_or_farm_display,
    season_months: normalized.season_months,
    summary_zh_tw: normalized.summary_zh_tw,
    notes: normalized.notes,
    status,
    rating,
    tasting_note: input.overrides?.tasting_note ?? draftDefaults.tasting_note,
    tags,
    is_edited: input.is_edited ?? false,
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
