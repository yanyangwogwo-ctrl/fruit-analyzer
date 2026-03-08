"use client";

import imageCompression from "browser-image-compression";
import { useRef, useState } from "react";

type AnalysisResult = {
  fruit_category_display: string;
  fruit_category_original: string;
  possible_variety_display: string;
  possible_variety_original: string;
  origin_display: string;
  brand_or_farm_display: string;
  grade_display: string;
  season_months: string;
  summary_zh_tw: string;
  notes: string;
  detected_text_lines: string[];
};

function normalizeAnalysisResult(data: Record<string, unknown>): AnalysisResult {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    fruit_category_display: str(data.fruit_category_display),
    fruit_category_original: str(data.fruit_category_original),
    possible_variety_display: str(data.possible_variety_display),
    possible_variety_original: str(data.possible_variety_original),
    origin_display: str(data.origin_display),
    brand_or_farm_display: str(data.brand_or_farm_display),
    grade_display: str(data.grade_display),
    season_months: str(data.season_months),
    summary_zh_tw: str(data.summary_zh_tw),
    notes: str(data.notes),
    detected_text_lines: arr(data.detected_text_lines),
  };
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

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
              setHasAnalyzed(true);
            } else if (data.error) {
              setAnalysisError(String(data.error));
              setHasAnalyzed(true);
            } else {
              setAnalysisResult(normalizeAnalysisResult(data));
              setHasAnalyzed(true);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "網路或伺服器錯誤";
            const friendly =
              msg === "Failed to fetch"
                ? "無法連線到伺服器（Failed to fetch）。請確認：① 終端機有執行 npm run dev 且無報錯 ② 網址為 http://localhost:3000 ③ 網路或防火牆未阻擋。"
                : msg;
            setAnalysisError(friendly);
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
          水果品種鑑定師v0.1
        </h1>

        <p className="mt-4 text-lg text-gray-600">
          上傳水果（須連包裝），幫你從包裝文字鑑定品種。
        </p>

        <section className="mt-8 w-full rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            上傳水果（須連包裝）照片
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
                已選擇的圖片預覽
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
            分析結果預覽
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            之後 AI 分析出的水果資訊會顯示在這裡，包括品種、產地、等級、包裝標示等（支援各國語言包裝）。
          </p>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-700">
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
              <>
                {analysisResult.summary_zh_tw && (
                  <p className="mb-3 text-sm text-gray-700">
                    {analysisResult.summary_zh_tw}
                  </p>
                )}
                <dl className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      水果類別
                    </dt>
                    <dd className="text-sm">
                      {analysisResult.fruit_category_display || "—"}
                      {analysisResult.fruit_category_original
                        ? <span className="text-gray-500">（{analysisResult.fruit_category_original}）</span>
                        : null}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      可能品種
                    </dt>
                    <dd className="text-sm">
                      {analysisResult.possible_variety_display || "—"}
                      {analysisResult.possible_variety_original
                        ? <span className="text-gray-500">（{analysisResult.possible_variety_original}）</span>
                        : null}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      產地
                    </dt>
                    <dd className="text-sm">{analysisResult.origin_display || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      品牌／農園
                    </dt>
                    <dd className="text-sm">{analysisResult.brand_or_farm_display || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      等級
                    </dt>
                    <dd className="text-sm">{analysisResult.grade_display || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      產季
                    </dt>
                    <dd className="text-sm">{analysisResult.season_months || "—"}</dd>
                  </div>
                  {analysisResult.notes ? (
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                        備註
                      </dt>
                      <dd className="text-sm text-gray-600">{analysisResult.notes}</dd>
                    </div>
                  ) : null}
                  {Array.isArray(analysisResult.detected_text_lines) &&
                  analysisResult.detected_text_lines.length > 0 ? (
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                        偵測到的包裝文字
                      </dt>
                      <dd className="flex flex-wrap gap-1.5 text-sm">
                        {analysisResult.detected_text_lines.map((line, i) => (
                          <span
                            key={i}
                            className="rounded bg-gray-100 px-2 py-0.5 text-gray-700"
                          >
                            {line}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-400">
                尚未分析。請在上方選擇或拍攝圖片，將自動開始分析。
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
    </>
  );
}