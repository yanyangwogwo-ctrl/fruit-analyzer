import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { jsonrepair } from "jsonrepair";
import { GEMINI_MODEL, generationConfig } from "@/lib/ai-model";

// 設定 Vercel Serverless Function 最大執行時間為 60 秒 (Hobby 方案上限)
export const maxDuration = 60;

const PROMPT = `You are an expert in fruit packaging. Analyze all provided images together to identify the marketed product and extract packaging information. The packaging may be from ANY country and in ANY language. Do NOT assume the fruit is Japanese or that the text is Japanese.

Important: Product identification is NOT OCR-only. Use BOTH (1) visible packaging text and (2) visual packaging design cues to identify the marketed product. Do NOT infer product or variety from fruit appearance alone. Product identification must rely on packaging information—either textual or design-related.

Visual packaging cues include: logos, packaging layout, color scheme, label/sticker style, distinctive branding elements, recognizable package design.

Intended logic: image → packaging analysis (text + design) → identify marketed product → infer cultivar only if product identity is clear → structured JSON.

Guidelines:
1. Analyze the full packaging image (text and design). Extract meaningful detected text into detected_text_lines (array of strings).
2. Identify the marketed product using packaging text and/or packaging design cues. Fill identified_product_name only if a specific marketed product or product line can be identified with reasonable confidence; otherwise "".
3. identified_product_confidence: "high" | "medium" | "low" | "" (empty if no product identified).
4. Variety (possible_variety_* and variety_characteristics):
   - If variety is explicitly written on the package: set possible_variety_basis = "explicit_package_text". possible_variety_original must contain ONLY variety text directly visible on the package.
   - If variety is inferred from a clearly identified product: set possible_variety_basis = "identified_product_inference".
   - Otherwise leave possible_variety_basis and variety fields empty.
   - Never infer variety from fruit appearance alone. Never treat inferred variety as if it were directly written on the package.
   - If possible_variety_display is filled and the cultivar is reasonably known, provide variety_characteristics in Traditional Chinese only as concise bullet-style trait phrases.
   - Prefer short horticultural/cultivar traits (sweetness, acidity balance, aroma, flesh color, texture, distinguishing traits) rather than full sentences.
   - Format variety_characteristics as newline-separated bullet points within one string (example: "- 高甜度\\n- 香氣濃郁\\n- 果肉細緻").
   - Keep variety_characteristics neutral and factual; avoid marketing language, avoid subjective tasting storytelling, and do not invent traits.
   - If the cultivar is unknown or uncertain, set variety_characteristics to "".
5. For display fields prefer Traditional Chinese when a stable common name exists. For origin_display use normalized names (e.g. "日本宮城縣", "韓國慶尚北道"). For possible_variety_display use common Chinese name if widely used; otherwise original language or English. Do NOT invent a Chinese translation for a variety name.
6. confidence_level: overall confidence for the whole analysis ("high" | "medium" | "low" | "").

season_months: (knowledge-based) Typical global production season for this fruit/variety (e.g. "12月–5月"). Leave "" if uncertain. If filled, add to notes: "產季為一般典型月份，非包裝明示".

summary_zh_tw: Write a 2-sentence professional summary in Traditional Chinese suitable for a fruit connoisseur's review post. Sentence 1: Introduce the fruit by origin, JA/brand, and variety. Sentence 2: Highlight premium indicators on the package (grade, sugar content, farming methods). Do NOT invent tasting notes; rely strictly on packaging claims.

notes: Use for season disclaimer and other uncertainties. Leave "" if nothing to add.

Leave any field as an empty string "" or empty array [] if not found or not applicable.

Respond with ONLY a valid JSON object in this exact shape:
{
  "fruit_category_display": "",
  "fruit_category_original": "",
  "identified_product_name": "",
  "identified_product_confidence": "",
  "possible_variety_display": "",
  "possible_variety_original": "",
  "possible_variety_basis": "",
  "variety_characteristics": "",
  "origin_display": "",
  "brand_or_farm_display": "",
  "grade_display": "",
  "season_months": "",
  "summary_zh_tw": "",
  "notes": "",
  "confidence_level": "",
  "detected_text_lines": []
}`;

type AnalyzeResult = {
  fruit_category_display: string;
  fruit_category_original: string;
  identified_product_name: string;
  identified_product_confidence: string;
  possible_variety_display: string;
  possible_variety_original: string;
  possible_variety_basis: string;
  variety_characteristics: string;
  origin_display: string;
  brand_or_farm_display: string;
  grade_display: string;
  season_months: string;
  summary_zh_tw: string;
  notes: string;
  confidence_level: string;
  detected_text_lines: string[];
};

type InputImage = {
  mimeType: string;
  data: string;
};

