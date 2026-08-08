import { Archive, Download, ExternalLink, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { vaultRepository } from "@/data/repositories/vault.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatBytes, formatDate } from "@/shared/utils/format";
import type { VaultItem, VaultKind } from "@/shared/types/domain";

interface VaultViewProps {
  title: string;
  description: string;
  kind?: VaultKind;
  favoritesOnly?: boolean;
}

export function VaultView({ title, description, kind, favoritesOnly }: VaultViewProps) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<VaultItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useRepoQuery(
    () =>
      vaultRepository.list({
        query,
        kind: kind ?? "all",
        ...(favoritesOnly ? { favoritesOnly: true } : {}),
      }),
    [query, kind, favoritesOnly],
  );

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

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search files and tags"
        aria-label="Search vault"
        className="mb-5"
      />

      {items === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Archive className="size-6" />}
          title="Nothing here yet"
          description="Files you add are stored in this device's local database, never uploaded."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="surface-card flex flex-col gap-2 p-4">
              <button type="button" onClick={() => setPreview(item)} className="text-left">
                <p className="truncate font-medium">{item.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.kind} · {formatBytes(item.sizeBytes)} · {formatDate(item.createdAt)}
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

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="surface-card flex max-h-[90dvh] w-full max-w-4xl flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{preview.name}</p>
                <p className="text-xs text-muted-foreground">
                  {preview.kind} · {formatBytes(preview.sizeBytes)}
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
