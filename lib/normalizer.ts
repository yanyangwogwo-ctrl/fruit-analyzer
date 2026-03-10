type CategoryNormalizeOptions = {
  emptyFallback?: string;
  unknownFallback?: string;
};

type CoreFieldOptions = {
  categoryEmptyFallback?: string;
  categoryUnknownFallback?: string;
};

export const HK_FRUIT_CATEGORY_VOCAB = [
  "琵琶",
  "百香果",
  "麒麟果",
  "桃駁李",
  "車厘布冧",
  "蓬霧（天桃）",
  "士多啤梨",
  "藍莓",
  "車厘子",
  "提子",
  "柑橘",
  "橙",
  "柑",
  "車厘茄",
  "蕃茄",
  "柿",
  "蘋果",
  "梨",
  "桃",
  "布冧",
  "芒果",
  "香蕉",
  "菠蘿",
  "火龍果",
  "荔枝",
  "龍眼",
  "榴槤",
  "山竹",
  "蜜瓜",
  "西瓜",
  "其他",
] as const;

const HK_FRUIT_CATEGORY_SET = new Set<string>(HK_FRUIT_CATEGORY_VOCAB);

const KNOWN_ORIGINAL_MAP: Record<string, string> = {
  amairin: "あまりん",
  benihoppe: "紅ほっぺ",
  "shine muscat": "シャインマスカット",
};

const CATEGORY_ALIAS_RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /(士多啤梨|草莓|strawberry|white strawberry|白草莓)/i, category: "士多啤梨" },
  { pattern: /(藍莓|blueberry)/i, category: "藍莓" },
  { pattern: /(車厘子|櫻桃|甜櫻桃|cherry)/i, category: "車厘子" },
  { pattern: /(提子|葡萄|grape|muscat|shine muscat)/i, category: "提子" },
  { pattern: /(橙|橘|柑|柑橘|蜜柑|柚|西柚|葡萄柚|grapefruit|mandarin|orange|citrus)/i, category: "柑橘" },
  { pattern: /(蘋果|apple|青蘋果|紅蘋果)/i, category: "蘋果" },
  { pattern: /(梨|pear|asian pear)/i, category: "梨" },
  { pattern: /(桃駁李|pluot)/i, category: "桃駁李" },
  { pattern: /(車厘布冧)/i, category: "車厘布冧" },
  { pattern: /(布冧|李子|李|plum|black plum)/i, category: "布冧" },
  { pattern: /(桃|水蜜桃|peach)/i, category: "桃" },
  { pattern: /(芒果|mango)/i, category: "芒果" },
  { pattern: /(香蕉|banana)/i, category: "香蕉" },
  { pattern: /(菠蘿|鳳梨|pineapple)/i, category: "菠蘿" },
  { pattern: /(火龍果|dragon fruit|pitaya)/i, category: "火龍果" },
  { pattern: /(荔枝|lychee)/i, category: "荔枝" },
  { pattern: /(龍眼|longan)/i, category: "龍眼" },
  { pattern: /(榴槤|durian)/i, category: "榴槤" },
  { pattern: /(山竹|mangosteen)/i, category: "山竹" },
  { pattern: /(蜜瓜|香瓜|甜瓜|哈密瓜|melon|cantaloupe)/i, category: "蜜瓜" },
  { pattern: /(西瓜|watermelon)/i, category: "西瓜" },
  { pattern: /(蓬霧|天桃|wax apple|rose apple)/i, category: "蓬霧（天桃）" },
  { pattern: /(百香果|passion fruit)/i, category: "百香果" },
  { pattern: /(琵琶|loquat)/i, category: "琵琶" },
  { pattern: /(麒麟果|yellow dragon fruit)/i, category: "麒麟果" },
  { pattern: /(車厘茄|cherry tomato)/i, category: "車厘茄" },
  { pattern: /(蕃茄|番茄|tomato)/i, category: "蕃茄" },
  { pattern: /(柿|persimmon)/i, category: "柿" },
];

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

export function normalizeFruitCategoryDisplay(
  value: unknown,
  options: CategoryNormalizeOptions = {}
): string {
  const normalized = normalizeText(value);
  const emptyFallback = options.emptyFallback ?? "";
  const unknownFallback = options.unknownFallback ?? "";
  if (!normalized) return emptyFallback;

  for (const rule of CATEGORY_ALIAS_RULES) {
    if (rule.pattern.test(normalized)) return rule.category;
  }
  if (HK_FRUIT_CATEGORY_SET.has(normalized)) return normalized;
  return unknownFallback;
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
  },
  options: CoreFieldOptions = {}
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
    fruit_category_display: normalizeFruitCategoryDisplay(input.fruit_category_display, {
      emptyFallback: options.categoryEmptyFallback ?? "",
      unknownFallback: options.categoryUnknownFallback ?? "",
    }),
    possible_variety_display: variety.possible_variety_display,
    possible_variety_original: variety.possible_variety_original,
    origin_display: normalizeOriginDisplay(input.origin_display),
  };
}

export function normalizeAnalysisRecordFields(
  input: Record<string, unknown>,
  options: CoreFieldOptions = {}
): Record<string, unknown> {
  const core = normalizeCatalogCoreFields(
    {
      fruit_category_display: input.fruit_category_display,
      possible_variety_display: input.possible_variety_display,
      possible_variety_original: input.possible_variety_original,
      origin_display: input.origin_display,
    },
    options
  );

  return {
    ...input,
    fruit_category_display: core.fruit_category_display,
    possible_variety_display: core.possible_variety_display,
    possible_variety_original: core.possible_variety_original,
    origin_display: core.origin_display,
  };
}

export function normalizeCategoryForGrouping(value: unknown): string {
  const category = normalizeFruitCategoryDisplay(value, {
    emptyFallback: "",
    unknownFallback: "",
  });
  return category || "未分類";
}
