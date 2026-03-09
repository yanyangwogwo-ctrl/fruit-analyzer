"use client";

import { useEffect, useState } from "react";
import {
  catalogDB,
  normalizeCatalogEntry,
  type CatalogStatus,
  type FruitCatalogEntry,
} from "@/lib/catalogDB";

type CatalogEditDraft = {
  status: CatalogStatus;
  rating: number | null;
  tasting_note: string;
  tags: string[];
};

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

function createEditDraft(entry: FruitCatalogEntry): CatalogEditDraft {
  return {
    status: entry.status,
    rating: entry.rating,
    tasting_note: entry.tasting_note,
    tags: [...entry.tags],
  };
}

function hasDraftChanged(entry: FruitCatalogEntry, draft: CatalogEditDraft): boolean {
  return (
    entry.status !== draft.status ||
    entry.rating !== draft.rating ||
    entry.tasting_note !== draft.tasting_note ||
    entry.tags.join("|") !== draft.tags.join("|")
  );
}

function statusLabel(status: CatalogStatus): string {
  return status === "tried" ? "已試" : "想試";
}

function renderStars(rating: number | null): string {
  const count = rating ?? 0;
  return `${"★".repeat(count)}${"☆".repeat(Math.max(0, 5 - count))}`;
}

function splitCharacteristics(value: string): string[] {
  return value
    .split(/\r?\n|；|;|、/)
    .map((item) => item.trim().replace(/^[-*•●○▪▫・‧]\s*/, "").replace(/[。]+$/g, ""))
    .filter(Boolean);
}

export default function CatalogPage() {
  const [entries, setEntries] = useState<FruitCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<FruitCatalogEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CatalogEditDraft | null>(null);
  const [newTagInput, setNewTagInput] = useState("");

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

  const handleDeleteEntry = async (id: number | undefined, fromModal = false) => {
    if (typeof id !== "number") return;
    const confirmed = window.confirm("確定刪除此圖鑑項目？");
    if (!confirmed) return;

    await catalogDB.entries.delete(id);
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (fromModal) {
      setSelectedEntry(null);
    } else {
      setSelectedEntry((prev) => (prev?.id === id ? null : prev));
    }
    setIsEditing(false);
    setDraft(null);
    setNewTagInput("");
  };

  const handleOpenDetail = (entry: FruitCatalogEntry) => {
    setSelectedEntry(entry);
    setIsEditing(false);
    setDraft(null);
    setNewTagInput("");
  };

  const handleStartEdit = () => {
    if (!selectedEntry) return;
    setDraft(createEditDraft(selectedEntry));
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

  return (
    <>
      <main className="min-h-screen bg-gray-50 px-4 pb-12 pt-32 text-black sm:px-6 sm:pt-36">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-5 text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              水果圖鑑
            </h1>
            <p className="mt-1 text-sm text-gray-500">已收錄 {entries.length} 項</p>
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
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {entries.map((entry) => {
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
                      <div className="space-y-2 px-3 py-3">
                        <p className="line-clamp-1 text-sm font-semibold text-gray-900 sm:text-base">
                          {title}
                        </p>
                        <p className="line-clamp-1 text-xs text-gray-500 sm:text-sm">
                          {entry.origin_display || "產地未標註"}
                        </p>
                        {entry.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {entry.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="pt-0.5 text-xs text-gray-600">
                          {entry.status === "want" ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                              🟡 想試
                            </span>
                          ) : (
                            <span className="font-medium text-emerald-700">{renderStars(entry.rating)}</span>
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
                      onClick={() => void handleDeleteEntry(selectedEntry.id, true)}
                      className="min-h-10 rounded-full border border-red-200 px-4 text-sm text-red-600 transition hover:bg-red-50"
                    >
                      刪除
                    </button>
                  </>
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
                      <span className="text-gray-500">狀態</span>
                      <select
                        value={draft.status}
                        onChange={(e) => setDraft({ ...draft, status: e.target.value as CatalogStatus })}
                        className="min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                      >
                        <option value="want">想試</option>
                        <option value="tried">已試</option>
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
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          handleAddDraftTag();
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
                  <div className="mt-5">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {selectedEntry.possible_variety_display ||
                        selectedEntry.fruit_category_display ||
                        "未命名水果"}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {selectedEntry.origin_display || "產地未標註"}
                    </p>
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

                  <div className="mt-4 flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        selectedEntry.status === "tried"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {statusLabel(selectedEntry.status)}
                    </span>
                    {selectedEntry.status === "tried" ? (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                        {renderStars(selectedEntry.rating)}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-4 rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm sm:px-5">
                    {selectedEntry.variety_characteristics ? (
                      <section>
                        <p className="text-xs font-medium tracking-wide text-gray-400">品種特點</p>
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-800">
                          {splitCharacteristics(selectedEntry.variety_characteristics).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {selectedEntry.summary_zh_tw ? (
                      <section>
                        <p className="text-xs font-medium tracking-wide text-gray-400">摘要</p>
                        <p className="mt-1 text-sm leading-6 text-gray-700">{selectedEntry.summary_zh_tw}</p>
                      </section>
                    ) : null}
                    {selectedEntry.notes ? (
                      <section>
                        <p className="text-xs font-medium tracking-wide text-gray-400">備註</p>
                        <p className="mt-1 text-sm leading-6 text-gray-700">{selectedEntry.notes}</p>
                      </section>
                    ) : null}
                    <section>
                      <p className="text-xs font-medium tracking-wide text-gray-400">品飲筆記</p>
                      <p className="mt-1 text-sm leading-6 text-gray-700">
                        {selectedEntry.tasting_note || "尚未記錄品飲心得。"}
                      </p>
                    </section>
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
