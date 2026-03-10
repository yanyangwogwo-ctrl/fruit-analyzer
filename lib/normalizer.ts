import { normalizeFruitCategory } from "@/lib/fruitCategories";

const KNOWN_ORIGINAL_MAP: Record<string, string> = {
  amairin: "あまりん",
  benihoppe: "紅ほっぺ",
  "shine muscat": "シャインマスカット",
};

const COUNTRY_RULES: Array<{ pattern: RegExp; country: string }> = [
  { pattern: /(日本|japan)/i, country: "日本" },
  { pattern: /(韓國|南韓|korea)/i, country: "韓國" },
  { pattern: /(台灣|臺灣|taiwan)/i, country: "台灣" },
  { pattern: /(中國|china)/i, country: "中國" },
  { pattern: /(美國|usa|united states|u\.s\.)/i, country: "美國" },
  { pattern: /(澳洲|澳大利亞|australia)/i, country: "澳洲" },
  { pattern: /(紐西蘭|new zealand)/i, country: "紐西蘭" },
  { pattern: /(智利|chile)/i, country: "智利" },
  { pattern: /(秘魯|peru)/i, country: "秘魯" },
  { pattern: /(泰國|thailand)/i, country: "泰國" },
  { pattern: /(越南|vietnam)/i, country: "越南" },
];

const JAPAN_REGION_ALIAS: Record<string, string> = {
  hokkaido: "北海道",
  aomori: "青森",
  iwate: "岩手",
  miyagi: "宮城",
  akita: "秋田",
  yamagata: "山形",
  fukushima: "福島",
  ibaraki: "茨城",
  tochigi: "栃木",
  gunma: "群馬",
  saitama: "埼玉",
  chiba: "千葉",
  tokyo: "東京",
  kanagawa: "神奈川",
  niigata: "新潟",
  toyama: "富山",
  ishikawa: "石川",
  fukui: "福井",
  yamanashi: "山梨",
  nagano: "長野",
  gifu: "岐阜",
  shizuoka: "靜岡",
  aichi: "愛知",
  mie: "三重",
  shiga: "滋賀",
  kyoto: "京都",
  osaka: "大阪",
  hyogo: "兵庫",
  nara: "奈良",
  wakayama: "和歌山",
  tottori: "鳥取",
  shimane: "島根",
  okayama: "岡山",
  hiroshima: "廣島",
  yamaguchi: "山口",
  tokushima: "德島",
  kagawa: "香川",
  ehime: "愛媛",
  kochi: "高知",
  fukuoka: "福岡",
  saga: "佐賀",
  nagasaki: "長崎",
  kumamoto: "熊本",
  oita: "大分",
  miyazaki: "宮崎",
  kagoshima: "鹿兒島",
  okinawa: "沖繩",
};

const US_REGION_ALIAS: Record<string, string> = {
  california: "加州",
  washington: "華盛頓州",
  oregon: "俄勒岡州",
  florida: "佛羅里達州",
};

const AU_REGION_ALIAS: Record<string, string> = {
  tasmania: "塔斯曼尼亞",
  victoria: "維多利亞州",
  queensland: "昆士蘭州",
  "new south wales": "新南威爾士州",
  "south australia": "南澳州",
  "western australia": "西澳州",
};

function normalizeText(value: unknown): string {
  return (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim();
}

function normalizeBrackets(value: string): string {
  return value
    .replace(/（\s*/g, "（")
    .replace(/\s*）/g, "）")
    .replace(/\(\s*/g, "（")
    .replace(/\s*\)/g, "）")
    .replace(/\s*（\s*/g, "（")
    .replace(/\s*）\s*/g, "）")
    .trim();
}

function removeCountryToken(text: string, country: string): string {
  if (!text) return "";
  const escaped = country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(escaped, "g"), "")
    .replace(/[,\-_/|]/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9FFF]/.test(value);
}

function normalizeOriginalScript(value: string): string {
  const cleaned = normalizeBrackets(value).trim();
  if (!cleaned) return "";
  const key = cleaned.toLowerCase();
  return KNOWN_ORIGINAL_MAP[key] ?? cleaned;
}

function detectCountry(value: string): string {
  for (const rule of COUNTRY_RULES) {
    if (rule.pattern.test(value)) return rule.country;
  }
  return "";
}

function normalizeCountryRegion(country: string, rawRegion: string): string {
  let region = rawRegion.trim();
  if (!region) return "";

  const lower = region.toLowerCase();

  if (country === "日本") {
    for (const [alias, mapped] of Object.entries(JAPAN_REGION_ALIAS)) {
      if (lower.includes(alias)) {
        region = mapped;
        break;
      }
    }
    if (!/[都道府縣]$/.test(region)) {
      region = `${region}縣`;
    }
    return region;
  }

  if (country === "美國") {
    for (const [alias, mapped] of Object.entries(US_REGION_ALIAS)) {
      if (lower.includes(alias)) {
        region = mapped;
        break;
      }
    }
    return region;
  }

  if (country === "澳洲") {
    for (const [alias, mapped] of Object.entries(AU_REGION_ALIAS)) {
      if (lower.includes(alias)) {
        region = mapped;
        break;
      }
    }
    return region;
  }

  return region;
}

