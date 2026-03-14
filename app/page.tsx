"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import packageJson from "../package.json";
import { buildFruitProfileRows, normalizeAnalysisResult } from "@/lib/fruitProfile";
import { normalizeAnalysisRecordFields } from "@/lib/normalizer";
import {
  getGuideIcon,
  normalizeEnrichmentResult,
  type FruitEnrichmentResult,
} from "@/lib/enrichment";
import { getRarityBadge } from "@/lib/rarity";
import {
  catalogDB,
  createCatalogEntryFromAnalysis,
  createCatalogSaveDraftFromAnalysis,
  serializeAnalysisResult,
  type CatalogSaveDraft,
} from "@/lib/catalogDB";
import type { AnalysisResult } from "@/lib/fruitProfile";
import { mergeAnalyzeAndEnrich } from "@/lib/utils/mergeCatalogData";
import { useAnalyzeStore } from "@/store/useAnalyzeStore";

async function compressImageToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("圖片載入失敗"));
    img.src = objectUrl;
  });

  try {
    const maxSide = 1200;
    const quality = 0.8;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("縮圖失敗：無法建立繪圖環境");

    context.drawImage(image, 0, 0, width, height);
    const webpData = canvas.toDataURL("image/webp", quality);
    if (webpData.startsWith("data:image/webp")) return webpData;
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function handleToggleRating(current: number | null, nextValue: number): number | null {
  return current === nextValue ? null : nextValue;
}

function normalizeHalfStarValue(value: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value * 2) / 2));
}

function getStarFillClass(rating: number | null, starIndex: number): "full" | "half" | "empty" {
  const safe = normalizeHalfStarValue(rating);
  const diff = safe - starIndex + 1;
  if (diff >= 1) return "full";
  if (diff >= 0.5) return "half";
  return "empty";
}

function RatingInput({
  value,
  onChange,
  sizeClass = "text-2xl",
}: {
  value: number | null;
  onChange: (nextValue: number) => void;
  sizeClass?: string;
}) {
  return (
    <div className={`inline-flex items-center ${sizeClass}`}>
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const fill = getStarFillClass(value, starIndex);
        const leftValue = starIndex - 0.5;
        const rightValue = starIndex;
        return (
          <div key={starIndex} className="relative inline-flex h-[1.2em] w-[1.1em] items-center justify-center">
            <span className="text-gray-300">★</span>
            {fill === "full" ? (
              <span className="absolute inset-0 overflow-hidden text-amber-500">★</span>
            ) : fill === "half" ? (
              <span className="absolute inset-0 w-1/2 overflow-hidden text-amber-500">★</span>
            ) : null}
            <button
              type="button"
              aria-label={`${leftValue} 星`}
              className="absolute inset-y-0 left-0 w-1/2"
              onClick={() => onChange(leftValue)}
            />
            <button
              type="button"
              aria-label={`${rightValue} 星`}
              className="absolute inset-y-0 right-0 w-1/2"
              onClick={() => onChange(rightValue)}
            />
          </div>
        );
      })}
    </div>
  );
}

function InlineEditableAnalysisField({
  field,
  value,
}: {
  field: "possible_variety_display" | "brand_or_farm_display" | "origin_display";
  value: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const { updateStage1Field } = useAnalyzeStore();

  const safeValue = value ?? "";

  // keep local draft in sync when external value changes and we're not editing
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isEditing) {
      setDraft(safeValue);
    }
  }, [safeValue, isEditing]);

  const startEdit = () => {
    setDraft(safeValue);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(safeValue);
    setIsEditing(false);
  };

  const confirmEdit = () => {
    const next = draft.trim();
    if (!next) return;
    updateStage1Field(field, next);
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      {isEditing ? (
        <>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="min-h-7 flex-1 border-b border-gray-300 bg-transparent px-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={confirmEdit}
            disabled={!draft.trim()}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
            aria-label="確認編輯"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-[11px] text-gray-500"
            aria-label="取消編輯"
          >
            ×
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-sm font-semibold text-gray-900">
            {safeValue || <span className="text-gray-400">未填寫</span>}
          </span>
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-[10px] text-gray-400 hover:border-gray-300 hover:text-gray-600"
            aria-label="編輯"
          >
            ✎
          </button>
        </>
      )}
    </div>
  );
}

