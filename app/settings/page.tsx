"use client";

import Link from "next/link";
import { useState } from "react";
import { getCatalogGridCols, setCatalogGridCols, type CatalogGridCols } from "@/lib/settings";

export default function SettingsPage() {
  const [gridCols, setGridColsState] = useState<CatalogGridCols>(() => getCatalogGridCols());

  const handleChangeGridCols = (value: CatalogGridCols) => {
    setGridColsState(value);
    setCatalogGridCols(value);
  };

  return (
    <main className="min-h-[100dvh] bg-gray-100 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 text-black sm:px-5 sm:pt-6">
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

        <Link
          href="/catalog"
          className="inline-flex min-h-10 items-center rounded-full border border-gray-300 bg-white px-4 text-sm text-gray-700"
        >
          返回圖鑑
        </Link>
      </div>
    </main>
  );
}
