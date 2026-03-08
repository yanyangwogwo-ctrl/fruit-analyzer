"use client";

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
};

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
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
          setIsAnalyzing(true);
          setHasAnalyzed(false);
          e.target.value = "";
          try {
            const formData = new FormData();
            formData.append("image", file);
            const res = await fetch("/api/analyze", { method: "POST", body: formData });
            const data = (await res.json()) as Record<string, unknown>;
            if (data.error) {
              setAnalysisError(String(data.error));
              setHasAnalyzed(true);
            } else if (!res.ok) {
              setAnalysisError(data.error ? String(data.error) : "分析失敗");
              setHasAnalyzed(true);
            } else {
              setAnalysisResult(data as unknown as AnalysisResult);
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
                {isAnalyzing ? " · 分析中⋯⋯" : ""}
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
            {isAnalyzing ? (
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