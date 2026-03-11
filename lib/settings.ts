export type CatalogGridCols = 3 | 4;

const CATALOG_GRID_COLS_KEY = "catalogGridCols";

function normalizeCatalogGridCols(value: unknown): CatalogGridCols {
  return value === 4 || value === "4" ? 4 : 3;
}

export function getCatalogGridCols(): CatalogGridCols {
  if (typeof window === "undefined") return 3;
  try {
    const raw = window.localStorage.getItem(CATALOG_GRID_COLS_KEY);
    return normalizeCatalogGridCols(raw);
  } catch {
    return 3;
  }
}

export function setCatalogGridCols(value: CatalogGridCols): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeCatalogGridCols(value);
  try {
    window.localStorage.setItem(CATALOG_GRID_COLS_KEY, String(normalized));
  } catch {
    // ignore storage write failure
  }
}
