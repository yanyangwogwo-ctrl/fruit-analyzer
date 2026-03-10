const HK_TERM_MAP: Record<string, string> = {
  草莓: "士多啤梨",
  香瓜: "蜜瓜",
  甜瓜: "蜜瓜",
  鳳梨: "菠蘿",
  櫻桃: "車厘子",
  葡萄: "提子",
  葡萄柚: "西柚",
};

const SORTED_TERMS = Object.keys(HK_TERM_MAP).sort((a, b) => b.length - a.length);

export function toHongKongTerminology(text: string): string {
  if (!text) return text;
  let output = text;
  for (const source of SORTED_TERMS) {
    output = output.replaceAll(source, HK_TERM_MAP[source]);
  }
  return output;
}