function DeepCatalogCard({ merged }: { merged: Record<string, unknown> }) {
  const enrichment = merged.enrichment as import("@/lib/enrichment").FruitEnrichmentResult | undefined;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const title =
    str(merged.possible_variety_display) ||
    str(merged.fruit_category_display) ||
    "深度圖鑑";
  const fruit_category = str(merged.fruit_category_display);
  const possible_variety_display = str(merged.possible_variety_display);
  const origin_display = str(merged.origin_display);
  const brand_or_farm_display = str(merged.brand_or_farm_display);
  const season = enrichment?.season ?? str(merged.season_months) ?? "";
  const catalog_summary = enrichment?.catalog_summary ?? "";
  const market_position = enrichment?.market_position ?? "";
  const standout_sensory_traits = enrichment?.standout_sensory_traits ?? [];
  const background_lore = enrichment?.background_lore ?? [];
  const practical_guide = enrichment?.practical_guide ?? [];
  const common_regions = enrichment?.common_regions ?? [];
  const rarity_hint = enrichment?.rarity_hint ?? "mass_market";
  const rarityBadge = getRarityBadge(rarity_hint);

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 via-yellow-50/80 to-white p-4 shadow-[0_0_20px_rgba(251,191,36,0.15)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-amber-900">{title}</h3>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${rarityBadge.className}`}
        >
          {rarityBadge.tier} · {rarityBadge.label}
        </span>
      </div>
      {catalog_summary ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{catalog_summary}</p>
      ) : null}
      {market_position ? (
        <p className="mt-2 text-xs text-gray-500">{market_position}</p>
      ) : null}
      <dl className="mt-4 space-y-2 border-t border-amber-100 pt-4">
        {fruit_category ? (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 text-sm">
            <dt className="text-gray-500">水果類別</dt>
            <dd className="font-medium text-gray-900">{fruit_category}</dd>
          </div>
        ) : null}
        {possible_variety_display ? (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 text-sm">
            <dt className="text-gray-500">推定品種</dt>
            <dd className="font-medium text-gray-900">{possible_variety_display}</dd>
          </div>
        ) : null}
        {origin_display ? (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 text-sm">
            <dt className="text-gray-500">產地</dt>
            <dd className="font-medium text-gray-900">{origin_display}</dd>
          </div>
        ) : null}
        {brand_or_farm_display ? (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 text-sm">
            <dt className="text-gray-500">品牌／農園</dt>
            <dd className="font-medium text-gray-900">{brand_or_farm_display}</dd>
          </div>
        ) : null}
        {season ? (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 text-sm">
            <dt className="text-gray-500">產季</dt>
            <dd className="font-medium text-gray-900">{season}</dd>
          </div>
        ) : null}
      </dl>
      {standout_sensory_traits.length > 0 ? (
        <section className="mt-4">
          <p className="text-xs font-medium tracking-wide text-gray-500">感官特點</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-800">
            {standout_sensory_traits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {background_lore.length > 0 ? (
        <section className="mt-4">
          <p className="text-xs font-medium tracking-wide text-gray-500">圖鑑故事</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-stone-600">
            {background_lore.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {practical_guide.length > 0 ? (
        <section className="mt-4">
          <p className="text-xs font-medium tracking-wide text-gray-500">實用指南</p>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
            {practical_guide.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span>{getGuideIcon(item)}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {common_regions.length > 0 ? (
        <section className="mt-4">
          <p className="text-xs font-medium tracking-wide text-gray-500">常見產地</p>
          <p className="mt-1 text-sm text-gray-700">{common_regions.join("、")}</p>
        </section>
      ) : null}
    </div>
  );
}

function hasSaveDraftChanged(
  baseline: CatalogSaveDraft | null,
  current: CatalogSaveDraft | null
): boolean {
  if (!baseline || !current) return false;
  return (
    baseline.possible_variety_display !== current.possible_variety_display ||
    baseline.origin_display !== current.origin_display ||
    baseline.status !== current.status ||
    baseline.rating !== current.rating ||
    baseline.tasting_note !== current.tasting_note
  );
}

function areSameImages(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

const version = packageJson.version;

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultSectionRef = useRef<HTMLElement | null>(null);

  const {
    images: stagedImages,
    analyzedImages: analysisImages,
    stage1Result: analysisResult,
    rawStage1Result: rawAnalysisResult,
    analysisError,
    enrichmentResult,
    enrichmentError,
    isAnalyzing,
    isEnriching,
    hasAnalyzed,
    resultMode,
    finalCatalogData,
    setImages,
    setAnalyzedImages,
    setStage1Result,
    setAnalysisError,
    setEnrichmentResult,
    setEnrichmentError,
    setIsAnalyzing,
    setIsEnriching,
    setHasAnalyzed,
    setResultMode,
    setFinalCatalogData,
    clearDraft,
  } = useAnalyzeStore();

  const [isCompressing, setIsCompressing] = useState(false);
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sessionSavedSignatures, setSessionSavedSignatures] = useState<Set<string>>(() => new Set());
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState<CatalogSaveDraft | null>(null);
  const [saveDraftBaseline, setSaveDraftBaseline] = useState<CatalogSaveDraft | null>(null);

  const fruitProfileRows = analysisResult ? buildFruitProfileRows(analysisResult) : [];
  const rawAnalysisForSignature = useMemo(() => {
    if (resultMode === "deep" && finalCatalogData) {
      const { enrichment, ...rest } = finalCatalogData;
      return Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : null;
    }
    return rawAnalysisResult;
  }, [resultMode, finalCatalogData, rawAnalysisResult]);
  const currentAnalysisSignature = useMemo(
    () => (rawAnalysisForSignature ? serializeAnalysisResult(rawAnalysisForSignature) : ""),
    [rawAnalysisForSignature]
  );
  const isCurrentSavedInSession =
    currentAnalysisSignature.length > 0 && sessionSavedSignatures.has(currentAnalysisSignature);
  const hasImageChangesAfterAnalyze =
    analysisImages.length > 0 && !areSameImages(stagedImages, analysisImages);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (isCompressing || isAnalyzing || !hasAnalyzed) return;
    if (!analysisResult && !analysisError) return;
    resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [analysisError, analysisResult, hasAnalyzed, isAnalyzing, isCompressing]);

  const openSaveModal = () => {
    const effectiveRaw =
      resultMode === "deep" && finalCatalogData
        ? (() => {
            const { enrichment, ...rest } = finalCatalogData;
            return Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : null;
          })()
        : rawAnalysisResult;
    if (!effectiveRaw || !analysisResult || analysisImages.length === 0) return;
    if (hasImageChangesAfterAnalyze) return;
    const draft = createCatalogSaveDraftFromAnalysis(effectiveRaw);
    setSaveDraft(draft);
    setSaveDraftBaseline(draft);
    setIsSaveModalOpen(true);
  };

  const handleConfirmCatalogSave = async () => {
    const effectiveRaw =
      resultMode === "deep" && finalCatalogData
        ? (() => {
            const { enrichment, ...rest } = finalCatalogData;
            return Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : null;
          })()
        : rawAnalysisResult;
    const effectiveEnrichment =
      resultMode === "deep" && finalCatalogData && finalCatalogData.enrichment
        ? (finalCatalogData.enrichment as import("@/lib/enrichment").FruitEnrichmentResult)
        : enrichmentResult;
    if (!effectiveRaw || !analysisResult || !saveDraft || analysisImages.length === 0) return;
    if (hasImageChangesAfterAnalyze) return;
    const analysisSignature = serializeAnalysisResult(effectiveRaw);
    if (sessionSavedSignatures.has(analysisSignature)) return;

    setIsSavingCatalog(true);
    try {
      const existingEntries = await catalogDB.entries.toArray();
      const isDuplicate = existingEntries.some(
        (entry) => serializeAnalysisResult(entry.analysis_result) === analysisSignature
      );

      if (isDuplicate) {
        setSessionSavedSignatures((prev) => new Set(prev).add(analysisSignature));
        setToastMessage("此分析已在圖鑑中");
        setIsSaveModalOpen(false);
        setSaveDraft(null);
        setSaveDraftBaseline(null);
        return;
      }

      const isEdited = hasSaveDraftChanged(saveDraftBaseline, saveDraft);
      await catalogDB.entries.add(
        createCatalogEntryFromAnalysis({
          images: analysisImages,
          analysis_result: effectiveRaw,
          app_version: version,
          overrides: saveDraft,
          is_edited: isEdited,
          enrichment: effectiveEnrichment ?? undefined,
        })
      );

      setSessionSavedSignatures((prev) => new Set(prev).add(analysisSignature));
      setToastMessage("已加入圖鑑");
      setIsSaveModalOpen(false);
      setSaveDraft(null);
      setSaveDraftBaseline(null);
      clearDraft();
    } catch {
      setToastMessage("加入圖鑑失敗，請稍後再試");
    } finally {
      setIsSavingCatalog(false);
    }
  };

  const handleUnlockEnrichment = async () => {
    if (!analysisResult || !rawAnalysisResult || isEnriching) return;
    setIsEnriching(true);
    setEnrichmentError(null);

    try {
      const ocrPackageInfo = Array.isArray(rawAnalysisResult.detected_text_lines)
        ? rawAnalysisResult.detected_text_lines.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0
          )
        : [];
      const payload = {
        fruit_category: analysisResult.fruit_category_display,
        confirmed_variety:
          analysisResult.possible_variety_display || analysisResult.possible_variety_original || "",
        confirmed_origin: analysisResult.origin_display || "",
        ocr_package_info: ocrPackageInfo,
      };
      const confirmedFacts: string[] = [];
      const varietyFact =
        analysisResult.possible_variety_display.trim() ||
        analysisResult.possible_variety_original.trim() ||
        "";
      if (varietyFact) {
        confirmedFacts.push(`推定品種: ${varietyFact}`);
      }
      if (analysisResult.brand_or_farm_display.trim()) {
        confirmedFacts.push(`品牌／農園: ${analysisResult.brand_or_farm_display.trim()}`);
      }
      if (analysisResult.origin_display.trim()) {
        confirmedFacts.push(`產地: ${analysisResult.origin_display.trim()}`);
      }
      console.info("[enrich] request_payload", payload, { confirmedFacts });

      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          confirmed_facts: confirmedFacts,
        }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch (err) {
          console.error("[enrich] frontend_json_parse_failed", {
            status: res.status,
            error: err instanceof Error ? err.message : String(err),
            rawText,
          });
        }
      }
      if (!res.ok) {
        console.error("[enrich] request_failed", {
          status: res.status,
          statusText: res.statusText,
          response: rawText,
        });
        const apiError =
          typeof data.error === "string"
            ? data.error
            : rawText.trim() || `http_${res.status}`;
        const detail = typeof data.detail === "string" ? data.detail : "";
        setEnrichmentError(detail ? `${apiError}: ${detail}` : apiError);
        return;
      }
      const normalizedEnrichment = normalizeEnrichmentResult(data);
      setEnrichmentResult(normalizedEnrichment);
      const merged = mergeAnalyzeAndEnrich(rawAnalysisResult, normalizedEnrichment);
      setFinalCatalogData(merged);
      setResultMode("deep");
    } catch (err) {
      console.error("[enrich] unexpected_frontend_error", err);
      setEnrichmentError("深度圖鑑資料暫時無法取得");
    } finally {
      setIsEnriching(false);
    }
  };

  const handleAddImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const availableSlots = Math.max(0, 3 - stagedImages.length);
    if (availableSlots === 0) {
      setToastMessage("最多只能加入 3 張圖片");
      return;
    }

    setIsCompressing(true);
    try {
      const compressed: string[] = [];
      for (const file of files.slice(0, availableSlots)) {
        compressed.push(await compressImageToDataUrl(file));
      }
      setImages([...stagedImages, ...compressed].slice(0, 3));
    } catch {
      setToastMessage("圖片處理失敗，請再試一次");
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(stagedImages.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleAnalyze = async () => {
    if (stagedImages.length === 0) {
      setToastMessage("請先加入至少 1 張圖片");
      return;
    }

    setStage1Result(null, null);
    setAnalysisError(null);
    setHasAnalyzed(false);
    setIsAnalyzing(true);
    setEnrichmentResult(null);
    setEnrichmentError(null);
    setIsEnriching(false);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: stagedImages }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `伺服器發生異常 (狀態碼: ${res.status})\n回傳內容: ${rawText.substring(0, 100)}${rawText.length > 100 ? "…" : ""}`
        );
      }

      if (!res.ok || data.error) {
        setAnalysisError(String(data?.error ?? "發生未知錯誤"));
        setHasAnalyzed(true);
        return;
      }

      const normalizedRecord = normalizeAnalysisRecordFields(data);
      setStage1Result(normalizeAnalysisResult(normalizedRecord) as AnalysisResult, normalizedRecord);
      setAnalyzedImages([...stagedImages]);
      setHasAnalyzed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "網路或伺服器錯誤";
      const friendly =
        msg === "Failed to fetch"
          ? "無法連線到伺服器（Failed to fetch）。請確認：① 終端機有執行 npm run dev 且無報錯 ② 網址為 http://localhost:3000 ③ 網路或防火牆未阻擋。"
          : msg;
      setAnalysisError(friendly);
      setHasAnalyzed(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(e) => void handleAddImages(e)}
      />

      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-5 text-center sm:px-6 sm:pt-6">
          <div className="w-full text-left">
            <h1 className="text-xl font-semibold text-gray-900">AI品種鑑定</h1>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li>① 拍攝或上傳水果圖片（圖片中須有水果名稱或包裝）</li>
              <li>② 查看AI的品種分析結果</li>
              <li>③ 加入想試或個人圖鑑</li>
            </ul>
          </div>

          <section className="mt-4 w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">加入 1–3 張圖片，再開始鑑定</h2>
                <p className="mt-1 text-xs text-gray-500">可加入包裝、果實、產地貼紙（最多 3 張）。</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
              {stagedImages.map((image, index) => (
                <div key={`${image.slice(0, 24)}-${index}`} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <img src={image} alt={`待鑑定圖片 ${index + 1}`} className="aspect-square w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 text-[11px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {stagedImages.length < 3 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  +
                </button>
              ) : null}
            </div>
            {(stagedImages.length > 0 || analysisResult || analysisError || enrichmentResult || enrichmentError) && (
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="mt-2 text-xs text-gray-500 hover:text-gray-800 transition-colors text-left"
              >
                全部清空
              </button>
            )}
            <div className="mt-3 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={isCompressing || isAnalyzing || stagedImages.length === 0}
                className="min-h-10 rounded-lg bg-black px-4 text-sm font-medium text-white disabled:bg-gray-300"
              >
                {isAnalyzing ? "鑑定中…" : hasImageChangesAfterAnalyze ? "重新鑑定" : "開始鑑定"}
              </button>
            </div>
            {hasImageChangesAfterAnalyze ? (
              <p className="mt-2 text-xs text-amber-700">圖片已變更，請按「重新鑑定」更新結果。</p>
            ) : null}
          </section>

          <section
            ref={resultSectionRef}
            className="mt-4 w-full scroll-mt-36 rounded-2xl bg-gray-50 p-4 text-left shadow-sm sm:mt-5 sm:p-5"
          >
            <div className="flex w-full flex-col gap-2">
              <div className="flex w-full items-start justify-between gap-3">
                <h2 className="shrink-0 whitespace-nowrap text-lg font-semibold text-gray-900">
                  分析結果
                </h2>
                {hasAnalyzed && analysisResult ? (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      disabled={
                        isSavingCatalog ||
                        !rawAnalysisResult ||
                        analysisImages.length === 0 ||
                        isCurrentSavedInSession ||
                        hasImageChangesAfterAnalyze
                      }
                      onClick={openSaveModal}
                      className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium shadow-md transition ${
                        hasImageChangesAfterAnalyze
                          ? "cursor-not-allowed border border-amber-200 bg-amber-50 text-amber-700"
                          : isCurrentSavedInSession
                            ? "cursor-not-allowed border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "bg-black text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                      }`}
                    >
                      {hasImageChangesAfterAnalyze
                        ? "請先重新鑑定"
                        : isSavingCatalog
                          ? "加入中…"
                          : isCurrentSavedInSession
                            ? "已加入圖鑑"
                            : "＋ 加入圖鑑"}
                    </button>
                    <button
                      type="button"
                      disabled={isEnriching || !analysisResult || !rawAnalysisResult}
                      onClick={() => void handleUnlockEnrichment()}
                      className="min-h-10 rounded-full border border-amber-300 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-4 py-2 text-sm font-medium text-amber-900 shadow-[0_0_15px_rgba(251,191,36,0.35)] transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-75 flex items-center justify-center"
                    >
                      {isEnriching ? (
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                          發掘更多品種特性...
                        </span>
                      ) : enrichmentResult ? (
                        "已深入了解品種"
                      ) : (
                        "✨ 深入了解品種"
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
              {hasAnalyzed && analysisResult ? (
                <div className="w-full text-right">
                  <p className="inline-block max-w-[85%] text-xs text-gray-500">
                    以目前顯示的「品種」、「品牌/農園」和「產地」作為既定事實進行更深度推演
                  </p>
                  {enrichmentError ? (
                    <p className="mt-1 text-xs text-red-600">{enrichmentError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {analysisImages.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-gray-500">本次鑑定圖片</p>
                <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                  {analysisImages.map((image, index) => (
                    <img
                      key={`${image.slice(0, 20)}-${index}`}
                      src={image}
                      alt={`鑑定圖片 ${index + 1}`}
                      className="h-16 w-16 shrink-0 rounded-md object-cover"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3">
              {isCompressing ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">
                  正在處理／壓縮中⋯⋯
                </div>
              ) : isAnalyzing ? (
                <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
                  分析中...
                </div>
              ) : hasAnalyzed && analysisError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800">
                  {analysisError}
                </div>
              ) : hasAnalyzed && analysisResult ? (
                <div key={resultMode} className="rounded-2xl transition-opacity duration-300 ease-out">
                  {resultMode === "deep" && finalCatalogData && finalCatalogData.enrichment ? (
                    <DeepCatalogCard merged={finalCatalogData} />
                  ) : (
                    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-6">
                      {fruitProfileRows.length > 0 ? (
                        <dl className="divide-y divide-gray-100">
                          {fruitProfileRows.map((row) => (
                            <div
                              key={row.label}
                              className="grid grid-cols-[6.25rem_1fr] gap-x-3 py-3 sm:grid-cols-[7.5rem_1fr] sm:py-4"
                            >
                              <dt className="text-xs font-medium tracking-wide text-gray-400">{row.label}</dt>
                              <dd className="text-sm leading-6 text-gray-900 sm:text-base">
                                {row.label === "品種特點" && row.bulletItems && row.bulletItems.length > 0 ? (
                                  <ul className="list-disc space-y-1 pl-4 font-medium text-gray-800 marker:text-gray-400">
                                    {row.bulletItems.map((item) => (
                                      <li key={item}>{item}</li>
                                    ))}
                                  </ul>
                                ) : analysisResult && row.label === "推定品種" ? (
                                  <InlineEditableAnalysisField
                                    field="possible_variety_display"
                                    value={
                                      analysisResult.possible_variety_display ||
                                      analysisResult.possible_variety_original ||
                                      ""
                                    }
                                  />
                                ) : analysisResult && row.label === "品牌 / 農園" ? (
                                  <InlineEditableAnalysisField
                                    field="brand_or_farm_display"
                                    value={analysisResult.brand_or_farm_display}
                                  />
                                ) : analysisResult && row.label === "產地" ? (
                                  <InlineEditableAnalysisField
                                    field="origin_display"
                                    value={analysisResult.origin_display}
                                  />
                                ) : (
                                  <span className="font-semibold">{row.value}</span>
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="text-sm text-gray-500">目前未擷取到可展示的水果資訊。</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-400">
                  尚未分析。請先在上方加入圖片，再按「開始鑑定」。
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <div className="pointer-events-none fixed bottom-3 right-4 text-xs text-gray-400">v{version}</div>

      {isSaveModalOpen && saveDraft ? (
        <div className="fixed inset-0 z-50 bg-black/40 px-4 py-6 sm:px-6">
          <div className="mx-auto max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-5">
            <h3 className="text-base font-semibold text-gray-900">收錄到水果圖鑑</h3>
            <p className="mt-1 text-xs text-gray-500">可先微調關鍵資訊，再確認收錄。</p>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-gray-500">推定品種</span>
                <input
                  value={saveDraft.possible_variety_display}
                  onChange={(e) => setSaveDraft({ ...saveDraft, possible_variety_display: e.target.value })}
                  className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-gray-500">產地</span>
                <input
                  value={saveDraft.origin_display}
                  onChange={(e) => setSaveDraft({ ...saveDraft, origin_display: e.target.value })}
                  className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                />
              </label>
              <div className="space-y-3">
                <div className="rounded-full bg-gray-100 p-1">
                  <div className="grid grid-cols-2 gap-1">
                    {(["want", "tried"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setSaveDraft({ ...saveDraft, status })}
                        className={`min-h-10 rounded-full text-sm transition ${
                          saveDraft.status === status
                            ? "bg-black text-white"
                            : "text-gray-600 hover:bg-white hover:text-gray-900"
                        }`}
                      >
                        {status === "want" ? "想試" : "已試"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">評分</p>
                  <div className="mt-1 flex items-center gap-2">
                    <RatingInput
                      value={saveDraft.rating}
                      onChange={(value) =>
                        setSaveDraft({
                          ...saveDraft,
                          rating: handleToggleRating(saveDraft.rating, value),
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setSaveDraft({ ...saveDraft, rating: null })}
                      className="ml-2 text-xs text-gray-500 underline underline-offset-2"
                    >
                      清除
                    </button>
                  </div>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-gray-500">用戶評價</span>
                <textarea
                  value={saveDraft.tasting_note}
                  onChange={(e) => setSaveDraft({ ...saveDraft, tasting_note: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsSaveModalOpen(false);
                  setSaveDraft(null);
                  setSaveDraftBaseline(null);
                }}
                className="min-h-10 rounded-lg px-3 text-sm text-gray-500 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmCatalogSave()}
                disabled={isSavingCatalog}
                className="min-h-10 rounded-full bg-black px-4 text-sm text-white shadow-sm disabled:bg-gray-300"
              >
                {isSavingCatalog ? "收錄中…" : "確認收錄"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-full bg-black px-4 py-2 text-xs text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </>
  );
}
