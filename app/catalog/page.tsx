"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import packageJson from "../../package.json";
import {
  catalogDB,
  createCatalogEntryFromAnalysis,
  generateDefaultTags,
  getEntryImages,
  normalizeCatalogEntry,
  type CatalogStatus,
  type FruitCatalogEntry,
} from "@/lib/catalogDB";
import { toHongKongTerminology } from "@/lib/hkTerminology";
import {
  KNOWN_COUNTRIES,
  classifyOriginCountry,
  normalizeCatalogCoreFields,
  normalizeCategoryForGrouping,
} from "@/lib/normalizer";

type SortMode = "latest" | "earliest" | "highest" | "lowest";
type QuickAddMode = "single" | "batch";

type QuickAddDraft = {
  entered_name: string;
  analysis_result: Record<string, unknown>;
  images: string[];
  fruit_category_display: string;
  possible_variety_display: string;
  origin_display: string;
  season_months: string;
  summary_zh_tw: string;
  status: CatalogStatus;
  tags: string[];
  rating: number | null;
  tasting_note: string;
  include: boolean;
  error?: string;
};

type CategorySection = {
  category: string;
  items: FruitCatalogEntry[];
  latestActivity: number;
};

type FullEditDraft = {
  fruit_category_display: string;
  possible_variety_display: string;
  origin_display: string;
  season_months: string;
  summary_zh_tw: string;
  images: string[];
};

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
}

function renderStars(rating: number | null): string {
  const count = rating ?? 0;
  return count > 0 ? "★".repeat(count) : "";
}

function getCardTitleClass(title: string): string {
  const length = Array.from(title).length;
  if (length <= 8) return "line-clamp-2 text-[12.5px] leading-4 sm:text-sm";
  if (length <= 18) return "line-clamp-2 text-[11px] leading-4 sm:text-[12px]";
  return "line-clamp-2 text-[10px] leading-3.5 sm:text-[11px]";
}

function handleToggleRating(current: number | null, nextValue: number): number | null {
  return current === nextValue ? null : nextValue;
}

