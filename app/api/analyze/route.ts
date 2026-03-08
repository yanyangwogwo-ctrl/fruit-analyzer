import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const RATE_LIMIT_PER_MINUTE = 15;
const rateLimitMap = new Map<string, number[]>();

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const xri = request.headers.get("x-real-ip");
  if (xff) return xff.split(",")[0].trim();
  if (xri) return xri.trim();
  return "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  let timestamps = rateLimitMap.get(ip) ?? [];
  timestamps = timestamps.filter((t) => now - t < windowMs);
  if (timestamps.length >= RATE_LIMIT_PER_MINUTE) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

const PROMPT = `You are an expert in fruit packaging. Analyze this image and extract information from any visible text on the packaging (labels, stickers, printed text). The packaging may be from ANY country and in ANY language. Do NOT assume the fruit is Japanese or that the text is Japanese.

Guidelines for extraction:
- Prefer Traditional Chinese (繁體中文) for display fields when a stable, common Chinese name exists.
- For "origin_display": Prefer Traditional Chinese normalized location names (e.g., "日本宮城縣", "韓國慶尚北道"). If normalization is uncertain, preserve the original meaning.
- For "possible_variety_display": Use a common Traditional Chinese name if widely used. If no stable common name exists, use the most recognizable original-language or English form. Do NOT invent a Chinese translation for a variety name.
- For "_original" fields: Preserve the exact text as it appears on the package. Leave "" if not applicable.
- Do not guess or hallucinate variety names if not clearly shown.

season_months: (knowledge-based) The typical global production season for this fruit/variety (e.g., "12月–5月"). Leave "" if uncertain. If filled, add to notes: "產季為一般典型月份，非包裝明示".

summary_zh_tw: Short summary in Traditional Chinese only, written in a professional and engaging tone suitable for a fruit review post.

notes: Use for the season disclaimer and other uncertainties. Leave "" if nothing to add.

detected_text_lines: List all significant text lines or phrases you detected from the packaging (one string per array element), in the order or grouping that helps debugging. Use [] if none.

Leave any other field as an empty string "" if the information is not found.

Respond with ONLY a valid JSON object in this exact shape:
{
  "fruit_category_display": "",
  "fruit_category_original": "",
  "possible_variety_display": "",
  "possible_variety_original": "",
  "origin_display": "",
  "brand_or_farm_display": "",
  "grade_display": "",
  "season_months": "",
  "summary_zh_tw": "",
  "notes": "",
  "detected_text_lines": []
}`;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "已達每分鐘請求上限，請稍後再試。" },
      { status: 429 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set." },
      { status: 500 }
    );
  }

  let imageBuffer: Buffer;
  let mimeType = "image/jpeg";

  try {
    const formData = await request.formData();
    const file = formData.get("image");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "請上傳圖片。" },
        { status: 400 }
      );
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "圖片檔案過大，請上傳小於 4MB 的圖片。" },
        { status: 400 }
      );
    }
    const arrayBuffer = await file.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
    mimeType = file.type || "image/jpeg";
  } catch {
    return NextResponse.json(
      { error: "Failed to read uploaded image." },
      { status: 400 }
    );
  }

  const base64 = imageBuffer.toString("base64");

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      { text: PROMPT },
    ]);

    const raw = result.response.text()?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "No response from the model." },
        { status: 502 }
      );
    }

    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "AI 回傳格式無法解析，請再試一次。" },
        { status: 502 }
      );
    }
    if (!Array.isArray(json.detected_text_lines)) {
      json.detected_text_lines = [];
    }
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const is429 = /429|quota|Quota/i.test(message);
    const isLocation = /location is not supported|not supported for the API/i.test(message);
    const friendly = is429
      ? "已超過目前免費額度或每分鐘請求上限，請稍候約一分鐘再試。"
      : isLocation
        ? "您目前所在地區不支援使用此 AI 服務。請使用 VPN 連到支援地區後再試。"
        : message;
    return NextResponse.json(
      { error: friendly },
      { status: is429 ? 429 : 502 }
    );
  }
}
