"use client";

import { useEffect, useMemo, useState } from "react";
import {
  catalogDB,
  normalizeCatalogEntry,
  type CatalogStatus,
  type FruitCatalogEntry,
} from "@/lib/catalogDB";
import {
  buildFruitProfileRows,
  normalizeAnalysisResult,
  type AnalysisResult,
} from "@/lib/fruitProfile";

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

type CatalogEntryDraft = {
  fruit_category_display: string;
  possible_variety_display: string;
  possible_variety_original: string;
  variety_characteristics: string;
  origin_display: string;
  brand_or_farm_display: string;
  season_months: string;
  summary_zh_tw: string;
  notes: string;
  status: CatalogStatus;
  rating: number | null;
  tasting_note: string;
  tags: string[];
};

const statusOptions: Array<{ value: CatalogStatus; label: string }> = [
  { value: "want", label: "想試" },
  { value: "tried", label: "已試" },
];

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
}

function createDraft(entry: FruitCatalogEntry): CatalogEntryDraft {
  return {
    fruit_category_display: entry.fruit_category_display,
    possible_variety_display: entry.possible_variety_display,
    possible_variety_original: entry.possible_variety_original,
    variety_characteristics: entry.variety_characteristics,
    origin_display: entry.origin_display,
    brand_or_farm_display: entry.brand_or_farm_display,
    season_months: entry.season_months,
    summary_zh_tw: entry.summary_zh_tw,
    notes: entry.notes,
    status: entry.status,
    rating: entry.rating,
    tasting_note: entry.tasting_note,
    tags: [...entry.tags],
  };
}

function hasDraftChanged(entry: FruitCatalogEntry, draft: CatalogEntryDraft): boolean {
  return (
    entry.fruit_category_display !== draft.fruit_category_display ||
    entry.possible_variety_display !== draft.possible_variety_display ||
    entry.possible_variety_original !== draft.possible_variety_original ||
    entry.variety_characteristics !== draft.variety_characteristics ||
    entry.origin_display !== draft.origin_display ||
    entry.brand_or_farm_display !== draft.brand_or_farm_display ||
    entry.season_months !== draft.season_months ||
    entry.summary_zh_tw !== draft.summary_zh_tw ||
    entry.notes !== draft.notes ||
    entry.status !== draft.status ||
    entry.rating !== draft.rating ||
    entry.tasting_note !== draft.tasting_note ||
    entry.tags.join("|") !== draft.tags.join("|")
  );
}

function statusLabel(status: CatalogStatus): string {
  return status === "tried" ? "已試" : "想試";
}

function ratingLabel(rating: number | null): string {
  return rating ? `${rating} / 5` : "未評分";
}

function toDisplayAnalysisResult(entry: FruitCatalogEntry): AnalysisResult {
  const aiSnapshot = normalizeAnalysisResult(entry.analysis_result);
  return {
    ...aiSnapshot,
    fruit_category_display: entry.fruit_category_display,
    possible_variety_display: entry.possible_variety_display,
    possible_variety_original: entry.possible_variety_original,
    variety_characteristics: entry.variety_characteristics,
    origin_display: entry.origin_display,
    brand_or_farm_display: entry.brand_or_farm_display,
    season_months: entry.season_months,
    summary_zh_tw: entry.summary_zh_tw,
    notes: entry.notes,
  };
}