function parseBatchNames(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function mergeTags(base: string[], suggested: string[]): string[] {
  return Array.from(
    new Set([...base, ...suggested.map((tag) => normalizeTag(tag)).filter(Boolean)])
  ).slice(0, 6);
}

function areSameImages(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function pickFruitEmojiSeed(text: string): string {
  const source = toHongKongTerminology(text);
  const mapping: Array<[RegExp, string]> = [
    [/士多啤梨|草莓/i, "🍓"],
    [/甜瓜|香瓜|蜜瓜|哈密瓜/i, "🍈"],
    [/蘋果/i, "🍎"],
    [/提子|葡萄/i, "🍇"],
    [/車厘子|櫻桃/i, "🍒"],
    [/桃|水蜜桃/i, "🍑"],
    [/西柚|葡萄柚/i, "🍊"],
    [/橙|柑|柑橘|柚/i, "🍊"],
    [/香蕉/i, "🍌"],
    [/火龍果/i, "🐉"],
    [/菠蘿|鳳梨/i, "🍍"],
    [/梨/i, "🍐"],
    [/藍莓/i, "🫐"],
    [/西瓜/i, "🍉"],
  ];
  for (const [pattern, emoji] of mapping) {
    if (pattern.test(source)) return emoji;
  }
  return "🍏";
}

function createPlaceholderImageDataUrl(name: string, category: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, "#F8FAFC");
  gradient.addColorStop(1, "#E2E8F0");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const emoji = pickFruitEmojiSeed(`${name} ${category}`.trim());
  ctx.font = "220px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 256, 252);
  return canvas.toDataURL("image/png");
}

function createFallbackPlaceholderDataUrl(): string {
  return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%25' stop-color='%23f8fafc'/><stop offset='100%25' stop-color='%23e2e8f0'/></linearGradient></defs><rect width='100%25' height='100%25' fill='url(%23g)'/><text x='50%25' y='52%25' dominant-baseline='middle' text-anchor='middle' font-size='180'>%F0%9F%8D%8F</text></svg>";
}

function createQuickAddAnalysisResult(input: {
  entered_name: string;
  fruit_category_display: string;
  fruit_category_original: string;
  possible_variety_display: string;
  possible_variety_original: string;
  possible_variety_basis: string;
  variety_characteristics: string;
  origin_display: string;
  season_months: string;
  summary_zh_tw: string;
  notes: string;
  confidence_level: string;
}): Record<string, unknown> {
  const normalizedCore = normalizeCatalogCoreFields({
    fruit_category_display: input.fruit_category_display,
    possible_variety_display: input.possible_variety_display || input.entered_name,
    possible_variety_original: input.possible_variety_original,
    origin_display: input.origin_display,
  });

  return {
    fruit_category_display: normalizedCore.fruit_category_display,
    fruit_category_original: input.fruit_category_original,
    identified_product_name: "",
    identified_product_confidence: "",
    possible_variety_display: normalizedCore.possible_variety_display,
    possible_variety_original: normalizedCore.possible_variety_original,
    possible_variety_basis: input.possible_variety_basis,
    variety_characteristics: input.variety_characteristics,
    origin_display: normalizedCore.origin_display,
    brand_or_farm_display: "",
    grade_display: "",
    season_months: input.season_months,
    summary_zh_tw: input.summary_zh_tw,
    notes: input.notes,
    confidence_level: input.confidence_level,
    detected_text_lines: [],
  };
}

function statusLabel(status: CatalogStatus): string {
  return status === "tried" ? "已試" : "想試";
}

function splitCharacteristics(value: string): string[] {
  return value
    .split(/\r?\n|；|;|、/)
    .map((item) => item.trim().replace(/^[-*•●○▪▫・‧]\s*/, "").replace(/[。]+$/g, ""))
    .filter(Boolean);
}

function makeFullEditDraft(entry: FruitCatalogEntry): FullEditDraft {
  return {
    fruit_category_display: entry.fruit_category_display,
    possible_variety_display: entry.possible_variety_display,
    origin_display: entry.origin_display,
    season_months: entry.season_months,
    summary_zh_tw: entry.summary_zh_tw,
    images: getEntryImages(entry),
  };
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
    const maxSide = 1200;
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

function sortEntriesByMode(entries: FruitCatalogEntry[], sortMode: SortMode): FruitCatalogEntry[] {
  const list = [...entries];
  if (sortMode === "earliest") {
    return list.sort((a, b) => a.created_at - b.created_at);
  }
  if (sortMode === "highest") {
    return list.sort((a, b) => {
      if (a.rating == null && b.rating == null) return b.created_at - a.created_at;
      if (a.rating == null) return 1;
      if (b.rating == null) return -1;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return b.created_at - a.created_at;
    });
  }
  if (sortMode === "lowest") {
    return list.sort((a, b) => {
      if (a.rating == null && b.rating == null) return b.created_at - a.created_at;
      if (a.rating == null) return 1;
      if (b.rating == null) return -1;
      if (a.rating !== b.rating) return a.rating - b.rating;
      return b.created_at - a.created_at;
    });
  }
  return list.sort((a, b) => b.created_at - a.created_at);
}

const version = packageJson.version;

export default function CatalogPage() {
  const pathname = usePathname();
  const catalogMode: CatalogStatus = pathname === "/want" ? "want" : "tried";

  const [entries, setEntries] = useState<FruitCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<FruitCatalogEntry | null>(null);
  const [selectedCountry, setSelectedCountry] = useState("全部");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [quickTagInput, setQuickTagInput] = useState("");
  const [quickReviewInput, setQuickReviewInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<FullEditDraft | null>(null);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<QuickAddMode>("single");
  const [quickAddInput, setQuickAddInput] = useState("");
  const [quickAddSingleDraft, setQuickAddSingleDraft] = useState<QuickAddDraft | null>(null);
  const [quickAddSingleTagInput, setQuickAddSingleTagInput] = useState("");
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const [quickAddBatchInput, setQuickAddBatchInput] = useState("");
  const [quickAddBatchRows, setQuickAddBatchRows] = useState<QuickAddDraft[]>([]);
  const [quickAddBatchProgress, setQuickAddBatchProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [isSavingQuickAdd, setIsSavingQuickAdd] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
    setSelectedCountry("全部");
    setSortMode("latest");
  }, [catalogMode]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const isAnyOverlayOpen = Boolean(selectedEntry) || isQuickAddModalOpen;

  useEffect(() => {
    if (!isAnyOverlayOpen) return;
    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const prev = {
      bodyPosition: bodyStyle.position,
      bodyTop: bodyStyle.top,
      bodyWidth: bodyStyle.width,
      bodyOverflow: bodyStyle.overflow,
      htmlOverflow: htmlStyle.overflow,
    };

    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    htmlStyle.overflow = "hidden";

    return () => {
      bodyStyle.position = prev.bodyPosition;
      bodyStyle.top = prev.bodyTop;
      bodyStyle.width = prev.bodyWidth;
      bodyStyle.overflow = prev.bodyOverflow;
      htmlStyle.overflow = prev.htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isAnyOverlayOpen]);

  const modeEntries = useMemo(
    () => entries.filter((entry) => entry.status === catalogMode),
    [entries, catalogMode]
  );

  const summary = useMemo(() => {
    const wantCount = entries.filter((entry) => entry.status === "want").length;
    const triedCount = entries.filter((entry) => entry.status === "tried").length;
    return {
      total: entries.length,
      want: wantCount,
      tried: triedCount,
    };
  }, [entries]);

  const availableCountries = useMemo(() => {
    const present = new Set<string>();
    for (const entry of modeEntries) {
      const country = classifyOriginCountry(entry.origin_display);
      if (country !== "其他") present.add(country);
    }
    const ordered = KNOWN_COUNTRIES.filter((country) => present.has(country));
    return ["全部", ...ordered, "其他"];
  }, [modeEntries]);

  const countryFilteredEntries = useMemo(
    () =>
      modeEntries.filter((entry) => {
        if (selectedCountry === "全部") return true;
        return classifyOriginCountry(entry.origin_display) === selectedCountry;
      }),
    [modeEntries, selectedCountry]
  );

  useEffect(() => {
    if (selectedCountry === "全部") return;
    if (!availableCountries.includes(selectedCountry)) {
      setSelectedCountry("全部");
    }
  }, [availableCountries, selectedCountry]);

  const groupedSections = useMemo(() => {
    const groups = new Map<string, FruitCatalogEntry[]>();
    for (const entry of countryFilteredEntries) {
      const category = normalizeCategoryForGrouping(entry.fruit_category_display);
      const bucket = groups.get(category);
      if (bucket) {
        bucket.push(entry);
      } else {
        groups.set(category, [entry]);
      }
    }

    const sections: CategorySection[] = [];
    for (const [category, items] of groups.entries()) {
      const latestActivity = items.reduce(
        (max, item) => Math.max(max, item.updated_at || 0, item.created_at || 0),
        0
      );
      sections.push({
        category,
        items: sortEntriesByMode(items, sortMode),
        latestActivity,
      });
    }

    sections.sort((a, b) => {
      if (b.latestActivity !== a.latestActivity) return b.latestActivity - a.latestActivity;
      return a.category.localeCompare(b.category, "zh-Hant");
    });
    return sections;
  }, [countryFilteredEntries, sortMode]);

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
    const normalizedCore = normalizeCatalogCoreFields({
      fruit_category_display: partial.fruit_category_display ?? entry.fruit_category_display,
      possible_variety_display: partial.possible_variety_display ?? entry.possible_variety_display,
      possible_variety_original: partial.possible_variety_original ?? entry.possible_variety_original,
      origin_display: partial.origin_display ?? entry.origin_display,
    });
    const payload: Partial<FruitCatalogEntry> = {
      ...partial,
      fruit_category_display: normalizedCore.fruit_category_display,
      possible_variety_display: normalizedCore.possible_variety_display,
      possible_variety_original: normalizedCore.possible_variety_original,
      origin_display: normalizedCore.origin_display,
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
  };

  const handleSaveFullEdit = async () => {
    if (!selectedEntry || !draft || typeof selectedEntry.id !== "number") return;
    const currentImages = getEntryImages(selectedEntry);
    const nextImages = draft.images.slice(0, 3);

    const changed =
      selectedEntry.fruit_category_display !== draft.fruit_category_display ||
      selectedEntry.possible_variety_display !== draft.possible_variety_display ||
      selectedEntry.origin_display !== draft.origin_display ||
      selectedEntry.season_months !== draft.season_months ||
      selectedEntry.summary_zh_tw !== draft.summary_zh_tw ||
      !areSameImages(currentImages, nextImages);

    await applyPartialUpdate(
      selectedEntry,
      {
        fruit_category_display: draft.fruit_category_display,
        possible_variety_display: draft.possible_variety_display,
        origin_display: draft.origin_display,
        season_months: draft.season_months,
        summary_zh_tw: draft.summary_zh_tw,
        images: nextImages,
        image_data: nextImages[0] ?? "",
      },
      changed
    );
    resetEditArtifacts();
  };

  const handleDownloadImage = (entry: FruitCatalogEntry) => {
    const cover = getEntryImages(entry)[0];
    if (!cover) return;
    const link = document.createElement("a");
    link.href = cover;
    link.download = `fruit-catalog-${entry.id ?? Date.now()}.${detectImageExt(cover)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const resetQuickAddState = () => {
    setQuickAddInput("");
    setQuickAddSingleDraft(null);
    setQuickAddSingleTagInput("");
    setQuickAddBatchInput("");
    setQuickAddBatchRows([]);
    setQuickAddBatchProgress(null);
    setQuickAddError(null);
    setIsGeneratingSingle(false);
    setIsGeneratingBatch(false);
    setIsSavingQuickAdd(false);
  };

  const openQuickAddModal = () => {
    setQuickAddMode("single");
    setIsQuickAddModalOpen(true);
    resetQuickAddState();
  };

  const closeQuickAddModal = () => {
    setIsQuickAddModalOpen(false);
    resetQuickAddState();
  };

  const createQuickAddDraftFromResponse = (
    enteredName: string,
    response: Record<string, unknown>
  ): QuickAddDraft => {
    const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const strArr = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

    const normalizedCore = normalizeCatalogCoreFields({
      fruit_category_display: str(response.fruit_category_display),
      possible_variety_display: str(response.possible_variety_display) || enteredName,
      possible_variety_original: str(response.possible_variety_original),
      origin_display: str(response.origin_display),
    });
    const fruitCategory = normalizedCore.fruit_category_display;
    const possibleVariety = normalizedCore.possible_variety_display || enteredName;
    const originDisplay = normalizedCore.origin_display;
    const seasonMonths = str(response.season_months);
    const summary = str(response.summary_zh_tw);
    const analysisResult = createQuickAddAnalysisResult({
      entered_name: enteredName,
      fruit_category_display: fruitCategory,
      fruit_category_original: str(response.fruit_category_original),
      possible_variety_display: possibleVariety,
      possible_variety_original: normalizedCore.possible_variety_original,
      possible_variety_basis: str(response.possible_variety_basis),
      variety_characteristics: str(response.variety_characteristics),
      origin_display: originDisplay,
      season_months: seasonMonths,
      summary_zh_tw: summary,
      notes: str(response.notes),
      confidence_level: str(response.confidence_level),
    });
    const tags = mergeTags(
      generateDefaultTags({
        fruit_category_display: fruitCategory,
        origin_display: originDisplay,
      }),
      strArr(response.suggested_tags)
    );

    const placeholder = createPlaceholderImageDataUrl(possibleVariety || enteredName, fruitCategory);

    return {
      entered_name: enteredName,
      analysis_result: analysisResult,
      images: [placeholder || createFallbackPlaceholderDataUrl()],
      fruit_category_display: fruitCategory,
      possible_variety_display: possibleVariety,
      origin_display: originDisplay,
      season_months: seasonMonths,
      summary_zh_tw: summary,
      status: catalogMode,
      tags,
      rating: null,
      tasting_note: "",
      include: true,
    };
  };

  const requestQuickAdd = async (name: string): Promise<Record<string, unknown>> => {
    const response = await fetch("/api/quick-add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : "AI 產生草稿失敗");
    }
    return payload;
  };

  const saveQuickAddDraft = async (draftValue: QuickAddDraft) => {
    const normalizedCore = normalizeCatalogCoreFields({
      fruit_category_display: draftValue.fruit_category_display,
      possible_variety_display: draftValue.possible_variety_display,
      possible_variety_original: draftValue.analysis_result.possible_variety_original,
      origin_display: draftValue.origin_display,
    });
    const finalAnalysis = {
      ...draftValue.analysis_result,
      fruit_category_display: normalizedCore.fruit_category_display,
      possible_variety_display: normalizedCore.possible_variety_display,
      possible_variety_original: normalizedCore.possible_variety_original,
      origin_display: normalizedCore.origin_display,
      season_months: draftValue.season_months,
      summary_zh_tw: draftValue.summary_zh_tw,
    };
    const entryInput = createCatalogEntryFromAnalysis({
      images: draftValue.images,
      analysis_result: finalAnalysis,
      app_version: version,
      overrides: {
        status: draftValue.status,
        possible_variety_display: normalizedCore.possible_variety_display,
        origin_display: normalizedCore.origin_display,
        tags: draftValue.tags,
        rating: draftValue.status === "tried" ? draftValue.rating : null,
        tasting_note: draftValue.tasting_note,
      },
      is_edited: false,
    });
    const id = await catalogDB.entries.add(entryInput);
    const normalized = normalizeCatalogEntry({
      ...entryInput,
      id,
    } as Record<string, unknown>);
    setEntries((prev) => [normalized, ...prev]);
  };

  const handleGenerateSingleQuickAdd = async () => {
    const name = quickAddInput.trim();
    if (!name) {
      setQuickAddError("請先輸入水果名稱");
      return;
    }
    setQuickAddError(null);
    setIsGeneratingSingle(true);
    try {
      const response = await requestQuickAdd(name);
      setQuickAddSingleDraft(createQuickAddDraftFromResponse(name, response));
      setQuickAddSingleTagInput("");
    } catch (error) {
      setQuickAddError(error instanceof Error ? error.message : "產生草稿失敗");
      setQuickAddSingleDraft(null);
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  const handleSaveSingleQuickAdd = async () => {
    if (!quickAddSingleDraft) return;
    setIsSavingQuickAdd(true);
    try {
      await saveQuickAddDraft(quickAddSingleDraft);
      setToastMessage("已加入圖鑑");
      closeQuickAddModal();
    } catch {
      setQuickAddError("儲存失敗，請稍後再試");
    } finally {
      setIsSavingQuickAdd(false);
    }
  };

  const handleGenerateBatchQuickAdd = async () => {
    const names = parseBatchNames(quickAddBatchInput);
    if (names.length === 0) {
      setQuickAddError("請至少輸入 1 個名稱");
      return;
    }
    if (names.length > 5) {
      setQuickAddError("每次批次最多 5 筆");
      return;
    }
    setQuickAddError(null);
    setQuickAddBatchRows([]);
    setIsGeneratingBatch(true);
    setQuickAddBatchProgress({ current: 0, total: names.length });

    const nextRows: QuickAddDraft[] = [];
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      setQuickAddBatchProgress({ current: i + 1, total: names.length });
      try {
        const response = await requestQuickAdd(name);
        nextRows.push(createQuickAddDraftFromResponse(name, response));
      } catch (error) {
        nextRows.push({
          entered_name: name,
          analysis_result: {},
          images: [createPlaceholderImageDataUrl(name, "") || createFallbackPlaceholderDataUrl()],
          fruit_category_display: "",
          possible_variety_display: name,
          origin_display: "",
          season_months: "",
          summary_zh_tw: "",
          status: catalogMode,
          tags: [],
          rating: null,
          tasting_note: "",
          include: false,
          error: error instanceof Error ? error.message : "AI 產生失敗",
        });
      }
      setQuickAddBatchRows([...nextRows]);
    }
    setIsGeneratingBatch(false);
    setQuickAddBatchProgress(null);
  };

  const handleSaveBatchQuickAdd = async () => {
    const validRows = quickAddBatchRows.filter((row) => row.include && !row.error);
    if (validRows.length === 0) {
      setQuickAddError("沒有可儲存的項目");
      return;
    }
    setIsSavingQuickAdd(true);
    let successCount = 0;
    for (const row of validRows) {
      try {
        await saveQuickAddDraft(row);
        successCount += 1;
      } catch {
        // batch save should continue for other rows
      }
    }
    setIsSavingQuickAdd(false);
    if (successCount > 0) {
      setToastMessage(`已加入 ${successCount} 項`);
      closeQuickAddModal();
    } else {
      setQuickAddError("批次儲存失敗，請稍後再試");
    }
  };

  return (
    <>
      <main className="min-h-[100dvh] overflow-x-clip bg-gray-100 px-3 pb-[calc(env(safe-area-inset-bottom)+3rem)] pt-32 text-black sm:px-5 sm:pt-36">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-sm font-medium text-gray-700">已收錄 {countryFilteredEntries.length} 項</p>
            <p className="mt-0.5 text-xs text-gray-500">
              全部 {summary.total} ・ 想試 {summary.want} ・ 圖鑑 {summary.tried}
            </p>
          </div>

          {!isLoading ? (
            <section className="mb-3 rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openQuickAddModal}
                  className="min-h-10 shrink-0 rounded-lg bg-black px-3 text-xs font-medium text-white transition hover:opacity-90 sm:text-sm"
                >
                  {catalogMode === "want" ? "快速加入想試" : "快速加入圖鑑"}
                </button>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  disabled={modeEntries.length === 0}
                  className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="latest">最新加入</option>
                  <option value="earliest">最早加入</option>
                  {catalogMode === "tried" ? <option value="highest">最高評分</option> : null}
                  {catalogMode === "tried" ? <option value="lowest">最低評分</option> : null}
                </select>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[3rem_1fr] sm:items-center">
                <p className="text-xs text-gray-500">地區</p>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
                >
                  {availableCountries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          ) : null}

          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              正在載入圖鑑⋯⋯
            </div>
          ) : modeEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              {catalogMode === "want" ? "暫時未有想試水果" : "暫時未有已試水果"}
            </div>
          ) : groupedSections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
              <p>沒有符合條件的水果</p>
              <button
                type="button"
                onClick={() => setSelectedCountry("全部")}
                className="mt-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
              >
                重設為全部
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedSections.map((section) => (
                <section key={section.category}>
                  <h3 className="mb-2.5 flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-gray-800">
                      {toHongKongTerminology(section.category)}
                    </span>
                    <span className="text-xs font-medium text-gray-400">({section.items.length})</span>
                  </h3>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4">
                    {section.items.map((entry) => {
                      const title =
                        entry.possible_variety_display || entry.fruit_category_display || "未命名水果";
                      const localizedTitle = toHongKongTerminology(title);
                      const coverImage = getEntryImages(entry)[0] || createFallbackPlaceholderDataUrl();
                      return (
                        <article
                          key={entry.id}
                          className="overflow-hidden rounded-sm border border-gray-200 bg-white shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(entry)}
                            className="block w-full text-center"
                          >
                            <div className="aspect-square w-full bg-gray-100">
                              <img
                                src={coverImage}
                                alt={`${title}收藏圖鑑圖片`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="flex h-16 flex-col justify-between px-1.5 py-1.5">
                              <p
                                className={`break-words text-center font-semibold text-gray-900 ${getCardTitleClass(localizedTitle)}`}
                                title={localizedTitle}
                              >
                                {localizedTitle}
                              </p>
                              <p className="h-5 text-center text-[15px] font-bold leading-5 tracking-[-0.08em] text-amber-500">
                                {entry.rating ? renderStars(entry.rating) : ""}
                              </p>
                            </div>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      {isQuickAddModalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/45 px-3 py-5 sm:px-6">
          <div className="mx-auto max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {catalogMode === "want" ? "快速加入想試" : "快速加入圖鑑"}
                </h3>
                <p className="mt-1 text-xs text-gray-500">可直接輸入名稱建卡，免上傳圖片。</p>
              </div>
              <button
                type="button"
                onClick={closeQuickAddModal}
                className="min-h-10 rounded-full px-3 text-sm text-gray-500 hover:bg-gray-100"
              >
                關閉
              </button>
            </div>

            <div className="mt-3 rounded-full bg-gray-100 p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setQuickAddMode("single");
                    setQuickAddError(null);
                  }}
                  className={`min-h-10 rounded-full text-sm transition ${
                    quickAddMode === "single"
                      ? "bg-black text-white"
                      : "text-gray-600 hover:bg-white hover:text-gray-900"
                  }`}
                >
                  單筆加入
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickAddMode("batch");
                    setQuickAddError(null);
                  }}
                  className={`min-h-10 rounded-full text-sm transition ${
                    quickAddMode === "batch"
                      ? "bg-black text-white"
                      : "text-gray-600 hover:bg-white hover:text-gray-900"
                  }`}
                >
                  批次加入
                </button>
              </div>
            </div>

            {quickAddError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {quickAddError}
              </div>
            ) : null}

            {quickAddMode === "single" ? (
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    value={quickAddInput}
                    onChange={(e) => setQuickAddInput(e.target.value)}
                    placeholder="輸入水果或品種名稱（例如：淡雪）"
                    className="min-h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm"
                  />
                  <button
                    type="button"
                    disabled={isGeneratingSingle}
                    onClick={() => void handleGenerateSingleQuickAdd()}
                    className="min-h-10 rounded-lg bg-black px-4 text-sm text-white disabled:bg-gray-300"
                  >
                    {isGeneratingSingle ? "生成中…" : "產生草稿"}
                  </button>
                </div>

                {quickAddSingleDraft ? (
                  <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-start gap-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
                        <img
                          src={quickAddSingleDraft.images[0] || createFallbackPlaceholderDataUrl()}
                          alt="快速建卡預覽"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="space-y-1 text-xs text-gray-600">
                        <p>輸入名稱：{toHongKongTerminology(quickAddSingleDraft.entered_name)}</p>
                        <p>
                          類別：
                          {toHongKongTerminology(quickAddSingleDraft.fruit_category_display || "未確定")}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-full bg-white p-1">
                      <div className="grid grid-cols-2 gap-1">
                        {(["want", "tried"] as CatalogStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() =>
                              setQuickAddSingleDraft({
                                ...quickAddSingleDraft,
                                status,
                                rating: status === "want" ? null : quickAddSingleDraft.rating,
                              })
                            }
                            className={`min-h-10 rounded-full text-sm transition ${
                              quickAddSingleDraft.status === status
                                ? "bg-black text-white"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {statusLabel(status)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="block space-y-1">
                      <span className="text-xs text-gray-500">推定品種</span>
                      <input
                        value={quickAddSingleDraft.possible_variety_display}
                        onChange={(e) =>
                          setQuickAddSingleDraft({
                            ...quickAddSingleDraft,
                            possible_variety_display: e.target.value,
                          })
                        }
                        className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-gray-500">產地</span>
                      <input
                        value={quickAddSingleDraft.origin_display}
                        onChange={(e) =>
                          setQuickAddSingleDraft({ ...quickAddSingleDraft, origin_display: e.target.value })
                        }
                        className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-gray-500">產季</span>
                      <input
                        value={quickAddSingleDraft.season_months}
                        onChange={(e) =>
                          setQuickAddSingleDraft({ ...quickAddSingleDraft, season_months: e.target.value })
                        }
                        className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-gray-500">摘要</span>
                      <textarea
                        value={quickAddSingleDraft.summary_zh_tw}
                        onChange={(e) =>
                          setQuickAddSingleDraft({ ...quickAddSingleDraft, summary_zh_tw: e.target.value })
                        }
                        rows={3}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    {quickAddSingleDraft.status === "tried" ? (
                      <div>
                        <p className="text-xs text-gray-500">評分</p>
                        <div className="mt-1 flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                setQuickAddSingleDraft({
                                  ...quickAddSingleDraft,
                                  rating: handleToggleRating(quickAddSingleDraft.rating, value),
                                })
                              }
                              className={`text-xl ${
                                (quickAddSingleDraft.rating ?? 0) >= value
                                  ? "text-amber-500"
                                  : "text-gray-300 hover:text-amber-400"
                              }`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <label className="block space-y-1">
                      <span className="text-xs text-gray-500">用戶評價</span>
                      <textarea
                        value={quickAddSingleDraft.tasting_note}
                        onChange={(e) =>
                          setQuickAddSingleDraft({ ...quickAddSingleDraft, tasting_note: e.target.value })
                        }
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>

                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">分類標籤</p>
                      {quickAddSingleDraft.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {quickAddSingleDraft.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                setQuickAddSingleDraft({
                                  ...quickAddSingleDraft,
                                  tags: quickAddSingleDraft.tags.filter((item) => item !== tag),
                                })
                              }
                              className="min-h-8 rounded-full bg-white px-2.5 text-xs text-gray-600"
                            >
                              {toHongKongTerminology(tag)} ×
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">尚未設定標籤</p>
                      )}
                      <div className="flex gap-2">
                        <input
                          value={quickAddSingleTagInput}
                          onChange={(e) => setQuickAddSingleTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const normalized = normalizeTag(quickAddSingleTagInput);
                            if (!normalized || quickAddSingleDraft.tags.includes(normalized)) return;
                            setQuickAddSingleDraft({
                              ...quickAddSingleDraft,
                              tags: [...quickAddSingleDraft.tags, normalized],
                            });
                            setQuickAddSingleTagInput("");
                          }}
                          placeholder="新增標籤"
                          className="min-h-9 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const normalized = normalizeTag(quickAddSingleTagInput);
                            if (!normalized || quickAddSingleDraft.tags.includes(normalized)) return;
                            setQuickAddSingleDraft({
                              ...quickAddSingleDraft,
                              tags: [...quickAddSingleDraft.tags, normalized],
                            });
                            setQuickAddSingleTagInput("");
                          }}
                          className="min-h-9 rounded-lg bg-black px-3 text-xs text-white"
                        >
                          加入
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeQuickAddModal}
                    className="min-h-10 rounded-lg px-3 text-sm text-gray-500 hover:bg-gray-100"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!quickAddSingleDraft || isSavingQuickAdd}
                    onClick={() => void handleSaveSingleQuickAdd()}
                    className="min-h-10 rounded-full bg-black px-4 text-sm text-white disabled:bg-gray-300"
                  >
                    {isSavingQuickAdd ? "加入中…" : "確認加入"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs text-gray-500">每行一個水果名稱（最多 5 項）</span>
                  <textarea
                    value={quickAddBatchInput}
                    onChange={(e) => setQuickAddBatchInput(e.target.value)}
                    rows={5}
                    placeholder={"甘林\n淡雪\n古都華"}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isGeneratingBatch}
                    onClick={() => void handleGenerateBatchQuickAdd()}
                    className="min-h-10 rounded-lg bg-black px-4 text-sm text-white disabled:bg-gray-300"
                  >
                    {isGeneratingBatch ? "生成中…" : "開始批次生成"}
                  </button>
                  {quickAddBatchProgress ? (
                    <p className="text-xs text-gray-500">
                      處理中 {quickAddBatchProgress.current}/{quickAddBatchProgress.total}
                    </p>
                  ) : null}
                </div>

                {quickAddBatchRows.length > 0 ? (
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
                    {quickAddBatchRows.map((row, index) => (
                      <div
                        key={`${row.entered_name}-${index}`}
                        className={`rounded-lg border px-2.5 py-2 text-xs ${
                          row.error ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={row.include}
                              disabled={!!row.error}
                              onChange={(e) =>
                                setQuickAddBatchRows((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, include: e.target.checked } : item
                                  )
                                )
                              }
                            />
                            <span className="font-medium text-gray-900">
                              {toHongKongTerminology(row.entered_name)}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setQuickAddBatchRows((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                            }
                            className="text-gray-400 hover:text-gray-600"
                          >
                            移除
                          </button>
                        </div>
                        {row.error ? (
                          <p className="mt-1 text-red-600">{row.error}</p>
                        ) : (
                          <div className="mt-1 space-y-0.5 text-gray-600">
                            <p>品種：{toHongKongTerminology(row.possible_variety_display || "-")}</p>
                            <p>類別：{toHongKongTerminology(row.fruit_category_display || "-")}</p>
                            <p>產地：{toHongKongTerminology(row.origin_display || "-")}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeQuickAddModal}
                    className="min-h-10 rounded-lg px-3 text-sm text-gray-500 hover:bg-gray-100"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={isSavingQuickAdd || quickAddBatchRows.length === 0}
                    onClick={() => void handleSaveBatchQuickAdd()}
                    className="min-h-10 rounded-full bg-black px-4 text-sm text-white disabled:bg-gray-300"
                  >
                    {isSavingQuickAdd ? "加入中…" : "確認加入"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {selectedEntry ? (
        <div className="fixed inset-0 z-40 bg-black/45">
          <div className="mx-auto h-[100dvh] w-full max-w-2xl overflow-hidden bg-white">
            <div className="sticky top-0 z-20 flex justify-end gap-2 border-b border-gray-100 bg-white/95 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.25rem)] backdrop-blur">
              <button
                type="button"
                aria-label="下載圖片"
                onClick={() => handleDownloadImage(selectedEntry)}
                className="min-h-10 min-w-10 rounded-full border border-gray-300 text-lg text-gray-700 transition hover:bg-gray-50"
              >
                ⬇️
              </button>
              {!isEditing ? (
                <button
                  type="button"
                  aria-label="編輯"
                  onClick={handleStartEdit}
                  className="min-h-10 min-w-10 rounded-full border border-gray-300 text-lg text-gray-700 transition hover:bg-gray-50"
                >
                  ✏️
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="儲存"
                  onClick={() => void handleSaveFullEdit()}
                  className="min-h-10 min-w-10 rounded-full bg-black text-lg text-white transition hover:opacity-90"
                >
                  💾
                </button>
              )}
              <button
                type="button"
                aria-label="刪除"
                onClick={() => void handleDeleteEntry(selectedEntry)}
                className="min-h-10 min-w-10 rounded-full border border-red-200 text-lg text-red-600 transition hover:bg-red-50"
              >
                🗑️
              </button>
              <button
                type="button"
                aria-label="關閉"
                onClick={() => {
                  setSelectedEntry(null);
                  resetEditArtifacts();
                  setQuickTagInput("");
                  setQuickReviewInput("");
                }}
                className="min-h-10 min-w-10 rounded-full border border-gray-300 text-lg text-gray-700 transition hover:bg-gray-50"
              >
                ✕
              </button>
            </div>

            <div className="h-[calc(100dvh-4.5rem-env(safe-area-inset-top))] overflow-y-auto overscroll-contain p-4 [-webkit-overflow-scrolling:touch] sm:p-5">
              {!isEditing ? (
                <div className="flex gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
                  {(getEntryImages(selectedEntry).length > 0
                    ? getEntryImages(selectedEntry)
                    : [createFallbackPlaceholderDataUrl()]
                  ).map((image, index) => (
                    <img
                      key={`${image.slice(0, 20)}-${index}`}
                      src={image}
                      alt={`水果圖鑑詳情圖片 ${index + 1}`}
                      className="h-56 w-56 shrink-0 rounded-lg object-cover"
                    />
                  ))}
                </div>
              ) : null}

              {isEditing && draft ? (
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div>
                    <p className="text-sm text-gray-500">圖片</p>
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {draft.images.map((image, index) => (
                        <div key={`${image.slice(0, 20)}-${index}`} className="w-28 shrink-0 space-y-1">
                          <img src={image} alt={`編輯圖片 ${index + 1}`} className="h-28 w-28 rounded-md object-cover" />
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (index === 0) return;
                                const next = [...draft.images];
                                const [picked] = next.splice(index, 1);
                                next.unshift(picked);
                                setDraft({ ...draft, images: next });
                              }}
                              disabled={index === 0}
                              className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              {index === 0 ? "目前封面" : "設為封面"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  images: draft.images.filter((_, itemIndex) => itemIndex !== index),
                                })
                              }
                              className="w-full rounded border border-red-200 px-2 py-1 text-[11px] text-red-600"
                            >
                              刪除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {draft.images.length < 3 ? (
                      <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center rounded-full border border-gray-300 px-4 text-sm text-gray-700 transition hover:bg-gray-50">
                        新增圖片（{draft.images.length}/3）
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/webp,image/*"
                          multiple
                          className="hidden"
                          onChange={async (e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.currentTarget.value = "";
                            if (files.length === 0) return;
                            const slots = Math.max(0, 3 - draft.images.length);
                            if (slots === 0) return;
                            const nextImages = [...draft.images];
                            for (const file of files.slice(0, slots)) {
                              try {
                                const compressed = await createThumbnailDataUrl(file);
                                nextImages.push(compressed);
                              } catch {
                                // ignore failed file and continue
                              }
                            }
                            setDraft({ ...draft, images: nextImages.slice(0, 3) });
                          }}
                        />
                      </label>
                    ) : null}
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
                  <div className="mt-4">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {toHongKongTerminology(
                        selectedEntry.possible_variety_display ||
                          selectedEntry.fruit_category_display ||
                          "未命名水果"
                      )}
                    </h3>
                    {selectedEntry.possible_variety_original &&
                    !selectedEntry.possible_variety_display.includes(selectedEntry.possible_variety_original) ? (
                      <p className="mt-1 text-xs text-gray-500">{selectedEntry.possible_variety_original}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-gray-500">
                      {toHongKongTerminology(selectedEntry.origin_display || "產地未標註")}
                    </p>
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

                  <div className="mt-4 space-y-4 rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm">
                    {selectedEntry.rating ? (
                      <section>
                        <p className="text-xs font-medium tracking-wide text-gray-400">評分</p>
                        <p className="mt-1 text-base font-semibold tracking-[-0.08em] text-amber-500">
                          {renderStars(selectedEntry.rating)}
                        </p>
                      </section>
                    ) : null}
                    {selectedEntry.tasting_note ? (
                      <section>
                        <p className="text-xs font-medium tracking-wide text-gray-400">用戶評價</p>
                        <p className="mt-1 text-sm leading-6 text-gray-700">
                          {toHongKongTerminology(selectedEntry.tasting_note)}
                        </p>
                      </section>
                    ) : null}
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
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-black px-4 py-2 text-xs text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </>
  );
}
