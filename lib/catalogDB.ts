import Dexie, { type Table } from "dexie";

export type CatalogEntry = {
  id?: number;
  image_data: string;
  analysis_result: Record<string, unknown>;
  fruit_category_display: string;
  possible_variety_display: string;
  origin_display: string;
  created_at: number;
  app_version: string;
};

class FruitCatalogDB extends Dexie {
  entries!: Table<CatalogEntry, number>;

  constructor() {
    super("fruitCatalogDB");
    this.version(1).stores({
      entries: "++id, created_at, fruit_category_display, possible_variety_display, origin_display",
    });
  }
}

export const catalogDB = new FruitCatalogDB();

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
