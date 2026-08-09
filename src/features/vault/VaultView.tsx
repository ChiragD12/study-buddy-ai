import { Archive, Download, ExternalLink, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { vaultRepository } from "@/data/repositories/vault.repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatBytes, formatDate } from "@/shared/utils/format";
import { VAULT_SUBJECTS, VAULT_SUBJECT_LABELS } from "@/shared/types/domain";
import type { VaultItem, VaultKind, VaultSubject } from "@/shared/types/domain";

interface VaultViewProps {
  title: string;
  description: string;
  kind?: VaultKind;
  favoritesOnly?: boolean;
  /**
   * Show the search + filter UI (subject and content-type filters). Only
   * the main "All Files" Vault page uses this — the dedicated
   * Images/Saved routes keep their existing single-kind/favorites-only
   * view unchanged.
   */
  subjectTabs?: boolean;
}

type SubjectFilter = VaultSubject | "all" | "uncategorized";
type ContentFilter = "all" | "pdf" | "image" | "file" | "note";

/** Content-type filter → underlying Vault kind(s). `null` means no kind filter ("All"). */
const CONTENT_FILTERS: { id: ContentFilter; label: string; kinds: VaultKind[] | null }[] = [
  { id: "all", label: "All", kinds: null },
  { id: "pdf", label: "PDFs", kinds: ["pdf"] },
  { id: "image", label: "Images", kinds: ["image"] },
  { id: "file", label: "Files", kinds: ["other", "note-export"] },
  { id: "note", label: "Notes", kinds: ["text"] },
];

const SUBJECT_FILTERS: { id: SubjectFilter; label: string }[] = [
  { id: "all", label: "All" },
  ...VAULT_SUBJECTS.map((id) => ({ id, label: VAULT_SUBJECT_LABELS[id] })),
  { id: "uncategorized", label: "Uncategorized" },
];

/**
 * Lazily loads the stored Blob for an image Vault item and renders it as a
 * thumbnail. Uses the same vaultRepository.getBlob() path the full-size
 * preview already relies on, so it needs no new Vault architecture — just a
 * per-item object URL with proper cleanup so we don't leak one per item.
 */
function VaultThumbnail({ item }: { item: VaultItem }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (item.kind !== "image") return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    void vaultRepository.getBlob(item.id).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, item.kind]);

  if (item.kind !== "image") return null;

  return (
    <div className="mb-2 aspect-video w-full overflow-hidden rounded-lg bg-surface-sunken">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse" aria-hidden="true" />
      )}
    </div>
  );
}

