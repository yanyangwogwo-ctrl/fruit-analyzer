"use client";

import { useEffect, useMemo, useState } from "react";
import { buildFruitProfileRows, normalizeAnalysisResult } from "@/lib/fruitProfile";
import { catalogDB, type CatalogEntry } from "@/lib/catalogDB";

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export default function CatalogPage() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntry | null>(null);

  useEffect(() => {
    const loadEntries = async () => {
      setIsLoading(true);
      try {
        const items = await catalogDB.entries.orderBy("created_at").reverse().toArray();
        setEntries(items);
      } finally {
        setIsLoading(false);
      }
    };

    void loadEntries();
  }, []);

  const selectedAnalysisResult = useMemo(
    () =>
      selectedEntry
        ? normalizeAnalysisResult(selectedEntry.analysis_result as Record<string, unknown>)
        : null,
    [selectedEntry]
  );
  const selectedRows = selectedAnalysisResult ? buildFruitProfileRows(selectedAnalysisResult) : [];

  const handleDeleteEntry = async (id: number | undefined) => {
    if (typeof id !== "number") return;
    const confirmed = window.confirm("確定刪除此圖鑑項目？");
    if (!confirmed) return;

    await catalogDB.entries.delete(id);
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setSelectedEntry((prev) => (prev?.id === id ? null : prev));
  };

  return (
    <>
      <main className="min-h-screen bg-gray-50 px-4 pb-12 pt-32 text-black sm:px-6 sm:pt-36">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-6 text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              本機水果圖鑑
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              你的收藏僅儲存在本機瀏覽器，無需登入。
            </p>
          </header>

          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              正在載入圖鑑⋯⋯
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <p className="text-lg font-medium text-gray-700">你的水果圖鑑仍然是空的</p>
              <p className="mt-2 text-sm text-gray-500">先分析一個水果並加入圖鑑吧！</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => (
                <article
                  key={entry.id}
                  className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedEntry(entry)}
                    className="block w-full text-left"
                  >
                    <div className="aspect-[4/3] w-full bg-gray-100">
                      <img
                        src={entry.image_data}
                        alt={`${entry.fruit_category_display || "水果"}收藏圖鑑圖片`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-2 px-4 py-4">
                      <p className="text-xs text-gray-400">{formatDate(entry.created_at)}</p>
                      <p className="text-base font-semibold text-gray-900">
                        {entry.fruit_category_display || "未分類水果"}
                      </p>
                      <p className="text-sm text-gray-700">
                        {entry.possible_variety_display || "未標註品種"}
                      </p>
                      <p className="text-sm text-gray-500">{entry.origin_display || "產地未標註"}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteEntry(entry.id)}
                    className="absolute top-3 right-3 flex min-h-10 items-center rounded-full border border-gray-200 bg-white/95 px-3 text-xs text-gray-500 shadow-sm transition hover:border-red-200 hover:text-red-600"
                  >
                    刪除
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      {selectedEntry && selectedAnalysisResult ? (
        <div className="fixed inset-0 z-40 bg-black/40 px-4 py-8 sm:px-6">
          <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-3 backdrop-blur sm:px-6">
              <h2 className="text-base font-semibold text-gray-900">圖鑑詳情</h2>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                關閉
              </button>
            </div>

            <div className="p-5 sm:p-6">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                <img
                  src={selectedEntry.image_data}
                  alt="水果圖鑑詳情圖片"
                  className="max-h-80 w-full object-cover"
                />
              </div>

              <div className="mt-5 rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-6">
                {selectedAnalysisResult.summary_zh_tw ? (
                  <p className="text-[15px] leading-7 text-gray-700 sm:text-base">
                    {selectedAnalysisResult.summary_zh_tw}
                  </p>
                ) : null}

                {selectedRows.length > 0 ? (
                  <dl className={`${selectedAnalysisResult.summary_zh_tw ? "mt-5" : ""} divide-y divide-gray-100`}>
                    {selectedRows.map((row) => (
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
                  <p className={`${selectedAnalysisResult.summary_zh_tw ? "mt-4" : ""} text-sm text-gray-500`}>
                    目前未擷取到可展示的水果資訊。
                  </p>
                )}
              </div>

              <p className="mt-4 text-right text-xs text-gray-400">
                建立版本 v{selectedEntry.app_version}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
