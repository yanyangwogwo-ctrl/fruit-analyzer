import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  normalizeEnrichmentResult,
  type FruitEnrichmentResult,
  type FruitEnrichmentPayload,
} from "@/lib/enrichment";

export const maxDuration = 60;

function errorResponse(
  status: number,
  error: "invalid_enrichment_payload" | "gemini_model_error" | "invalid_ai_json" | "internal_enrich_error",
  detail?: string
) {
  return NextResponse.json(detail ? { error, detail } : { error }, { status });
}

function parseEnrichRequestBody(raw: unknown): {
  payload?: FruitEnrichmentPayload;
  error?: "invalid_enrichment_payload";
  detail?: string;
} {
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

  const missingFields: string[] = [];
  if (!payload.fruit_category) missingFields.push("fruit_category");
  if (!payload.confirmed_variety) missingFields.push("confirmed_variety");
  if (!payload.confirmed_origin) missingFields.push("confirmed_origin");
  if (missingFields.length > 0) {
    return {
      error: "invalid_enrichment_payload",
      detail: `missing_fields:${missingFields.join(",")}`,
    };
  }

  return { payload };
}

function stripMarkdownCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function buildParseCandidate(rawText: string): { cleanedText: string; parseCandidate: string } {
  const cleanedText = stripMarkdownCodeFence(rawText);
  const firstBraceIndex = cleanedText.indexOf("{");
  const lastBraceIndex = cleanedText.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return {
      cleanedText,
      parseCandidate: cleanedText.slice(firstBraceIndex, lastBraceIndex + 1).trim(),
    };
  }
  return { cleanedText, parseCandidate: cleanedText };
}

function collectNormalizationIssues(raw: unknown): string[] {
  const issues: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ["root:not_object"];
  }
  const obj = raw as Record<string, unknown>;
  const arrayFields = ["standout_sensory_traits", "common_regions", "background_lore", "practical_guide"];
  const stringFields = ["season", "market_position", "catalog_summary"];
  for (const field of arrayFields) {
    const value = obj[field];
    if (value != null && !Array.isArray(value)) {
      issues.push(`${field}:not_array`);
      continue;
    }
    if (Array.isArray(value) && value.some((item) => typeof item !== "string")) {
      issues.push(`${field}:non_string_item`);
    }
  }
  for (const field of stringFields) {
    const value = obj[field];
    if (value != null && typeof value !== "string") {
      issues.push(`${field}:not_string`);
    }
  }
  const rarity = obj.rarity_hint;
  if (
    rarity != null &&
    rarity !== "mass_market" &&
    rarity !== "regional_specialty" &&
    rarity !== "premium_variety" &&
    rarity !== "luxury_gift" &&
    rarity !== "auction_grade"
  ) {
    issues.push("rarity_hint:invalid");
  }
  return issues;
}

function isCompletelyUnusable(result: FruitEnrichmentResult): boolean {
  return (
    result.standout_sensory_traits.length === 0 &&
    result.common_regions.length === 0 &&
    result.background_lore.length === 0 &&
    result.practical_guide.length === 0 &&
    result.season.length === 0 &&
    result.market_position.length === 0 &&
    result.catalog_summary.length === 0
  );
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
  const envModelName = (process.env.GEMINI_MODEL || "").trim();
  const modelName = envModelName || "gemini-2.5-flash";
  console.info("[enrich] gemini_model", modelName);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_enrichment_payload", "invalid_json_body");
  }

  const parsed = parseEnrichRequestBody(body);
  if (parsed.error || !parsed.payload) {
    return errorResponse(400, parsed.error ?? "invalid_enrichment_payload", parsed.detail);
  }
  console.info("[enrich] request_payload", parsed.payload);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse(500, "gemini_model_error", "missing_gemini_api_key");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
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
      text = result.response.text() || "";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[enrich] gemini_model_error", { modelName, message });
      return errorResponse(502, "gemini_model_error", message);
    }

    console.error("Gemini enrich raw output:", text);
    if (!text.trim()) {
      return errorResponse(502, "invalid_ai_json", "empty_ai_text");
    }

    const { cleanedText, parseCandidate } = buildParseCandidate(text);
    console.error("Gemini enrich cleaned output:", cleanedText);
    console.error("Gemini enrich parse candidate:", parseCandidate);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(parseCandidate);
    } catch (parseError) {
      const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
      console.error("Gemini enrich parse error:", parseMessage);
      console.error("Gemini enrich raw output:", text);
      console.error("Gemini enrich cleaned output:", cleanedText);
      console.error("Gemini enrich parse candidate:", parseCandidate);
      return errorResponse(502, "invalid_ai_json", parseMessage || "json_parse_failed");
    }

    const normalizationIssues = collectNormalizationIssues(parsedJson);
    if (normalizationIssues.length > 0) {
      console.warn("[enrich] normalization_issues", normalizationIssues);
    }
    const normalized = normalizeEnrichmentResult(parsedJson);
    if (isCompletelyUnusable(normalized)) {
      console.error("[enrich] normalized_result_unusable", {
        rawOutput: text,
        cleanedOutput: cleanedText,
      });
      return errorResponse(502, "invalid_ai_json", "normalized_result_empty");
    }
    return NextResponse.json(normalized, { headers: { "X-Gemini-Model": modelName } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[enrich] internal_enrich_error", message);
    return errorResponse(500, "internal_enrich_error", message);
  }
}