export function normalizeFruitCategoryDisplay(value: unknown): string {
  return normalizeFruitCategory(value);
}

export function normalizeVarietyFields(value: {
  possible_variety_display: unknown;
  possible_variety_original: unknown;
}): {
  possible_variety_display: string;
  possible_variety_original: string;
} {
  let display = normalizeBrackets(normalizeText(value.possible_variety_display));
  let original = normalizeOriginalScript(normalizeText(value.possible_variety_original));

  const matched = display.match(/^(.+?)（(.+?)）$/);
  if (matched) {
    display = matched[1].trim();
    if (!original) {
      original = normalizeOriginalScript(matched[2].trim());
    }
  }

  if (display && original && display.toLowerCase() === original.toLowerCase()) {
    original = "";
  }

  if (!display && original) {
    display = original;
    original = "";
  }

  const hasDisplayCjk = containsCjk(display);
  const hasOriginalCjk = containsCjk(original);
  const isOriginalEnglishLike = /^[A-Za-z0-9\s.'’/-]+$/.test(original);

  if (!display) {
    return {
      possible_variety_display: "",
      possible_variety_original: original,
    };
  }

  if (!original) {
    return {
      possible_variety_display: display,
      possible_variety_original: "",
    };
  }

  if (hasDisplayCjk) {
    return {
      possible_variety_display: `${display}（${original}）`,
      possible_variety_original: original,
    };
  }

  if (!hasDisplayCjk && hasOriginalCjk) {
    return {
      possible_variety_display: `${display}（${original}）`,
      possible_variety_original: original,
    };
  }

  if (isOriginalEnglishLike) {
    return {
      possible_variety_display: display,
      possible_variety_original: original,
    };
  }

  return {
    possible_variety_display: `${display}（${original}）`,
    possible_variety_original: original,
  };
}

export function normalizeVarietyDisplay(
  possibleVarietyDisplay: unknown,
  possibleVarietyOriginal: unknown
): string {
  return normalizeVarietyFields({
    possible_variety_display: possibleVarietyDisplay,
    possible_variety_original: possibleVarietyOriginal,
  }).possible_variety_display;
}

export function normalizeOriginDisplay(value: unknown): string {
  const source = normalizeBrackets(normalizeText(value));
  if (!source) return "";

  const country = detectCountry(source);
  const bracketMatch = source.match(/（([^）]+)）/);
  let regionCandidate = bracketMatch ? bracketMatch[1].trim() : "";

  if (!regionCandidate) {
    regionCandidate = removeCountryToken(source, country);
  }

  if (!country) {
    const lower = source.toLowerCase();
    for (const [alias, mapped] of Object.entries(JAPAN_REGION_ALIAS)) {
      if (lower.includes(alias) || source.includes(mapped)) {
        const normalizedRegion = /[都道府縣]$/.test(mapped) ? mapped : `${mapped}縣`;
        return `日本${normalizedRegion}`;
      }
    }
    return source.replace(/[()（）]/g, "").trim();
  }

  const normalizedRegion = normalizeCountryRegion(country, regionCandidate.replace(/[()（）]/g, "").trim());
  return normalizedRegion ? `${country}${normalizedRegion}` : country;
}

export function normalizeCatalogCoreFields(
  input: {
    fruit_category_display: unknown;
    possible_variety_display: unknown;
    possible_variety_original: unknown;
    origin_display: unknown;
  }
): {
  fruit_category_display: string;
  possible_variety_display: string;
  possible_variety_original: string;
  origin_display: string;
} {
  const variety = normalizeVarietyFields({
    possible_variety_display: input.possible_variety_display,
    possible_variety_original: input.possible_variety_original,
  });
  return {
    fruit_category_display: normalizeFruitCategoryDisplay(input.fruit_category_display),
    possible_variety_display: variety.possible_variety_display,
    possible_variety_original: variety.possible_variety_original,
    origin_display: normalizeOriginDisplay(input.origin_display),
  };
}

export function normalizeAnalysisRecordFields(
  input: Record<string, unknown>
): Record<string, unknown> {
  const core = normalizeCatalogCoreFields({
    fruit_category_display: input.fruit_category_display,
    possible_variety_display: input.possible_variety_display,
    possible_variety_original: input.possible_variety_original,
    origin_display: input.origin_display,
  });

  return {
    ...input,
    fruit_category_display: core.fruit_category_display,
    possible_variety_display: core.possible_variety_display,
    possible_variety_original: core.possible_variety_original,
    origin_display: core.origin_display,
  };
}

export function normalizeCategoryForGrouping(value: unknown): string {
  return normalizeFruitCategoryDisplay(value);
}
