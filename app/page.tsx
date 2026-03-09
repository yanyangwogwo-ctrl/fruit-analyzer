"use client";

import imageCompression from "browser-image-compression";
import { useEffect, useMemo, useRef, useState } from "react";
import packageJson from "../package.json";
import { buildFruitProfileRows, normalizeAnalysisResult } from "@/lib/fruitProfile";
import { catalogDB, serializeAnalysisResult } from "@/lib/catalogDB";
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

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
          水果品種鑑定師
        </h1>

        <section className="mt-8 w-full rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            上傳水果（須連包裝）照片，幫你從包裝文字鑑定品種
          </h2>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl bg-black px-5 py-3 text-center text-sm font-medium text-white transition hover:opacity-90"
            >
              選擇圖片或拍照
            </button>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            選擇或拍攝圖片後會自動開始分析包裝文字。
          </p>
          {previewUrl && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-700">
                已選擇的圖片
                {isCompressing ? " · 正在處理／壓縮中" : isAnalyzing ? " · 分析中⋯⋯" : ""}
              </p>
              <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                <img
                  src={previewUrl}
                  alt="已選擇的水果包裝圖片預覽"
                  className="max-h-80 w-full object-contain"
                />
              </div>
            </div>
          )}
        </section>
        <section className="mt-10 w-full rounded-2xl bg-gray-50 p-6 text-left shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            分析結果
          </h2>

          <div className="mt-4">
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
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    disabled={isSavingCatalog || !selectedFile || !rawAnalysisResult || isCurrentSavedInSession}
                    onClick={async () => {
                      if (!selectedFile || !rawAnalysisResult) return;
                      const analysisSignature = serializeAnalysisResult(rawAnalysisResult);
                      if (sessionSavedSignatures.has(analysisSignature)) return;

                      setIsSavingCatalog(true);
                      try {
                        const existingEntries = await catalogDB.entries.toArray();
                        const isDuplicate = existingEntries.some(
                          (entry) =>
                            serializeAnalysisResult(entry.analysis_result) === analysisSignature
                        );

                        if (isDuplicate) {
                          setSessionSavedSignatures((prev) => {
                            const next = new Set(prev);
                            next.add(analysisSignature);
                            return next;
                          });
                          setToastMessage("此分析已在圖鑑中");
                          return;
                        }

                        const thumbnailData = await createThumbnailDataUrl(selectedFile);
                        await catalogDB.entries.add({
                          image_data: thumbnailData,
                          analysis_result: rawAnalysisResult,
                          fruit_category_display: analysisResult.fruit_category_display,
                          possible_variety_display: analysisResult.possible_variety_display,
                          origin_display: analysisResult.origin_display,
                          created_at: Date.now(),
                          app_version: version,
                        });

                        setSessionSavedSignatures((prev) => {
                          const next = new Set(prev);
                          next.add(analysisSignature);
                          return next;
                        });
                        setToastMessage("已加入圖鑑");
                      } catch {
                        setToastMessage("加入圖鑑失敗，請稍後再試");
                      } finally {
                        setIsSavingCatalog(false);
                      }
                    }}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      isCurrentSavedInSession
                        ? "cursor-not-allowed border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "bg-black text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                    }`}
                  >
                    {isSavingCatalog ? "加入中…" : isCurrentSavedInSession ? "已加入圖鑑" : "加入圖鑑"}
                  </button>
                </div>
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
    {toastMessage ? (
      <div className="pointer-events-none fixed bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-full bg-black px-4 py-2 text-xs text-white shadow-lg">
        {toastMessage}
      </div>
    ) : null}
    </>
  );
}
