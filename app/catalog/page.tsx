"use client";

import { useEffect, useMemo, useState } from "react";
import {
  catalogDB,
  normalizeCatalogEntry,
  type CatalogStatus,
  type FruitCatalogEntry,
} from "@/lib/catalogDB";
import { toHongKongTerminology } from "@/lib/hkTerminology";

type FullEditDraft = {
  fruit_category_display: string;
  possible_variety_display: string;
  origin_display: string;
  season_months: string;
  summary_zh_tw: string;
};

const statusFilterOptions: Array<{ value: "all" | CatalogStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "want", label: "想試" },
  { value: "tried", label: "已試" },
];

type SortMode = "latest" | "earliest" | "updated";

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
}

function makeFullEditDraft(entry: FruitCatalogEntry): FullEditDraft {
  return {
    fruit_category_display: entry.fruit_category_display,
    possible_variety_display: entry.possible_variety_display,
    origin_display: entry.origin_display,
    season_months: entry.season_months,
    summary_zh_tw: entry.summary_zh_tw,
  };
}

function splitCharacteristics(value: string): string[] {
  return value
    .split(/\r?\n|；|;|、/)
    .map((item) => item.trim().replace(/^[-*•●○▪▫・‧]\s*/, "").replace(/[。]+$/g, ""))
    .filter(Boolean);
}

function renderStars(rating: number | null): string {
  const count = rating ?? 0;
  return `${"★".repeat(count)}${"☆".repeat(Math.max(0, 5 - count))}`;
}

function statusLabel(status: CatalogStatus): string {
  return status === "tried" ? "已試" : "想試";
}

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
    if (!context) throw new Error("縮圖失敗");

    context.drawImage(image, 0, 0, width, height);
    const webpData = canvas.toDataURL("image/webp", quality);
    if (webpData.startsWith("data:image/webp")) return webpData;
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function detectImageExt(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/gif")) return "gif";
  return "jpg";
}