function normalizeAnalyzeResult(raw: unknown): AnalyzeResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const strArr = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  return {
    fruit_category_display: str(obj.fruit_category_display),
    fruit_category_original: str(obj.fruit_category_original),
    identified_product_name: str(obj.identified_product_name),
    identified_product_confidence: str(obj.identified_product_confidence),
    possible_variety_display: str(obj.possible_variety_display),
    possible_variety_original: str(obj.possible_variety_original),
    possible_variety_basis: str(obj.possible_variety_basis),
    variety_characteristics: str(obj.variety_characteristics),
    origin_display: str(obj.origin_display),
    brand_or_farm_display: str(obj.brand_or_farm_display),
    grade_display: str(obj.grade_display),
    season_months: str(obj.season_months),
    summary_zh_tw: str(obj.summary_zh_tw),
    notes: str(obj.notes),
    confidence_level: str(obj.confidence_level),
    detected_text_lines: strArr(obj.detected_text_lines),
  };
}

function parseDataUrlImage(input: string): InputImage | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (match) {
    return {
      mimeType: match[1],
      data: match[2],
    };
  }

  // Backward compatibility: plain base64 string without data URL prefix.
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    return {
      mimeType: "image/jpeg",
      data: trimmed.replace(/\s+/g, ""),
    };
  }
  return null;
}

async function parseRequestImages(request: Request): Promise<{ images: InputImage[]; error?: string }> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    let body: { images?: unknown; image?: unknown };
    try {
      body = (await request.json()) as { images?: unknown; image?: unknown };
    } catch {
      return { images: [], error: "請提供有效的 JSON 請求內容。" };
    }

    const rawImages =
      Array.isArray(body.images) && body.images.length > 0
        ? body.images
        : typeof body.image === "string"
          ? [body.image]
          : [];
    if (rawImages.length > 3) {
      return { images: [], error: "圖片數量最多 3 張。" };
    }

    const parsed = rawImages
      .filter((item): item is string => typeof item === "string")
      .map((item) => parseDataUrlImage(item))
      .filter((item): item is InputImage => item !== null)
      .slice(0, 3);

    if (parsed.length === 0) {
      return { images: [], error: "請上傳至少 1 張圖片。" };
    }
    return { images: parsed };
  }

  try {
    const formData = await request.formData();
    const fileEntries = formData.getAll("images").filter((item): item is File => item instanceof File);
    const single = formData.get("image");
    const files =
      fileEntries.length > 0
        ? fileEntries
        : single instanceof File
          ? [single]
          : [];

    if (files.length === 0) {
      return { images: [], error: "請上傳圖片。" };
    }
    if (files.length > 3) {
      return { images: [], error: "圖片數量最多 3 張。" };
    }

    const selected = files.slice(0, 3);
    const parsed: InputImage[] = [];
    for (const file of selected) {
      if (file.size > 4 * 1024 * 1024) {
        return { images: [], error: "圖片檔案過大，請上傳小於 4MB 的圖片。" };
      }
      const arrayBuffer = await file.arrayBuffer();
      parsed.push({
        mimeType: file.type || "image/jpeg",
        data: Buffer.from(arrayBuffer).toString("base64"),
      });
    }
    return { images: parsed };
  } catch {
    return { images: [], error: "讀取上傳圖片失敗。" };
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "伺服器未設定 GEMINI_API_KEY。" },
      { status: 500 }
    );
  }

  const parsed = await parseRequestImages(request);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (parsed.images.length < 1 || parsed.images.length > 3) {
    return NextResponse.json({ error: "圖片數量需為 1 到 3 張。" }, { status: 400 });
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

    const parts = [
      ...parsed.images.map((image) => ({
        inlineData: { mimeType: image.mimeType, data: image.data },
      })),
      { text: PROMPT },
    ];
    const result = await model.generateContent(parts);

    const text = result.response.text()?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "AI 模型沒有回傳結果。" },
        { status: 502 }
      );
    }

    let json: AnalyzeResult;
    try {
      json = JSON.parse(text) as AnalyzeResult;
    } catch (parseError) {
      // 先嘗試自動修復不完整或格式錯誤的 JSON
      let repaired: string | null = null;
      try {
        repaired = jsonrepair(text);
        // eslint-disable-next-line no-console
        console.warn("Gemini analyze repaired JSON:", repaired);
        json = JSON.parse(repaired) as AnalyzeResult;
      } catch (repairError) {
        // 修復失敗時，紀錄原始輸出以便診斷
        // eslint-disable-next-line no-console
        console.error("Gemini analyze raw output (unrepairable):", text);
        throw repairError;
      }
    }
    const normalized = normalizeAnalyzeResult(json);
    return NextResponse.json(normalized, {
      headers: { "X-Gemini-Model": GEMINI_MODEL },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const is429 = /429|quota|Quota/i.test(message);
    const friendly = is429
      ? "已超過目前免費額度或每分鐘請求上限，請稍候約一分鐘再試。"
      : message;
    return NextResponse.json(
      { error: friendly },
      { status: is429 ? 429 : 502 }
    );
  }
}
