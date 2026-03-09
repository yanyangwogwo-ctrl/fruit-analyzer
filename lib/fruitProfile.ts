export type AnalysisResult = {
  fruit_category_display: string;
  fruit_category_original: string;
  possible_variety_display: string;
  possible_variety_original: string;
  variety_characteristics: string;
  origin_display: string;
  brand_or_farm_display: string;
  grade_display: string;
  season_months: string;
  summary_zh_tw: string;
  notes: string;
  detected_text_lines: string[];
};

export type FruitProfileRow = {
  label: string;
  value: string;
  bulletItems?: string[];
};

export function normalizeAnalysisResult(data: Record<string, unknown>): AnalysisResult {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    fruit_category_display: str(data.fruit_category_display),
    fruit_category_original: str(data.fruit_category_original),
    possible_variety_display: str(data.possible_variety_display),
    possible_variety_original: str(data.possible_variety_original),
    variety_characteristics: str(data.variety_characteristics),
    origin_display: str(data.origin_display),
    brand_or_farm_display: str(data.brand_or_farm_display),
    grade_display: str(data.grade_display),
    season_months: str(data.season_months),
    summary_zh_tw: str(data.summary_zh_tw),
    notes: str(data.notes),
    detected_text_lines: arr(data.detected_text_lines),
  };
}

function hasCjkIdeograph(text: string): boolean {
  return /[\u3400-\u9FFF]/.test(text);
}

function formatVarietyDisplay(display: string, original: string): string {
  const normalizedDisplay = display.trim();
  const normalizedOriginal = original.trim();
  if (!normalizedDisplay) return "";
  if (!normalizedOriginal) return normalizedDisplay;
  return hasCjkIdeograph(normalizedDisplay)
    ? `${normalizedDisplay}（${normalizedOriginal}）`
    : normalizedDisplay;
}

function parseVarietyCharacteristics(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const strippedLines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•●○▪▫・‧]\s*/, ""))
    .filter((line) => line.length > 0);

  const seed = strippedLines.length > 0 ? strippedLines : [normalized];
  const phrases = seed
    .flatMap((line) => line.split(/[；;、]/))
    .map((item) =>
      item
        .trim()
        .replace(/^[-*•●○▪▫・‧]\s*/, "")
        .replace(/[。]+$/g, "")
    )
    .filter((item) => item.length > 0);

  return Array.from(new Set(phrases));
}

export function buildFruitProfileRows(result: AnalysisResult): FruitProfileRow[] {
  const formattedVarietyDisplay = formatVarietyDisplay(
    result.possible_variety_display,
    result.possible_variety_original
  );
  const varietyCharacteristicsItems = parseVarietyCharacteristics(result.variety_characteristics);

  const rows: FruitProfileRow[] = [
    { label: "水果類別", value: result.fruit_category_display },
    { label: "推定品種", value: formattedVarietyDisplay },
    {
      label: "品種特點",
      value: result.variety_characteristics,
      bulletItems: varietyCharacteristicsItems,
    },
    { label: "產地", value: result.origin_display },
    { label: "品牌 / 農園", value: result.brand_or_farm_display },
    { label: "產季", value: result.season_months },
    { label: "備註", value: result.notes },
  ];

  return rows.filter((row) => row.value.trim().length > 0);
}
