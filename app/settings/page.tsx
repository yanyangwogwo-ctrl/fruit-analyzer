"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCatalogGridCols, setCatalogGridCols, type CatalogGridCols } from "@/lib/settings";
import { catalogDB } from "@/lib/catalogDB";

type ImageDisplayMode = "cover" | "contain";

export default function SettingsPage() {
  const router = useRouter();
  const [gridCols, setGridColsState] = useState<CatalogGridCols>(() => getCatalogGridCols());
  const [imageDisplayMode, setImageDisplayMode] = useState<ImageDisplayMode>("cover");
  const [applyingAll, setApplyingAll] = useState(false);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const handleChangeGridCols = (value: CatalogGridCols) => {
    setGridColsState(value);
    setCatalogGridCols(value);
  };

  const handleApplyImageDisplayToAll = async () => {
    setApplyingAll(true);
    setAppliedMessage(null);
    try {
      const count = await catalogDB.entries.count();
      await catalogDB.entries.toCollection().modify((entry) => {
        (entry as { imageDisplayMode: ImageDisplayMode }).imageDisplayMode = imageDisplayMode;
      });
      setAppliedMessage(`已套用至全部 ${count} 張卡片`);
      setTimeout(() => setAppliedMessage(null), 3000);
    } finally {
      setApplyingAll(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-gray-100 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 text-black sm:px-5 sm:pt-6">
      <button
        type="button"
        aria-label="關閉設定"
        onClick={() => router.back()}
        className="fixed right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
      >
        ✕
      </button>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">圖鑑顯示設定</h1>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => handleChangeGridCols(3)}
              className={`min-h-10 rounded-xl text-sm transition ${
                gridCols === 3 ? "bg-black text-white" : "bg-transparent text-gray-700 hover:bg-gray-200"
              }`}
            >
              一排三張卡片
            </button>
            <button
              type="button"
              onClick={() => handleChangeGridCols(4)}
              className={`min-h-10 rounded-xl text-sm transition ${
                gridCols === 4 ? "bg-black text-white" : "bg-transparent text-gray-700 hover:bg-gray-200"
              }`}
            >
              一排四張卡片
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">圖片顯示方式</h2>
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 transition hover:bg-gray-100">
              <input
                type="radio"
                name="imageDisplayMode"
                checked={imageDisplayMode === "cover"}
                onChange={() => setImageDisplayMode("cover")}
                className="h-4 w-4"
              />
              <span className="text-sm text-gray-800">填滿卡片（推薦）</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 transition hover:bg-gray-100">
              <input
                type="radio"
                name="imageDisplayMode"
                checked={imageDisplayMode === "contain"}
                onChange={() => setImageDisplayMode("contain")}
                className="h-4 w-4"
              />
              <span className="text-sm text-gray-800">保留完整圖片</span>
            </label>
          </div>
          <button
            type="button"
            onClick={() => void handleApplyImageDisplayToAll()}
            disabled={applyingAll}
            className="mt-3 min-h-10 w-full rounded-xl bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 disabled:bg-gray-400"
          >
            {applyingAll ? "套用中…" : "套用到全部圖鑑"}
          </button>
          {appliedMessage ? (
            <p className="mt-2 text-center text-sm text-gray-600" role="status">
              {appliedMessage}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
