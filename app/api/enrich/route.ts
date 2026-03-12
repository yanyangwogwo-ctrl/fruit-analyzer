import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  normalizeEnrichmentResult,
  type FruitEnrichmentPayload,
} from "@/lib/enrichment";

export const maxDuration = 60;

function parseEnrichRequestBody(raw: unknown): { payload?: FruitEnrichmentPayload; error?: string } {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const strArr = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

  const payload: FruitEnrichmentPayload = {
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

function buildPrompt(payload: FruitEnrichmentPayload): string {
  return `ROLE:
You are a world-class pomologist and fruit encyclopedia editor.
Your task is to enrich an already-confirmed fruit variety entry with structured catalog knowledge.

IMPORTANT:
- The fruit variety is already confirmed by the user
- Do NOT identify the fruit again
- Do NOT guess a different variety
- Do NOT produce marketing fluff
- Be objective, elegant, and useful

Input context:
${JSON.stringify(payload, null, 2)}

ANTI-HALLUCINATION RULES:
1) standout_sensory_traits:
   Only include truly standout sensory traits if they are broadly known and genuinely distinctive.
   If not, return [].
   Do NOT force praise for ordinary mass-market fruit.

2) rarity_hint:
   MUST be exactly one of:
   - mass_market
   - regional_specialty
   - premium_variety
   - luxury_gift
   - auction_grade
   Do NOT invent other values.
   Do NOT output SSR / SR / R / N.

3) background_lore:
   Only include broadly known and reasonably reliable background (such as naming origin or breeding context).
   Otherwise return [].
   Do NOT invent years or historical details.

4) practical_guide:
   Only include storage advice or best tasting condition.
   Do NOT give fruit-picking advice.
   Do NOT describe how to choose appearance.

5) catalog_summary:
   Write a concise integrated summary in Traditional Chinese.
   Do not repeat other fields verbatim.
   Keep it informative and catalog-friendly.

Return JSON in this exact schema:
{
  "standout_sensory_traits": [],
  "season": "12月至翌年3月",
  "common_regions": [],
  "rarity_hint": "mass_market",
  "market_position": "",
  "background_lore": [],
  "practical_guide": [],
  "catalog_summary": ""
}

Requirements:
- Return ONLY valid JSON
- No markdown
- No code fences
- No explanation outside JSON`;
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
        maxOutputTokens: 768,
        responseMimeType: "application/json",
      },
    });

    let text = "";
    try {
      const result = await model.generateContent([{ text: buildPrompt(parsed.payload) }]);
      text = result.response.text()?.trim() || "";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `深度圖鑑資料暫時無法取得：${message}` },
        { status: 502 }
      );
    }

    if (!text) {
      return NextResponse.json({ error: "深度圖鑑資料暫時無法取得：模型無回應內容。" }, { status: 502 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch (err) {
      console.error("Enrich JSON parse failed", {
        error: err instanceof Error ? err.message : String(err),
        rawOutput: text,
      });
      return NextResponse.json(
        { error: "深度圖鑑資料暫時無法取得：AI 回傳格式錯誤。" },
        { status: 502 }
      );
    }

    const normalized = normalizeEnrichmentResult(parsedJson);
    return NextResponse.json(normalized, { headers: { "X-Gemini-Model": modelName } });
  } catch {
    return NextResponse.json({ error: "伺服器處理深度圖鑑資料時發生錯誤。" }, { status: 500 });
  }
}
