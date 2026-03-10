export const FRUIT_CATEGORIES = [
  "牛油果",
  "奇異果",
  "番石榴",
  "楊桃",
  "龍珠果",
  "枇杷",
  "百香果",
  "麒麟果",
  "蓬霧（天桃）",
  "士多啤梨",
  "藍莓",
  "車厘子",
  "提子",
  "橙",
  "柑",
  "車厘茄",
  "蕃茄",
  "柿",
  "蘋果",
  "梨",
  "桃駁李",
  "車厘布冧",
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

export type FruitCategory = (typeof FRUIT_CATEGORIES)[number];

export const CATEGORY_NORMALIZATION_MAP: Record<string, FruitCategory> = {
  草莓: "士多啤梨",
  Strawberry: "士多啤梨",
  "White Strawberry": "士多啤梨",
  白草莓: "士多啤梨",

  Cherry: "車厘子",
  櫻桃: "車厘子",
  甜櫻桃: "車厘子",

  Grape: "提子",
  葡萄: "提子",
  Muscat: "提子",
  "Shine Muscat": "提子",

  Mandarin: "柑",
  Tangerine: "柑",
  蜜柑: "柑",
  柑橘: "柑",
  Citrus: "柑",
  橘: "柑",
  柚: "柑",
  Grapefruit: "柑",
  西柚: "柑",

  Orange: "橙",

  Tomato: "蕃茄",
  番茄: "蕃茄",
  "Cherry Tomato": "車厘茄",

  Plum: "布冧",
  "Black Plum": "布冧",
  李: "布冧",
  李子: "布冧",

  Nectarine: "桃駁李",
  桃李: "桃駁李",

  Pineapple: "菠蘿",
  鳳梨: "菠蘿",

  "Dragon Fruit": "火龍果",
  Pitaya: "火龍果",

  "Passion Fruit": "百香果",

  Lychee: "荔枝",
  Longan: "龍眼",

  Durian: "榴槤",
  Mangosteen: "山竹",

  Melon: "蜜瓜",
  Cantaloupe: "蜜瓜",
  甜瓜: "蜜瓜",
  香瓜: "蜜瓜",
  哈密瓜: "蜜瓜",

  Watermelon: "西瓜",

  Avocado: "牛油果",
  Kiwi: "奇異果",
  Guava: "番石榴",
  Starfruit: "楊桃",
  Loquat: "枇杷",
  Blueberry: "藍莓",
  Apple: "蘋果",
  Pear: "梨",
  "Asian Pear": "梨",
  Peach: "桃",
  Mango: "芒果",
  Banana: "香蕉",
};

const FRUIT_CATEGORY_SET = new Set<string>(FRUIT_CATEGORIES);

function normalizeCategoryInput(value: unknown): string {
  return (typeof value === "string" ? value : "")
    .replace(/\(/g, "（")
    .replace(/\)/g, "）")
    .replace(/[\u3000\s]+/g, " ")
    .trim();
}

function toLookupKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function simplifyCategoryText(value: string): string {
  return value
    .replace(/（[^）]*）/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[、，,;/|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CATEGORY_LOOKUP_MAP = new Map<string, FruitCategory>(
  Object.entries(CATEGORY_NORMALIZATION_MAP).map(([source, target]) => [toLookupKey(source), target])
);

export function normalizeFruitCategory(input: unknown): FruitCategory {
  const normalized = normalizeCategoryInput(input);
  if (!normalized) return "其他";

  const mapped = CATEGORY_LOOKUP_MAP.get(toLookupKey(normalized));
  if (mapped) return mapped;

  if (FRUIT_CATEGORY_SET.has(normalized)) {
    return normalized as FruitCategory;
  }

  const simplified = simplifyCategoryText(normalized);
  if (simplified && simplified !== normalized) {
    const mappedSimplified = CATEGORY_LOOKUP_MAP.get(toLookupKey(simplified));
    if (mappedSimplified) return mappedSimplified;
    if (FRUIT_CATEGORY_SET.has(simplified)) {
      return simplified as FruitCategory;
    }
  }

  return "其他";
}
