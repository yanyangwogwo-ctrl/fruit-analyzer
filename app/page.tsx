"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import packageJson from "../package.json";
import { buildFruitProfileRows, normalizeAnalysisResult } from "@/lib/fruitProfile";
import { normalizeAnalysisRecordFields } from "@/lib/normalizer";
import {
  catalogDB,
  createCatalogEntryFromAnalysis,
  createCatalogSaveDraftFromAnalysis,
  serializeAnalysisResult,
  type CatalogSaveDraft,
} from "@/lib/catalogDB";
import type { AnalysisResult } from "@/lib/fruitProfile";

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

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
}

function handleToggleRating(current: number | null, nextValue: number): number | null {
  return current === nextValue ? null : nextValue;
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
    baseline.tasting_note !== current.tasting_note ||
    baseline.tags.join("|") !== current.tags.join("|")
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

  const [stagedImages, setStagedImages] = useState<string[]>([]);
  const [analysisImages, setAnalysisImages] = useState<string[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [rawAnalysisResult, setRawAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sessionSavedSignatures, setSessionSavedSignatures] = useState<Set<string>>(() => new Set());
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState<CatalogSaveDraft | null>(null);
  const [saveDraftBaseline, setSaveDraftBaseline] = useState<CatalogSaveDraft | null>(null);
  const [saveTagInput, setSaveTagInput] = useState("");

  const fruitProfileRows = analysisResult ? buildFruitProfileRows(analysisResult) : [];
  const currentAnalysisSignature = useMemo(
    () => (rawAnalysisResult ? serializeAnalysisResult(rawAnalysisResult) : ""),
    [rawAnalysisResult]
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
    if (!rawAnalysisResult || !analysisResult || analysisImages.length === 0) return;
    if (hasImageChangesAfterAnalyze) return;
    const draft = createCatalogSaveDraftFromAnalysis(rawAnalysisResult);
    setSaveDraft(draft);
    setSaveDraftBaseline(draft);
    setSaveTagInput("");
    setIsSaveModalOpen(true);
  };

  const handleConfirmCatalogSave = async () => {
    if (!rawAnalysisResult || !analysisResult || !saveDraft || analysisImages.length === 0) return;
    if (hasImageChangesAfterAnalyze) return;
    const analysisSignature = serializeAnalysisResult(rawAnalysisResult);
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
        setSaveTagInput("");
        return;
      }

      const isEdited = hasSaveDraftChanged(saveDraftBaseline, saveDraft);
      await catalogDB.entries.add(
        createCatalogEntryFromAnalysis({
          images: analysisImages,
          analysis_result: rawAnalysisResult,
          app_version: version,
          overrides: saveDraft,
          is_edited: isEdited,
        })
      );

      setSessionSavedSignatures((prev) => new Set(prev).add(analysisSignature));
      setToastMessage("已加入圖鑑");
      setIsSaveModalOpen(false);
      setSaveDraft(null);
      setSaveDraftBaseline(null);
      setSaveTagInput("");
    } catch {
      setToastMessage("加入圖鑑失敗，請稍後再試");
    } finally {
      setIsSavingCatalog(false);
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
      setStagedImages((prev) => [...prev, ...compressed].slice(0, 3));
    } catch {
      setToastMessage("圖片處理失敗，請再試一次");
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setStagedImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleAnalyze = async () => {
    if (stagedImages.length === 0) {
      setToastMessage("請先加入至少 1 張圖片");
      return;
    }

    setAnalysisResult(null);
    setRawAnalysisResult(null);
    setAnalysisError(null);
    setHasAnalyzed(false);
    setIsAnalyzing(true);

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
      setAnalysisResult(normalizeAnalysisResult(normalizedRecord));
      setRawAnalysisResult(normalizedRecord);
      setAnalysisImages([...stagedImages]);
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
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 pb-8 pt-32 text-center sm:px-6 sm:pt-36">
          <section className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm sm:p-5">
            <h2 className="text-lg font-semibold text-gray-900">加入 1–3 張圖片，再開始鑑定</h2>
            <p className="mt-1 text-xs text-gray-500">可加入包裝、果實、產地貼紙（最多 3 張）。</p>

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
                  className="aspect-square rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500"
                >
                  +
                </button>
              ) : null}
            </div>

            <p className="mt-2 text-xs text-gray-500">
              已加入 {stagedImages.length} / 3 張
              {isCompressing ? " · 壓縮中⋯⋯" : ""}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing || stagedImages.length >= 3}
                className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                新增圖片
              </button>
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">分析結果</h2>
              {hasAnalyzed && analysisResult ? (
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
                  Analyzing…
                </div>
              ) : hasAnalyzed && analysisError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800">
                  {analysisError}
                </div>
              ) : hasAnalyzed && analysisResult ? (
                <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-6">
                  {analysisResult.summary_zh_tw ? (
                    <p className="text-[15px] leading-7 text-gray-700 sm:text-base">
                      {analysisResult.summary_zh_tw}
                    </p>
                  ) : null}
                  {fruitProfileRows.length > 0 ? (
                    <dl className={`${analysisResult.summary_zh_tw ? "mt-5" : ""} divide-y divide-gray-100`}>
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
                            ) : (
                              <span className="font-semibold">{row.value}</span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className={`${analysisResult.summary_zh_tw ? "mt-4" : ""} text-sm text-gray-500`}>
                      目前未擷取到可展示的水果資訊。
                    </p>
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
                  <div className="mt-1 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setSaveDraft({
                            ...saveDraft,
                            rating: handleToggleRating(saveDraft.rating, value),
                          })
                        }
                        className={`text-2xl leading-none transition ${
                          (saveDraft.rating ?? 0) >= value
                            ? "text-amber-500"
                            : "text-gray-300 hover:text-amber-400"
                        }`}
                      >
                        ★
                      </button>
                    ))}
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

              <div className="space-y-2">
                <span className="text-xs text-gray-500">分類標籤</span>
                {saveDraft.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {saveDraft.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setSaveDraft({
                            ...saveDraft,
                            tags: saveDraft.tags.filter((item) => item !== tag),
                          })
                        }
                        className="min-h-9 rounded-full bg-gray-100 px-3 text-xs text-gray-600"
                      >
                        #{tag} ×
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">尚未設定標籤</p>
                )}
                <div className="flex gap-2">
                  <input
                    value={saveTagInput}
                    onChange={(e) => setSaveTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const normalized = normalizeTag(saveTagInput);
                      if (!normalized || saveDraft.tags.includes(normalized)) return;
                      setSaveDraft({ ...saveDraft, tags: [...saveDraft.tags, normalized] });
                      setSaveTagInput("");
                    }}
                    placeholder="新增標籤"
                    className="min-h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const normalized = normalizeTag(saveTagInput);
                      if (!normalized || saveDraft.tags.includes(normalized)) return;
                      setSaveDraft({ ...saveDraft, tags: [...saveDraft.tags, normalized] });
                      setSaveTagInput("");
                    }}
                    className="min-h-10 rounded-full bg-black px-4 text-sm text-white"
                  >
                    加入
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsSaveModalOpen(false);
                  setSaveDraft(null);
                  setSaveDraftBaseline(null);
                  setSaveTagInput("");
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