export default function CatalogPage() {
  const [entries, setEntries] = useState<FruitCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<FruitCatalogEntry | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | CatalogStatus>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [quickTagInput, setQuickTagInput] = useState("");
  const [quickReviewInput, setQuickReviewInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<FullEditDraft | null>(null);
  const [replacementImageFile, setReplacementImageFile] = useState<File | null>(null);
  const [replacementImagePreviewUrl, setReplacementImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadEntries = async () => {
      setIsLoading(true);
      try {
        const items = await catalogDB.entries.orderBy("created_at").reverse().toArray();
        setEntries(items.map((item) => normalizeCatalogEntry(item as unknown as Record<string, unknown>)));
      } finally {
        setIsLoading(false);
      }
    };

    void loadEntries();
  }, []);

  useEffect(() => {
    setQuickReviewInput(selectedEntry?.tasting_note ?? "");
  }, [selectedEntry]);

  useEffect(() => {
    return () => {
      if (replacementImagePreviewUrl) URL.revokeObjectURL(replacementImagePreviewUrl);
    };
  }, [replacementImagePreviewUrl]);

  const allTags = useMemo(() => {
    const unique = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.tags) unique.add(tag);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [entries]);

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (statusFilter !== "all" && entry.status !== statusFilter) return false;
        if (selectedTags.length > 0) {
          const tagSet = new Set(entry.tags);
          return selectedTags.every((tag) => tagSet.has(tag));
        }
        return true;
      }),
    [entries, selectedTags, statusFilter]
  );

  const sortedEntries = useMemo(() => {
    const list = [...filteredEntries];
    if (sortMode === "earliest") {
      return list.sort((a, b) => a.created_at - b.created_at);
    }
    if (sortMode === "updated") {
      return list.sort((a, b) => b.updated_at - a.updated_at);
    }
    return list.sort((a, b) => b.created_at - a.created_at);
  }, [filteredEntries, sortMode]);

  const updateEntryInState = (updatedEntry: FruitCatalogEntry) => {
    setEntries((prev) => prev.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry)));
    setSelectedEntry((prev) => (prev?.id === updatedEntry.id ? updatedEntry : prev));
  };

  const applyPartialUpdate = async (
    entry: FruitCatalogEntry,
    partial: Partial<FruitCatalogEntry>,
    markEdited: boolean
  ) => {
    if (typeof entry.id !== "number") return;
    const payload: Partial<FruitCatalogEntry> = {
      ...partial,
      updated_at: Date.now(),
      is_edited: markEdited ? true : entry.is_edited,
    };
    await catalogDB.entries.update(entry.id, payload);
    const updatedEntry = normalizeCatalogEntry({
      ...entry,
      ...payload,
    } as Record<string, unknown>);
    updateEntryInState(updatedEntry);
  };

  const resetEditArtifacts = () => {
    setIsEditing(false);
    setDraft(null);
    setReplacementImageFile(null);
    if (replacementImagePreviewUrl) URL.revokeObjectURL(replacementImagePreviewUrl);
    setReplacementImagePreviewUrl(null);
  };

  const handleDeleteEntry = async (entry: FruitCatalogEntry) => {
    if (typeof entry.id !== "number") return;
    const confirmed = window.confirm("確定刪除此圖鑑項目？");
    if (!confirmed) return;

    await catalogDB.entries.delete(entry.id);
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    setSelectedEntry((prev) => (prev?.id === entry.id ? null : prev));
    resetEditArtifacts();
    setQuickTagInput("");
    setQuickReviewInput("");
  };

  const handleToggleFilterTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  const handleOpenDetail = (entry: FruitCatalogEntry) => {
    setSelectedEntry(entry);
    resetEditArtifacts();
    setQuickTagInput("");
  };

  const handleQuickStatusChange = async (status: CatalogStatus) => {
    if (!selectedEntry) return;
    if (selectedEntry.status === status) return;
    await applyPartialUpdate(selectedEntry, { status }, true);
  };

  const handleQuickRating = async (value: number) => {
    if (!selectedEntry) return;
    const next = selectedEntry.rating === value ? null : value;
    await applyPartialUpdate(selectedEntry, { rating: next }, true);
  };

  const handleQuickRemoveTag = async (tag: string) => {
    if (!selectedEntry) return;
    await applyPartialUpdate(
      selectedEntry,
      { tags: selectedEntry.tags.filter((item) => item !== tag) },
      true
    );
  };

  const handleQuickAddTag = async () => {
    if (!selectedEntry) return;
    const normalized = normalizeTag(quickTagInput);
    if (!normalized) return;
    if (selectedEntry.tags.includes(normalized)) {
      setQuickTagInput("");
      return;
    }
    await applyPartialUpdate(selectedEntry, { tags: [...selectedEntry.tags, normalized] }, true);
    setQuickTagInput("");
  };

  const handleQuickReviewBlur = async () => {
    if (!selectedEntry) return;
    if (quickReviewInput === selectedEntry.tasting_note) return;
    await applyPartialUpdate(selectedEntry, { tasting_note: quickReviewInput }, true);
  };

  const handleStartEdit = () => {
    if (!selectedEntry) return;
    setDraft(makeFullEditDraft(selectedEntry));
    setIsEditing(true);
    setReplacementImageFile(null);
    if (replacementImagePreviewUrl) URL.revokeObjectURL(replacementImagePreviewUrl);
    setReplacementImagePreviewUrl(null);
  };

  const handleSaveFullEdit = async () => {
    if (!selectedEntry || !draft) return;
    if (typeof selectedEntry.id !== "number") return;

    const changed =
      selectedEntry.fruit_category_display !== draft.fruit_category_display ||
      selectedEntry.possible_variety_display !== draft.possible_variety_display ||
      selectedEntry.origin_display !== draft.origin_display ||
      selectedEntry.season_months !== draft.season_months ||
      selectedEntry.summary_zh_tw !== draft.summary_zh_tw ||
      replacementImageFile !== null;

    let nextImageData: string | undefined;
    if (replacementImageFile) {
      nextImageData = await createThumbnailDataUrl(replacementImageFile);
    }

    await applyPartialUpdate(
      selectedEntry,
      {
        fruit_category_display: draft.fruit_category_display,
        possible_variety_display: draft.possible_variety_display,
        origin_display: draft.origin_display,
        season_months: draft.season_months,
        summary_zh_tw: draft.summary_zh_tw,
        ...(nextImageData ? { image_data: nextImageData } : {}),
      },
      changed
    );
    resetEditArtifacts();
  };

  const handleDownloadImage = (entry: FruitCatalogEntry) => {
    const link = document.createElement("a");
    link.href = entry.image_data;
    link.download = `fruit-catalog-${entry.id ?? Date.now()}.${detectImageExt(entry.image_data)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <>
      <main className="min-h-screen bg-gray-50 px-4 pb-12 pt-32 text-black sm:px-6 sm:pt-36">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-4 text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">水果圖鑑</h1>
            <p className="mt-1 text-sm text-gray-500">已收錄 {sortedEntries.length} 項</p>
          </header>

          {!isLoading && entries.length > 0 ? (
            <section className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-full bg-gray-100 p-1">
                  <div className="grid grid-cols-3 gap-1">
                    {statusFilterOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStatusFilter(option.value)}
                        className={`min-h-10 rounded-full text-sm transition ${
                          statusFilter === option.value
                            ? "bg-black text-white"
                            : "text-gray-600 hover:bg-white hover:text-gray-900"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700"
                >
                  <option value="latest">最新加入</option>
                  <option value="earliest">最早加入</option>
                  <option value="updated">最近更新</option>
                </select>
              </div>
              {allTags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {allTags.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleFilterTag(tag)}
                        className={`min-h-9 rounded-full px-3 text-xs transition ${
                          active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {toHongKongTerminology(tag)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}

          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              正在載入圖鑑⋯⋯
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <p className="text-lg font-medium text-gray-700">你的水果圖鑑仍然是空的</p>
              <p className="mt-2 text-sm text-gray-500">先分析一個水果並加入圖鑑吧！</p>
            </div>
          ) : sortedEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              <p>沒有符合條件的水果</p>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setSelectedTags([]);
                }}
                className="mt-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
              >
                試試清除篩選條件
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
              {sortedEntries.map((entry) => {
                const title = entry.possible_variety_display || entry.fruit_category_display || "未命名水果";
                return (
                  <article
                    key={entry.id}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(entry)}
                      className="block w-full text-left"
                    >
                      <div className="aspect-square w-full bg-gray-100">
                        <img
                          src={entry.image_data}
                          alt={`${title}收藏圖鑑圖片`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="space-y-1.5 px-2.5 py-2.5">
                        <p className="line-clamp-1 text-xs font-semibold text-gray-900 sm:text-sm">
                          {toHongKongTerminology(title)}
                        </p>
                        <p className="line-clamp-1 text-[11px] text-gray-500 sm:text-xs">
                          {toHongKongTerminology(entry.origin_display || "產地未標註")}
                        </p>
                        {entry.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {entry.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
                              >
                                {toHongKongTerminology(tag)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="text-[11px] text-gray-600">
                          {entry.status === "want" ? (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">
                              🟡 想試
                            </span>
                          ) : entry.rating ? (
                            <span className="font-medium text-amber-500">{renderStars(entry.rating)}</span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                              已試
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {selectedEntry ? (
        <div className="fixed inset-0 z-40 bg-black/40 px-4 py-8 sm:px-6">
          <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex justify-end gap-2 border-b border-gray-100 bg-white/95 px-5 py-3 backdrop-blur sm:px-6">
              {!isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="min-h-10 rounded-full border border-gray-300 px-4 text-sm text-gray-700 transition hover:bg-gray-50"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteEntry(selectedEntry)}
                    className="min-h-10 rounded-full border border-red-200 px-4 text-sm text-red-600 transition hover:bg-red-50"
                  >
                    刪除
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={resetEditArtifacts}
                    className="min-h-10 rounded-lg px-3 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveFullEdit()}
                    className="min-h-10 rounded-full bg-black px-4 text-sm text-white shadow-sm transition hover:opacity-90"
                  >
                    儲存
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedEntry(null);
                  resetEditArtifacts();
                  setQuickTagInput("");
                  setQuickReviewInput("");
                }}
                className="min-h-10 rounded-lg px-3 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                關閉
              </button>
            </div>

            <div className="p-5 sm:p-6">
              {!isEditing ? (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                  <img
                    src={selectedEntry.image_data}
                    alt="水果圖鑑詳情圖片"
                    className="max-h-96 w-full object-cover"
                  />
                </div>
              ) : null}

              {isEditing && draft ? (
                <div className="mt-2 space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                  <div>
                    <p className="text-sm text-gray-500">圖片</p>
                    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                      <img
                        src={replacementImagePreviewUrl ?? selectedEntry.image_data}
                        alt="編輯圖片預覽"
                        className="max-h-64 w-full object-cover"
                      />
                    </div>
                    <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center rounded-full border border-gray-300 px-4 text-sm text-gray-700 transition hover:bg-gray-50">
                      更改圖片
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp,image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setReplacementImageFile(file);
                          if (replacementImagePreviewUrl) URL.revokeObjectURL(replacementImagePreviewUrl);
                          setReplacementImagePreviewUrl(URL.createObjectURL(file));
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>

                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">水果類別</span>
                    <input
                      value={draft.fruit_category_display}
                      onChange={(e) => setDraft({ ...draft, fruit_category_display: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-gray-200 px-3"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">推定品種</span>
                    <input
                      value={draft.possible_variety_display}
                      onChange={(e) => setDraft({ ...draft, possible_variety_display: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-gray-200 px-3"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">產地</span>
                    <input
                      value={draft.origin_display}
                      onChange={(e) => setDraft({ ...draft, origin_display: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-gray-200 px-3"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">產季</span>
                    <input
                      value={draft.season_months}
                      onChange={(e) => setDraft({ ...draft, season_months: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-gray-200 px-3"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">摘要</span>
                    <textarea
                      value={draft.summary_zh_tw}
                      onChange={(e) => setDraft({ ...draft, summary_zh_tw: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <div className="mt-5">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {toHongKongTerminology(
                        selectedEntry.possible_variety_display ||
                          selectedEntry.fruit_category_display ||
                          "未命名水果"
                      )}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {toHongKongTerminology(selectedEntry.origin_display || "產地未標註")}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDownloadImage(selectedEntry)}
                      className="mt-3 min-h-10 rounded-full border border-gray-300 px-4 text-sm text-gray-700 transition hover:bg-gray-50"
                    >
                      下載圖片
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="rounded-full bg-gray-100 p-1">
                      <div className="grid grid-cols-2 gap-1">
                        {(["want", "tried"] as CatalogStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => void handleQuickStatusChange(status)}
                            className={`min-h-10 rounded-full text-sm transition ${
                              selectedEntry.status === status
                                ? "bg-black text-white"
                                : "text-gray-600 hover:bg-white hover:text-gray-900"
                            }`}
                          >
                            {statusLabel(status)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs text-gray-400">分類標籤</p>
                      {selectedEntry.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedEntry.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => void handleQuickRemoveTag(tag)}
                              className="min-h-9 rounded-full bg-gray-100 px-3 text-xs text-gray-600"
                            >
                              {toHongKongTerminology(tag)} ×
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-400">尚未設定標籤</p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <input
                          value={quickTagInput}
                          onChange={(e) => setQuickTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            void handleQuickAddTag();
                          }}
                          placeholder="新增標籤"
                          className="min-h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => void handleQuickAddTag()}
                          className="min-h-10 rounded-full bg-black px-4 text-sm text-white"
                        >
                          加入
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs text-gray-400">評分</p>
                      <div className="mt-1 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => void handleQuickRating(value)}
                            className={`text-xl transition ${
                              (selectedEntry.rating ?? 0) >= value
                                ? "text-amber-500"
                                : "text-gray-300 hover:text-amber-400"
                            }`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs text-gray-400">用戶評價</p>
                      <textarea
                        value={quickReviewInput}
                        onChange={(e) => setQuickReviewInput(e.target.value)}
                        onBlur={() => void handleQuickReviewBlur()}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="mt-5 space-y-4 rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm sm:px-5">
                    {selectedEntry.variety_characteristics ? (
                      <section>
                        <p className="text-xs font-medium tracking-wide text-gray-400">品種特點</p>
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-800">
                          {splitCharacteristics(toHongKongTerminology(selectedEntry.variety_characteristics)).map(
                            (item) => (
                              <li key={item}>{item}</li>
                            )
                          )}
                        </ul>
                      </section>
                    ) : null}
                    {selectedEntry.season_months ? (
                      <section>
                        <p className="text-xs font-medium tracking-wide text-gray-400">產季</p>
                        <p className="mt-1 text-sm leading-6 text-gray-700">{selectedEntry.season_months}</p>
                      </section>
                    ) : null}
                    {selectedEntry.summary_zh_tw ? (
                      <section>
                        <p className="text-xs font-medium tracking-wide text-gray-400">摘要</p>
                        <p className="mt-1 text-sm leading-6 text-gray-700">
                          {toHongKongTerminology(selectedEntry.summary_zh_tw)}
                        </p>
                      </section>
                    ) : null}
                  </div>
                </>
              )}

              <p className="mt-4 text-right text-xs text-gray-400">
                建立於 {formatDate(selectedEntry.created_at)} · 更新於 {formatDate(selectedEntry.updated_at)} ·{" "}
                建立版本 v{selectedEntry.app_version}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
