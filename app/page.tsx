"use client";

import imageCompression from "browser-image-compression";
import { useEffect, useMemo, useRef, useState } from "react";
import packageJson from "../package.json";
import { buildFruitProfileRows, normalizeAnalysisResult } from "@/lib/fruitProfile";
import {
  catalogDB,
  createCatalogEntryFromAnalysis,
  createCatalogSaveDraftFromAnalysis,
  serializeAnalysisResult,
  type CatalogSaveDraft,
} from "@/lib/catalogDB";
import type { AnalysisResult } from "@/lib/fruitProfile";

async function createThumbnailDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("圖片載入失敗"));
    img.src = objectUrl;
  });

  try {
    const maxSide = 800;
    const quality = 0.8;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("縮圖失敗：無法建立繪圖環境");
    }

    context.drawImage(image, 0, 0, width, height);
    const webpData = canvas.toDataURL("image/webp", quality);
    if (webpData.startsWith("data:image/webp")) {
      return webpData;
    }
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const version = packageJson.version;

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
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

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultSectionRef = useRef<HTMLElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    if (!rawAnalysisResult || !selectedFile || !analysisResult) return;
    const draft = createCatalogSaveDraftFromAnalysis(rawAnalysisResult);
    setSaveDraft(draft);
    setSaveDraftBaseline(draft);
    setSaveTagInput("");
    setIsSaveModalOpen(true);
  };

  const handleConfirmCatalogSave = async () => {
    if (!selectedFile || !rawAnalysisResult || !analysisResult) return;
    if (!saveDraft) return;
    const analysisSignature = serializeAnalysisResult(rawAnalysisResult);
    if (sessionSavedSignatures.has(analysisSignature)) return;

    setIsSavingCatalog(true);
    try {
      const existingEntries = await catalogDB.entries.toArray();
      const isDuplicate = existingEntries.some(
        (entry) => serializeAnalysisResult(entry.analysis_result) === analysisSignature
      );

      if (isDuplicate) {
        setSessionSavedSignatures((prev) => {
          const next = new Set(prev);
          next.add(analysisSignature);
          return next;
        });
        setToastMessage("此分析已在圖鑑中");
        setIsSaveModalOpen(false);
        setSaveDraft(null);
        setSaveDraftBaseline(null);
        setSaveTagInput("");
        return;
      }

      const thumbnailData = await createThumbnailDataUrl(selectedFile);
      const isEdited = hasSaveDraftChanged(saveDraftBaseline, saveDraft);
      await catalogDB.entries.add(
        createCatalogEntryFromAnalysis({
          image_data: thumbnailData,
          analysis_result: rawAnalysisResult,
          app_version: version,
          overrides: saveDraft,
          is_edited: isEdited,
        })
      );

      setSessionSavedSignatures((prev) => {
        const next = new Set(prev);
        next.add(analysisSignature);
        return next;
      });
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

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const url = URL.createObjectURL(file);
          setPreviewUrl(url);
          setSelectedFile(file);
          setAnalysisResult(null);
          setRawAnalysisResult(null);
          setAnalysisError(null);
          setIsSaveModalOpen(false);
          setSaveDraft(null);
          setSaveDraftBaseline(null);
          setSaveTagInput("");
          setIsCompressing(true);
          setHasAnalyzed(false);
          e.target.value = "";
          try {
            let fileToSend = file;
            try {
              fileToSend = await imageCompression(file, {
                maxSizeMB: 2,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
              });
            } catch {
              fileToSend = file;
            }
            setIsCompressing(false);
            setIsAnalyzing(true);
            const formData = new FormData();
            formData.append("image", fileToSend);
            const res = await fetch("/api/analyze", { method: "POST", body: formData });
            const rawText = await res.text();
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(rawText);
            } catch {
              throw new Error(
                `伺服器發生異常 (狀態碼: ${res.status})\n回傳內容: ${rawText.substring(0, 100)}${rawText.length > 100 ? "…" : ""}`
              );
            }
            if (!res.ok) {
              setAnalysisError(String(data?.error ?? "發生未知錯誤"));
              setRawAnalysisResult(null);
              setHasAnalyzed(true);
            } else if (data.error) {
              setAnalysisError(String(data.error));
              setRawAnalysisResult(null);
              setHasAnalyzed(true);
            } else {
              setAnalysisResult(normalizeAnalysisResult(data));
              setRawAnalysisResult(data);
              setHasAnalyzed(true);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "網路或伺服器錯誤";
            const friendly =
              msg === "Failed to fetch"
                ? "無法連線到伺服器（Failed to fetch）。請確認：① 終端機有執行 npm run dev 且無報錯 ② 網址為 http://localhost:3000 ③ 網路或防火牆未阻擋。"
                : msg;
            setAnalysisError(friendly);
            setRawAnalysisResult(null);
            setHasAnalyzed(true);
          } finally {
            setIsCompressing(false);
            setIsAnalyzing(false);
          }
        }}
      />
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 pb-8 pt-32 text-center sm:px-6 sm:pt-36">
        <section className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm sm:p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            上傳水果（須連包裝）照片，幫你從包裝文字鑑定品種
          </h2>

          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl bg-black px-5 py-2.5 text-center text-sm font-medium text-white transition hover:opacity-90"
            >
              選擇圖片或拍照
            </button>
          </div>
          {previewUrl && (
            <div className="mt-2.5">
              <p className="text-xs font-medium text-gray-700">
                已選擇的圖片
                {isCompressing ? " · 正在處理／壓縮中" : isAnalyzing ? " · 分析中⋯⋯" : ""}
              </p>
              <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                <img
                  src={previewUrl}
                  alt="已選擇的水果包裝圖片預覽"
                  className="max-h-52 w-full object-contain sm:max-h-72"
                />
              </div>
            </div>
          )}
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
                disabled={isSavingCatalog || !selectedFile || !rawAnalysisResult || isCurrentSavedInSession}
                onClick={openSaveModal}
                className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium shadow-md transition ${
                  isCurrentSavedInSession
                    ? "cursor-not-allowed border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "bg-black text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                }`}
              >
                {isSavingCatalog ? "加入中…" : isCurrentSavedInSession ? "已加入圖鑑" : "＋ 加入圖鑑"}
              </button>
            ) : null}
          </div>

          <div className="mt-3">
            {isCompressing ? (
              <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">
                正在處理／壓縮中⋯⋯
              </div>
            ) : isAnalyzing ? (
              <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
                正在以 AI 分析包裝文字⋯⋯
              </div>
            ) : hasAnalyzed && analysisError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-800">
                {analysisError}
              </div>
            ) : hasAnalyzed && analysisResult ? (
              <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-6">
                {analysisResult.summary_zh_tw && (
                  <p className="text-[15px] leading-7 text-gray-700 sm:text-base">
                    {analysisResult.summary_zh_tw}
                  </p>
                )}
                {fruitProfileRows.length > 0 ? (
                  <dl className={`${analysisResult.summary_zh_tw ? "mt-5" : ""} divide-y divide-gray-100`}>
                    {fruitProfileRows.map((row) => (
                      <div
                        key={row.label}
                        className="grid grid-cols-[6.25rem_1fr] gap-x-3 py-3 sm:grid-cols-[7.5rem_1fr] sm:py-4"
                      >
                        <dt className="text-xs font-medium tracking-wide text-gray-400">
                          {row.label}
                        </dt>
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
                尚未分析。請在上方選擇或拍攝圖片，將自動開始分析。
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
    <div className="pointer-events-none fixed bottom-3 right-4 text-xs text-gray-400">
      v{version}
    </div>
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
                onChange={(e) =>
                  setSaveDraft({ ...saveDraft, possible_variety_display: e.target.value })
                }
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-gray-500">狀態</span>
                <select
                  value={saveDraft.status}
                  onChange={(e) =>
                    setSaveDraft({
                      ...saveDraft,
                      status: e.target.value === "tried" ? "tried" : "want",
                    })
                  }
                  className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                >
                  <option value="want">想試</option>
                  <option value="tried">已試</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-500">評分</span>
                <select
                  value={saveDraft.rating ?? ""}
                  onChange={(e) =>
                    setSaveDraft({
                      ...saveDraft,
                      rating: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                >
                  <option value="">未評分</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value} 分
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-gray-500">品飲筆記</span>
              <textarea
                value={saveDraft.tasting_note}
                onChange={(e) => setSaveDraft({ ...saveDraft, tasting_note: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="space-y-2">
              <span className="text-xs text-gray-500">標籤</span>
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
