import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { jsonrepair } from "jsonrepair";
import { normalizeCatalogCoreFields } from "@/lib/normalizer";
import { GEMINI_MODEL, generationConfig } from "@/lib/ai-model";

export const maxDuration = 60;

type QuickAddAIResult = {
  fruit_category_display: string;
  fruit_category_original: string;
  possible_variety_display: string;
  possible_variety_original: string;
  possible_variety_basis: string;
  variety_characteristics: string;
  origin_display: string;
  season_months: string;
  summary_zh_tw: string;
  suggested_tags: string[];
  confidence_level: string;
  notes: string;
};

const PROMPT = `You are a conservative fruit catalog assistant.
Given ONE user-entered fruit name or variety name, generate a cautious metadata draft in Traditional Chinese.

Rules:
1) Be conservative. If uncertain, return empty string for that field.
2) Do NOT invent brand names, farms, or product lines.
3) Do NOT pretend certainty for ambiguous names.
4) Preserve user intent: if unclear, keep possible_variety_display close to the user input.
5) suggested_tags should be short practical tags (max 4), no hashtags.
6) Output JSON only in the exact schema below.

Schema:
{
  "fruit_category_display": "",
  "fruit_category_original": "",
  "possible_variety_display": "",
  "possible_variety_original": "",
  "possible_variety_basis": "",
  "variety_characteristics": "",
  "origin_display": "",
  "season_months": "",
  "summary_zh_tw": "",
  "suggested_tags": [],
  "confidence_level": "",
  "notes": ""
}`;

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "");
}

function normalizeQuickAddResult(raw: unknown): QuickAddAIResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const strArr = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  const normalizedCore = normalizeCatalogCoreFields({
    fruit_category_display: str(obj.fruit_category_display),
    possible_variety_display: str(obj.possible_variety_display),
    possible_variety_original: str(obj.possible_variety_original),
    origin_display: str(obj.origin_display),
  });

  return {
    fruit_category_display: normalizedCore.fruit_category_display,
    fruit_category_original: str(obj.fruit_category_original),
    possible_variety_display: normalizedCore.possible_variety_display,
    possible_variety_original: normalizedCore.possible_variety_original,
    possible_variety_basis: str(obj.possible_variety_basis),
    variety_characteristics: str(obj.variety_characteristics),
    origin_display: normalizedCore.origin_display,
    season_months: str(obj.season_months),
    summary_zh_tw: str(obj.summary_zh_tw),
    suggested_tags: Array.from(new Set(strArr(obj.suggested_tags).map(normalizeTag).filter(Boolean))).slice(
      0,
      4
    ),
    confidence_level: str(obj.confidence_level),
    notes: str(obj.notes),
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "伺服器未設定 GEMINI_API_KEY。" }, { status: 500 });
  }

  let inputName = "";
  try {
    const body = (await request.json()) as { name?: unknown };
    inputName = typeof body?.name === "string" ? body.name.trim() : "";
  } catch {
    return NextResponse.json({ error: "請提供有效的名稱輸入。" }, { status: 400 });
  }

  if (!inputName) {
    return NextResponse.json({ error: "名稱不可為空。" }, { status: 400 });
  }
  if (inputName.length > 60) {
    return NextResponse.json({ error: "名稱過長，請縮短後再試。" }, { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        ...generationConfig,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent([
      { text: PROMPT },
      { text: `User input fruit/variety name: ${inputName}` },
    ]);
    const text = result.response.text()?.trim();
    if (!text) {
      return NextResponse.json({ error: "AI 沒有回傳內容。" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as QuickAddAIResult;
    } catch (parseError) {
      // 先嘗試自動修復不完整或格式錯誤的 JSON
      let repaired: string | null = null;
      try {
        repaired = jsonrepair(text);
        // eslint-disable-next-line no-console
        console.warn("Gemini quick-add repaired JSON:", repaired);
        parsed = JSON.parse(repaired) as QuickAddAIResult;
      } catch (repairError) {
        // 修復失敗時，紀錄原始輸出以便診斷
        // eslint-disable-next-line no-console
        console.error("Gemini quick-add raw output (unrepairable):", text);
        throw repairError;
      }
    }
    const normalized = normalizeQuickAddResult(parsed);
    return NextResponse.json(
      {
        ...normalized,
        input_name: inputName,
      },
      { headers: { "X-Gemini-Model": GEMINI_MODEL } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const is429 = /429|quota|Quota/i.test(message);
    return NextResponse.json(
      {
        error: is429 ? "已超過目前免費額度或每分鐘請求上限，請稍候再試。" : message,
      },
      { status: is429 ? 429 : 502 }
    );
  }
}
