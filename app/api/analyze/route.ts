import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const PROMPT = `You are an expert in Japanese fruit packaging. Analyze this image and extract information from any visible Japanese text on the packaging (labels, stickers, printed text).

Display language rules:
- For fruit_category, possible_variety, origin, and brand_or_farm: use Traditional Chinese (繁體中文) as the main value when a common name exists; otherwise use English. Put the Japanese reading in the _ja fields for supporting display.
- summary_zh_tw: short summary in Traditional Chinese only.
- Do not guess or hallucinate variety names if not clearly shown on the packaging.

Season rules (knowledge-based, do NOT use any season written on the package):
- season_months: The typical production or market season of this fruit or variety in Japan. This is inferred from general knowledge (fruit type/variety), not from the packaging. Use month format in Japanese, e.g. "12月–5月", "6月–8月", "9月–10月". Leave "" if the typical season cannot be reasonably inferred.
- When you fill season_months, add to notes: "產季為一般典型月份，非包裝明示" (or similar) so the user knows it is not from the package.
- notes: Use for the season disclaimer above and other uncertainties. Leave "" if nothing to add.

Leave any other field as an empty string "" if the information is not found.

Respond with ONLY a valid JSON object in this exact shape (no markdown, no \`\`\`json):
{
  "fruit_category": "",
  "fruit_category_ja": "",
  "possible_variety": "",
  "possible_variety_ja": "",
  "origin": "",
  "brand_or_farm": "",
  "grade": "",
  "summary_zh_tw": "",
  "season_months": "",
  "notes": ""
}`;

export async function POST(request: Request) {
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
        { error: "Please upload an image." },
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

    const text = result.response.text()?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "No response from the model." },
        { status: 502 }
      );
    }

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const json = JSON.parse(cleaned) as Record<string, string>;
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const is429 = /429|quota|Quota/i.test(message);
    const isLocation = /location is not supported|not supported for the API/i.test(message);
    const friendly = is429
      ? "已超過目前免費額度或每分鐘請求上限，請稍候約一分鐘再試。"
      : isLocation
        ? "您目前所在地區不支援使用 Gemini API。請使用 VPN 連到支援地區後再試。"
        : message;
    return NextResponse.json(
      { error: friendly },
      { status: is429 ? 429 : 502 }
    );
  }
}
