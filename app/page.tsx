"use client";

import imageCompression from "browser-image-compression";
import { useRef, useState } from "react";
import packageJson from "../package.json";

type AnalysisResult = {
  fruit_category_display: string;
  fruit_category_original: string;
  possible_variety_display: string;
  possible_variety_original: string;
  variety_characteristics: string;
  origin_display: string;
  brand_or_farm_display: string;
  grade_display: string;
  season_months: string;
  summary_zh_tw: string;
  notes: string;
  detected_text_lines: string[];
};

type FruitProfileRow = {
  label: string;
  value: string;
};

function normalizeAnalysisResult(data: Record<string, unknown>): AnalysisResult {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    fruit_category_display: str(data.fruit_category_display),
    fruit_category_original: str(data.fruit_category_original),
    possible_variety_display: str(data.possible_variety_display),
    possible_variety_original: str(data.possible_variety_original),
    variety_characteristics: str(data.variety_characteristics),
    origin_display: str(data.origin_display),
    brand_or_farm_display: str(data.brand_or_farm_display),
    grade_display: str(data.grade_display),
    season_months: str(data.season_months),
    summary_zh_tw: str(data.summary_zh_tw),
    notes: str(data.notes),
    detected_text_lines: arr(data.detected_text_lines),
  };
}

function buildFruitProfileRows(result: AnalysisResult): FruitProfileRow[] {
  const rows: FruitProfileRow[] = [
    { label: "水果類別", value: result.fruit_category_display },
    { label: "推定品種", value: result.possible_variety_display },
    { label: "品種特點", value: result.variety_characteristics },
    { label: "產地", value: result.origin_display },
    { label: "品牌 / 農園", value: result.brand_or_farm_display },
    { label: "產季", value: result.season_months },
    { label: "備註", value: result.notes },
  ];

  return rows.filter((row) => row.value.trim().length > 0);
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
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const fruitProfileRows = analysisResult ? buildFruitProfileRows(analysisResult) : [];

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
                        <dd className="text-sm font-semibold leading-6 text-gray-900 sm:text-base">
                          {row.value}
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
    </>
  );
}