export default function CatalogPage() {
  const [entries, setEntries] = useState<FruitCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<FruitCatalogEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CatalogEntryDraft | null>(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CatalogStatus>("all");
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);

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
        if (selectedTagFilters.length > 0) {
          const entryTags = new Set(entry.tags);
          return selectedTagFilters.every((tag) => entryTags.has(tag));
        }
        return true;
      }),
    [entries, selectedTagFilters, statusFilter]
  );

  const selectedDisplayResult = selectedEntry ? toDisplayAnalysisResult(selectedEntry) : null;
  const selectedRows = selectedDisplayResult ? buildFruitProfileRows(selectedDisplayResult) : [];

  const handleDeleteEntry = async (id: number | undefined) => {
    if (typeof id !== "number") return;
    const confirmed = window.confirm("確定刪除此圖鑑項目？");
    if (!confirmed) return;

    await catalogDB.entries.delete(id);
    const nextEntries = entries.filter((entry) => entry.id !== id);
    setEntries(nextEntries);
    setSelectedEntry((prev) => (prev?.id === id ? null : prev));
    setIsEditing(false);
    setDraft(null);
    setSelectedTagFilters((prev) =>
      prev.filter((tag) => nextEntries.some((entry) => entry.tags.includes(tag)))
    );
  };

  const handleOpenDetail = (entry: FruitCatalogEntry) => {
    setSelectedEntry(entry);
    setIsEditing(false);
    setDraft(null);
    setNewTagInput("");
  };

  const handleStartEdit = () => {
    if (!selectedEntry) return;
    setDraft(createDraft(selectedEntry));
    setNewTagInput("");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
    setNewTagInput("");
  };

  const handleSaveEdit = async () => {
    if (!selectedEntry || !draft || typeof selectedEntry.id !== "number") return;

    const changed = hasDraftChanged(selectedEntry, draft);
    const payload: Partial<FruitCatalogEntry> = {
      ...draft,
      updated_at: Date.now(),
      is_edited: selectedEntry.is_edited || changed,
    };
    await catalogDB.entries.update(selectedEntry.id, payload);

    const updatedEntry = normalizeCatalogEntry({
      ...selectedEntry,
      ...payload,
    } as Record<string, unknown>);
    setEntries((prev) => prev.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry)));
    setSelectedEntry(updatedEntry);
    setIsEditing(false);
    setDraft(null);
    setNewTagInput("");
  };

  const handleAddDraftTag = () => {
    if (!draft) return;
    const normalized = normalizeTag(newTagInput);
    if (!normalized) return;
    if (draft.tags.includes(normalized)) {
      setNewTagInput("");
      return;
    }
    setDraft({ ...draft, tags: [...draft.tags, normalized] });
    setNewTagInput("");
  };

  const handleRemoveDraftTag = (tag: string) => {
    if (!draft) return;
    setDraft({ ...draft, tags: draft.tags.filter((item) => item !== tag) });
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTagFilters((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
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

          {!isLoading && entries.length > 0 ? (
            <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-400">狀態：</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`min-h-10 rounded-full px-3 text-sm transition ${
                    statusFilter === "all"
                      ? "bg-black text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  全部
                </button>
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`min-h-10 rounded-full px-3 text-sm transition ${
                      statusFilter === option.value
                        ? "bg-black text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {allTags.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400">標籤：</span>
                  {allTags.slice(0, 16).map((tag) => {
                    const active = selectedTagFilters.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTagFilter(tag)}
                        className={`min-h-9 rounded-full px-3 text-xs transition ${
                          active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        #{tag}
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
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              目前沒有符合篩選條件的圖鑑項目。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(entry)}
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
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-400">{formatDate(entry.created_at)}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            entry.status === "tried"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {statusLabel(entry.status)}
                        </span>
                      </div>
                      <p className="text-base font-semibold text-gray-900">
                        {entry.fruit_category_display || "未分類水果"}
                      </p>
                      <p className="text-sm text-gray-700">
                        {entry.possible_variety_display || "未標註品種"}
                      </p>
                      <p className="text-sm text-gray-500">{entry.origin_display || "產地未標註"}</p>
                      {entry.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
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

      {selectedEntry && selectedDisplayResult ? (
        <div className="fixed inset-0 z-40 bg-black/40 px-4 py-8 sm:px-6">
          <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-5 py-3 backdrop-blur sm:px-6">
              <h2 className="text-base font-semibold text-gray-900">圖鑑詳情</h2>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="min-h-10 rounded-lg px-3 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit()}
                      className="min-h-10 rounded-full bg-black px-4 text-sm text-white shadow-sm transition hover:opacity-90"
                    >
                      儲存
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="min-h-10 rounded-full border border-gray-300 px-4 text-sm text-gray-700 transition hover:bg-gray-50"
                  >
                    編輯
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEntry(null);
                    setIsEditing(false);
                    setDraft(null);
                  }}
                  className="min-h-10 rounded-lg px-3 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                >
                  關閉
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                <img
                  src={selectedEntry.image_data}
                  alt="水果圖鑑詳情圖片"
                  className="max-h-80 w-full object-cover"
                />
              </div>

              {isEditing && draft ? (
                <div className="mt-5 space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-gray-500">水果類別</span>
                      <input
                        value={draft.fruit_category_display}
                        onChange={(e) =>
                          setDraft({ ...draft, fruit_category_display: e.target.value })
                        }
                        className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-gray-500">推定品種</span>
                      <input
                        value={draft.possible_variety_display}
                        onChange={(e) =>
                          setDraft({ ...draft, possible_variety_display: e.target.value })
                        }
                        className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-gray-500">品種原文</span>
                      <input
                        value={draft.possible_variety_original}
                        onChange={(e) =>
                          setDraft({ ...draft, possible_variety_original: e.target.value })
                        }
                        className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-gray-500">產地</span>
                      <input
                        value={draft.origin_display}
                        onChange={(e) => setDraft({ ...draft, origin_display: e.target.value })}
                        className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-gray-500">品牌 / 農園</span>
                      <input
                        value={draft.brand_or_farm_display}
                        onChange={(e) =>
                          setDraft({ ...draft, brand_or_farm_display: e.target.value })
                        }
                        className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-gray-500">產季</span>
                      <input
                        value={draft.season_months}
                        onChange={(e) => setDraft({ ...draft, season_months: e.target.value })}
                        className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                      />
                    </label>
                  </div>

                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">品種特點</span>
                    <textarea
                      value={draft.variety_characteristics}
                      onChange={(e) =>
                        setDraft({ ...draft, variety_characteristics: e.target.value })
                      }
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">摘要</span>
                    <textarea
                      value={draft.summary_zh_tw}
                      onChange={(e) => setDraft({ ...draft, summary_zh_tw: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">備註</span>
                    <textarea
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-gray-500">狀態</span>
                      <select
                        value={draft.status}
                        onChange={(e) => setDraft({ ...draft, status: e.target.value as CatalogStatus })}
                        className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-gray-500">評分</span>
                      <select
                        value={draft.rating ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
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
                  <label className="block space-y-1 text-sm">
                    <span className="text-gray-500">品飲筆記</span>
                    <textarea
                      value={draft.tasting_note}
                      onChange={(e) => setDraft({ ...draft, tasting_note: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">標籤</p>
                    {draft.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {draft.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleRemoveDraftTag(tag)}
                            className="min-h-9 rounded-full bg-gray-100 px-3 text-xs text-gray-600 transition hover:bg-gray-200"
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
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddDraftTag();
                          }
                        }}
                        placeholder="新增標籤"
                        className="min-h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleAddDraftTag}
                        className="min-h-10 rounded-full bg-black px-4 text-sm text-white"
                      >
                        加入
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        selectedEntry.status === "tried"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {statusLabel(selectedEntry.status)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                      評分：{ratingLabel(selectedEntry.rating)}
                    </span>
                    {selectedEntry.is_edited ? (
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-600">
                        已手動修正
                      </span>
                    ) : null}
                  </div>
                  {selectedEntry.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedEntry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-6">
                    {selectedDisplayResult.summary_zh_tw ? (
                      <p className="text-[15px] leading-7 text-gray-700 sm:text-base">
                        {selectedDisplayResult.summary_zh_tw}
                      </p>
                    ) : null}

                    {selectedRows.length > 0 ? (
                      <dl className={`${selectedDisplayResult.summary_zh_tw ? "mt-5" : ""} divide-y divide-gray-100`}>
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
                      <p className={`${selectedDisplayResult.summary_zh_tw ? "mt-4" : ""} text-sm text-gray-500`}>
                        目前未擷取到可展示的水果資訊。
                      </p>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <p className="text-xs font-medium text-gray-400">品飲筆記</p>
                    <p className="mt-1 text-sm leading-6 text-gray-700">
                      {selectedEntry.tasting_note || "尚未記錄品飲心得。"}
                    </p>
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
