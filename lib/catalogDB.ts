import Dexie, { type Table } from "dexie";
import { normalizeAnalysisResult } from "@/lib/fruitProfile";

export type CatalogStatus = "want" | "tried";

export type FruitCatalogEntry = {
  id?: number;
  image_data: string;
  created_at: number;
  updated_at: number;
  app_version: string;
  analysis_result: Record<string, unknown>;
  fruit_category_display: string;
  possible_variety_display: string;
  possible_variety_original: string;
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

  for (const country of countries) {
    if (value.includes(country)) tags.push(country);
  }

  const regionRegex = /([\u3400-\u9fffA-Za-z]{1,10})(?:縣|道|州|府|市|郡|省|區)/g;
  for (const match of value.matchAll(regionRegex)) {
    if (match[1]) tags.push(match[1]);
  }

  const regionHints = value
    .replace(/[()（）]/g, " ")
    .replace(/[\/,，、]/g, " ")
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) =>
      segment
        .replace(/^(日本|韓國|台灣|中國|美國|澳洲|紐西蘭|智利|秘魯|泰國|越南)/, "")
        .replace(/(縣|道|州|府|市|郡|省|區)$/g, "")
    )
    .filter((segment) => segment.length >= 2 && segment.length <= 8);

  tags.push(...regionHints);
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
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
  return Array.from(new Set(tags.map((tag) => normalizeTag(tag)).filter(Boolean)));
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
    created_at: createdAt,
    updated_at: num(raw.updated_at) ?? createdAt,
    app_version: str(raw.app_version),
    analysis_result: analysisResult,
    fruit_category_display:
      str(raw.fruit_category_display) || normalizedAnalysis.fruit_category_display,
    possible_variety_display:
      str(raw.possible_variety_display) || normalizedAnalysis.possible_variety_display,
    possible_variety_original:
      str(raw.possible_variety_original) || normalizedAnalysis.possible_variety_original,
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
    tags:
      normalizedTags.length > 0
        ? normalizedTags
        : generateDefaultTags({
            fruit_category_display:
              str(raw.fruit_category_display) || normalizedAnalysis.fruit_category_display,
            origin_display: str(raw.origin_display) || normalizedAnalysis.origin_display,
          }),
    is_edited: bool(raw.is_edited),
  };
}

export function createCatalogEntryFromAnalysis(input: {
  image_data: string;
  analysis_result: Record<string, unknown>;
  app_version: string;
  created_at?: number;
}): Omit<FruitCatalogEntry, "id"> {
  const normalized = normalizeAnalysisResult(input.analysis_result);
  const timestamp = input.created_at ?? Date.now();

  return {
    image_data: input.image_data,
    created_at: timestamp,
    updated_at: timestamp,
    app_version: input.app_version,
    analysis_result: input.analysis_result,
    fruit_category_display: normalized.fruit_category_display,
    possible_variety_display: normalized.possible_variety_display,
    possible_variety_original: normalized.possible_variety_original,
    variety_characteristics: normalized.variety_characteristics,
    origin_display: normalized.origin_display,
    brand_or_farm_display: normalized.brand_or_farm_display,
    season_months: normalized.season_months,
    summary_zh_tw: normalized.summary_zh_tw,
    notes: normalized.notes,
    status: "want",
    rating: null,
    tasting_note: "",
    tags: generateDefaultTags({
      fruit_category_display: normalized.fruit_category_display,
      origin_display: normalized.origin_display,
    }),
    is_edited: false,
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
