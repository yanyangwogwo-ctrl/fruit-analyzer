import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { normalizeEnrichmentResult } from "@/lib/enrichment";

export const maxDuration = 60;

type EnrichRequestPayload = {
  fruit_category: string;
  confirmed_variety: string;
  confirmed_origin: string;
  ocr_package_info: string[];
};

function parseEnrichRequestBody(raw: unknown): { payload?: EnrichRequestPayload; error?: string } {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const strArr = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

  const payload: EnrichRequestPayload = {
    fruit_category: str(body.fruit_category),
    confirmed_variety: str(body.confirmed_variety),
    confirmed_origin: str(body.confirmed_origin),
    ocr_package_info: strArr(body.ocr_package_info),
  };

  if (
    !payload.fruit_category &&
    !payload.confirmed_variety &&
    !payload.confirmed_origin &&
    payload.ocr_package_info.length === 0
  ) {
    return { error: "缺少可用的深度圖鑑查詢資訊。" };
  }

  return { payload };
}

function buildPrompt(payload: EnrichRequestPayload): string {
  return `You are a fruit encyclopedia assistant. Use the given fruit context and return enriched structured catalog knowledge in Traditional Chinese.

Input context:
${JSON.stringify(payload, null, 2)}

Requirements:
1) Be conservative. If uncertain, keep fields empty ("", []).
2) Do NOT fabricate farm names, auction records, or unverifiable claims.
3) Output must be valid JSON ONLY. No markdown.
4) rarity_hint must be one of:
   "mass_market" | "regional_specialty" | "premium_variety" | "luxury_gift" | "auction_grade"
5) Keep lists concise and useful.

Return JSON in this exact schema:
{
  "standout_sensory_traits": [],
  "season": "",
  "common_regions": [],
  "rarity_hint": "mass_market",
  "market_position": "",
  "background_lore": [],
  "practical_guide": [],
  "catalog_summary": ""
}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "伺服器未設定 GEMINI_API_KEY。" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請提供有效的 JSON 請求內容。" }, { status: 400 });
  }

  const parsed = parseEnrichRequestBody(body);
  if (parsed.error || !parsed.payload) {
    return NextResponse.json({ error: parsed.error ?? "請求資料格式錯誤。" }, { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0,
        topP: 1,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent([{ text: buildPrompt(parsed.payload) }]);
    const text = result.response.text()?.trim();
    if (!text) {
      return NextResponse.json({ error: "AI 模型沒有回傳結果。" }, { status: 502 });
    }

    const parsedJson = JSON.parse(text);
    const normalized = normalizeEnrichmentResult(parsedJson);
    return NextResponse.json(normalized, {
      headers: { "X-Gemini-Model": modelName },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const is429 = /429|quota|Quota/i.test(message);
    const friendly = is429
      ? "已超過目前免費額度或每分鐘請求上限，請稍候約一分鐘再試。"
      : "深度圖鑑資料暫時無法取得";
    return NextResponse.json({ error: friendly }, { status: is429 ? 429 : 502 });
  }
}