/** Compact pill-button chip grid, used inside the filter sheet for both the subject and type option sets. */
function FilterOptionGrid<T extends string>({
  options,
  active,
  onSelect,
}: {
  options: { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={active === option.id}
          onClick={() => onSelect(option.id)}
          className={`tap-target rounded-full border px-3 py-1.5 text-sm transition-colors ${
            active === option.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/60 bg-surface text-muted-foreground hover:bg-accent"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function VaultView({
  title,
  description,
  kind,
  favoritesOnly,
  subjectTabs,
}: VaultViewProps) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<SubjectFilter>("all");
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [preview, setPreview] = useState<VaultItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeContentFilter =
    CONTENT_FILTERS.find((filter) => filter.id === contentFilter) ?? CONTENT_FILTERS[0]!;
  // Pass a single kind straight to the repository when the filter maps to
  // exactly one; multi-kind filters (e.g. "Files") are filtered client-side
  // below so the repository's single-`kind` filter doesn't need to change.
  const repoKind: VaultKind | "all" = subjectTabs
    ? activeContentFilter.kinds?.length === 1
      ? activeContentFilter.kinds[0]!
      : "all"
    : (kind ?? "all");

  const items = useRepoQuery(
    () =>
      vaultRepository.list({
        query,
        kind: repoKind,
        ...(favoritesOnly ? { favoritesOnly: true } : {}),
        ...(subjectTabs ? { subject } : {}),
      }),
    [query, repoKind, favoritesOnly, subjectTabs, subject],
  );

  const visibleItems = useMemo(() => {
    if (!items) return items;
    if (!subjectTabs || !activeContentFilter.kinds || activeContentFilter.kinds.length <= 1)
      return items;
    const kinds = activeContentFilter.kinds;
    return items.filter((item) => kinds.includes(item.kind));
  }, [items, subjectTabs, activeContentFilter]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    for (const file of Array.from(fileList)) {
      await vaultRepository.addFile(file);
    }
    toast.success(`Saved ${fileList.length} file(s) to the vault`);
  }

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    let url: string | null = null;
    setPreviewText(null);
    setPreviewUrl(null);

    void vaultRepository.getBlob(preview.id).then(async (blob) => {
      if (!blob) {
        if (!cancelled) toast.error("File data is missing for this item.");
        return;
      }
      url = URL.createObjectURL(blob);
      if (!cancelled) setPreviewUrl(url);
      if (preview.kind === "text") {
        const text = await blob.text();
        if (!cancelled) setPreviewText(text);
      }
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview]);

  function downloadPreview() {
    if (!preview || !previewUrl) return;
    const anchor = document.createElement("a");
    anchor.href = previewUrl;
    anchor.download = preview.name;
    anchor.click();
  }

  const subjectActive = subject !== "all";
  const contentActive = contentFilter !== "all";
  const hasActiveFilters = subjectActive || contentActive;
  const activeFilterCount = (subjectActive ? 1 : 0) + (contentActive ? 1 : 0);
  const subjectLabel = SUBJECT_FILTERS.find((option) => option.id === subject)?.label ?? "All";
  const contentLabel = activeContentFilter.label;

  function clearFilters() {
    setSubject("all");
    setContentFilter("all");
  }

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        action={
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              aria-label="Add files to the vault"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <Button className="tap-target" onClick={() => inputRef.current?.click()}>
              Add files
            </Button>
          </>
        }
      />

      <div className={`flex min-w-0 gap-2 ${subjectTabs && hasActiveFilters ? "mb-3" : "mb-5"}`}>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search files and tags"
          aria-label="Search vault"
          className="min-w-0 flex-1"
        />
        {subjectTabs ? (
          <Button
            type="button"
            variant="secondary"
            className="tap-target relative shrink-0"
            onClick={() => setFilterOpen(true)}
            aria-label="Filter vault items"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 ? (
              <Badge
                variant="default"
                className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
              >
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        ) : null}
      </div>

      {subjectTabs && hasActiveFilters ? (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          {subjectActive ? (
            <button
              type="button"
              onClick={() => setSubject("all")}
              className="tap-target inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              {subjectLabel}
              <X className="size-3" aria-hidden="true" />
            </button>
          ) : null}
          {contentActive ? (
            <button
              type="button"
              onClick={() => setContentFilter("all")}
              className="tap-target inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              {contentLabel}
              <X className="size-3" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={clearFilters}
            className="tap-target text-xs font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {visibleItems === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={<Archive className="size-6" />}
          title="Nothing here yet"
          description="Files you add are stored in this device's local database, never uploaded."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visibleItems.map((item) => (
            <li key={item.id} className="surface-card flex flex-col gap-2 p-4">
              <button type="button" onClick={() => setPreview(item)} className="text-left">
                <VaultThumbnail item={item} />
                <p className="truncate font-medium">{item.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.kind} · {formatBytes(item.sizeBytes)} · {formatDate(item.createdAt)}
                  {item.subject ? ` · ${VAULT_SUBJECT_LABELS[item.subject]}` : ""}
                </p>
              </button>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={item.favorite ? `Unfavorite ${item.name}` : `Favorite ${item.name}`}
                  aria-pressed={item.favorite}
                  onClick={() => void vaultRepository.toggleFavorite(item.id)}
                  className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
                >
                  <Star
                    className={`size-4 ${item.favorite ? "fill-primary text-primary" : "text-muted-foreground"}`}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${item.name}`}
                  onClick={async () => {
                    await vaultRepository.remove(item.id);
                    toast.success("Deleted from vault");
                  }}
                  className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
                >
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {subjectTabs ? (
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-lg"
          >
            <SheetHeader>
              <SheetTitle>Filter files</SheetTitle>
              <SheetDescription>Narrow the vault by subject and file type.</SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex flex-col gap-5">
              <div>
                <p className="mb-2 text-sm font-medium">Subject</p>
                <FilterOptionGrid
                  options={SUBJECT_FILTERS}
                  active={subject}
                  onSelect={setSubject}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Type</p>
                <FilterOptionGrid
                  options={CONTENT_FILTERS}
                  active={contentFilter}
                  onSelect={setContentFilter}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="tap-target flex-1"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                Clear filters
              </Button>
              <Button
                type="button"
                className="tap-target flex-1"
                onClick={() => setFilterOpen(false)}
              >
                Done
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="surface-card flex max-h-[90dvh] w-full max-w-4xl flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{preview.name}</p>
                <p className="text-xs text-muted-foreground">
                  {preview.kind} · {formatBytes(preview.sizeBytes)}
                  {preview.subject ? ` · ${VAULT_SUBJECT_LABELS[preview.subject]}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
                aria-label="Close preview"
                onClick={() => setPreview(null)}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl bg-surface-sunken">
              {preview.kind === "image" && previewUrl ? (
                <img
                  src={previewUrl}
                  alt={preview.name}
                  className="mx-auto max-h-[65dvh] max-w-full object-contain"
                />
              ) : null}
              {preview.kind === "pdf" && previewUrl ? (
                <iframe title={preview.name} src={previewUrl} className="h-[65dvh] w-full" />
              ) : null}
              {preview.kind === "text" ? (
                <pre className="whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">
                  {previewText ?? "Loading…"}
                </pre>
              ) : null}
              {preview.kind === "other" ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Preview is unavailable for this file type. You can open or download it instead.
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="tap-target"
                onClick={downloadPreview}
                disabled={!previewUrl}
              >
                <Download className="size-4" aria-hidden="true" /> Download
              </Button>
              <Button
                variant="secondary"
                className="tap-target"
                onClick={() => previewUrl && window.open(previewUrl, "_blank", "noopener")}
                disabled={!previewUrl}
              >
                <ExternalLink className="size-4" aria-hidden="true" /> Open
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
