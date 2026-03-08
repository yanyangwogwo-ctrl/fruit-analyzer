"use client";

import { useRef, useState } from "react";

type AnalysisResult = {
  fruit_category: string;
  fruit_category_ja: string;
  possible_variety: string;
  possible_variety_ja: string;
  origin: string;
  brand_or_farm: string;
  grade: string;
  summary_zh_tw: string;
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
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setPreviewUrl(URL.createObjectURL(file));
          setSelectedFile(file);
          setHasAnalyzed(false);
          setIsAnalyzing(false);
          setAnalysisResult(null);
          setAnalysisError(null);
          e.target.value = "";
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

          <p className="mt-2 text-sm text-gray-600">
            支援 jpg / jpeg / png。iPhone 的 HEIC 照片之後會在瀏覽器中先轉檔再送去給 AI 分析。
          </p>

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
            選擇圖片後點「開始解析」，會將圖片傳送至後端並以 Gemini 分析包裝文字。
          </p>
          {previewUrl && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-700">
                已選擇的圖片預覽：
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
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={async () => {
                if (!selectedFile) {
                  alert("請先選擇一張水果包裝圖片。");
                  return;
                }
                setIsAnalyzing(true);
                setHasAnalyzed(false);
                setAnalysisError(null);
                setAnalysisResult(null);
                try {
                  const formData = new FormData();
                  formData.append("image", selectedFile);
                  const res = await fetch("/api/analyze", {
                    method: "POST",
                    body: formData,
                  });
                  const data = (await res.json()) as Record<string, unknown>;
                  if (data.error) {
                    setAnalysisError(String(data.error));
                    setHasAnalyzed(true);
                  } else if (!res.ok) {
                    setAnalysisError(data.error ? String(data.error) : "解析失敗");
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
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isAnalyzing ? "解析中⋯⋯" : "開始解析"}
            </button>
          </div>
        </section>
        <section className="mt-10 w-full rounded-2xl bg-gray-50 p-6 text-left shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            分析結果預覽
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            之後 AI 解析出的水果資訊會顯示在這裡，包括品種、產地、等級、包裝上偵測到的日文文字等等。
          </p>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-700">
            {isAnalyzing ? (
              <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
                正在以 Gemini 解析包裝文字⋯⋯
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
                      {analysisResult.fruit_category || "—"}
                      {analysisResult.fruit_category_ja
                        ? `（${analysisResult.fruit_category_ja}）`
                        : ""}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      可能品種
                    </dt>
                    <dd className="text-sm">
                      {analysisResult.possible_variety || "—"}
                      {analysisResult.possible_variety_ja
                        ? `（${analysisResult.possible_variety_ja}）`
                        : ""}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      產地
                    </dt>
                    <dd className="text-sm">{analysisResult.origin || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      品牌／農園
                    </dt>
                    <dd className="text-sm">{analysisResult.brand_or_farm || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                      等級
                    </dt>
                    <dd className="text-sm">{analysisResult.grade || "—"}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-400">
                尚未執行解析。請先在上方選擇圖片，再點「開始解析」。
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
    </>
  );
}