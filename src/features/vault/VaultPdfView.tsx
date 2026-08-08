import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { vaultRepository } from "@/data/repositories/vault.repository";
import { vaultPdfDocRepository } from "@/data/repositories/vaultPdfDoc.repository";
import { generatePdfEdit } from "@/features/vault/pdfEditAssistant";
import { renderPdfDoc, titleFromFileName, type PdfDocSpec } from "@/features/vault/pdfDoc";
import { extractPdfDoc } from "@/features/vault/pdfExtract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatBytes, formatDate } from "@/shared/utils/format";
import type { VaultItem } from "@/shared/types/domain";

type GenerateStatus = "idle" | "generating" | "done" | "error";

/**
 * Loads the editable representation for the selected Vault PDF.
 *
 * If our own vaultPdfDocs record already exists (created by this app, or by
 * an earlier edit of this same item), that's the authoritative source — we
 * never re-parse a PDF we generated ourselves. Otherwise, for a pre-existing
 * uploaded PDF, this reads the PDF's REAL text via pdf.js (see
 * pdfExtract.ts) and caches the result so it isn't re-parsed on every edit.
 * If the PDF has no extractable text (e.g. it's scanned/image-only), this
 * throws PdfNotExtractableError instead of fabricating placeholder content.
 */
async function loadOrExtractSpec(item: VaultItem): Promise<PdfDocSpec> {
  const existing = await vaultPdfDocRepository.get(item.id);
  if (existing) return { title: existing.title, sections: existing.sections };

  const blob = await vaultRepository.getBlob(item.id);
  if (!blob) throw new Error("File data is missing for this item.");
  const extracted = await extractPdfDoc(blob, titleFromFileName(item.name));
  // Cache the extraction immediately so a retry (or the very first
  // successful edit) doesn't need to re-parse the original PDF.
  await vaultPdfDocRepository.put(item.id, extracted.title, extracted.sections);
  return extracted;
}

export function VaultPdfView({ title, description }: { title: string; description: string }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const items = useRepoQuery(() => vaultRepository.list({ query, kind: "pdf" }), [query]);
  const selected = items?.find((item) => item.id === selectedId) ?? null;

  // Refresh the inline preview whenever the selection changes or the file
  // itself changes (e.g. after a successful edit bumps updatedAt).
  useEffect(() => {
    if (!selected) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    void vaultRepository.getBlob(selected.id).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the
    // selected item's identity/version, not the whole live-query array.
  }, [selected?.id, selected?.updatedAt]);

  function selectItem(item: VaultItem) {
    setSelectedId(item.id === selectedId ? null : item.id);
    setEditing(false);
    setInstruction("");
    setStatus("idle");
    setStatusMessage("");
  }

  function stopEditing() {
    setEditing(false);
    setStatus("idle");
    setStatusMessage("");
  }

  async function openSelected() {
    if (!selected) return;
    const blob = await vaultRepository.getBlob(selected.id);
    if (!blob) {
      toast.error("File data is missing for this item.");
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function downloadSelected() {
    if (!selected) return;
    const blob = await vaultRepository.getBlob(selected.id);
    if (!blob) {
      toast.error("File data is missing for this item.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = selected.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function generateChanges() {
    if (!selected) return;
    if (!instruction.trim()) {
      toast.error("Enter an instruction first.");
      return;
    }
    setStatus("generating");
    setStatusMessage("");
    try {
      const current = await loadOrExtractSpec(selected);
      const result = await generatePdfEdit(current, instruction);
      if (!result.ok || !result.spec) {
        setStatus("error");
        setStatusMessage(result.message);
        return;
      }
      const blob = await renderPdfDoc(result.spec);
      await vaultRepository.replaceBlob(selected.id, blob, { mimeType: "application/pdf" });
      await vaultPdfDocRepository.put(selected.id, result.spec.title, result.spec.sections);
      setStatus("done");
      setStatusMessage(result.message);
      setInstruction("");
    } catch (error) {
      setStatus("error");
      // PdfNotExtractableError extends Error, so its message is surfaced
      // the same way — the point is it's a clear, specific explanation
      // rather than the PDF being silently replaced.
      setStatusMessage(error instanceof Error ? error.message : "Unable to generate changes.");
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    for (const file of Array.from(fileList)) {
      await vaultRepository.addFile(file);
    }
    toast.success(`Saved ${fileList.length} file(s) to the vault`);
  }

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        action={
          <>
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="sr-only"
              id="vault-pdfs-add-file"
              aria-label="Add PDFs to the vault"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <Button
              className="tap-target"
              onClick={() => document.getElementById("vault-pdfs-add-file")?.click()}
            >
              Add files
            </Button>
          </>
        }
      />

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search PDFs"
        aria-label="Search PDFs"
        className="mb-5"
      />

      {items === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Archive className="size-6" />}
          title="No PDFs yet"
          description="PDFs you add are stored in this device's local database, never uploaded."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`surface-card flex flex-col gap-2 p-4 ${
                item.id === selectedId ? "ring-2 ring-primary" : ""
              }`}
            >
              <button type="button" onClick={() => selectItem(item)} className="text-left">
                <div className="mb-2 flex aspect-video w-full items-center justify-center rounded-lg bg-surface-sunken">
                  <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="truncate font-medium">{item.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(item.sizeBytes)} · {formatDate(item.createdAt)}
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
                    if (item.id === selectedId) setSelectedId(null);
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

      {selected ? (
        <div className="surface-card mt-6 space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(selected.sizeBytes)} · updated {formatDate(selected.updatedAt)}
              </p>
            </div>
            <button
              type="button"
              className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
              aria-label="Deselect"
              onClick={() => setSelectedId(null)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {previewUrl ? (
            <iframe
              title={selected.name}
              src={previewUrl}
              className="h-[40dvh] w-full rounded-xl"
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="tap-target" onClick={() => void openSelected()}>
              <ExternalLink className="size-4" aria-hidden="true" /> Open
            </Button>
            <Button
              variant="secondary"
              className="tap-target"
              onClick={() => void downloadSelected()}
            >
              <Download className="size-4" aria-hidden="true" /> Download
            </Button>
            <Button
              variant={editing ? "outline" : "default"}
              className="tap-target"
              onClick={() => (editing ? stopEditing() : setEditing(true))}
            >
              {editing ? (
                <>
                  <X className="size-4" aria-hidden="true" /> Finish editing
                </>
              ) : (
                <>
                  <Pencil className="size-4" aria-hidden="true" /> Edit
                </>
              )}
            </Button>
          </div>

          {editing ? (
            <div className="space-y-3 border-t pt-4">
              <label htmlFor="pdf-edit-instruction" className="text-sm font-medium">
                Describe the change
              </label>
              <Textarea
                id="pdf-edit-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="e.g. Make the title larger and add a section about Fundamental Rights."
                rows={4}
                disabled={status === "generating"}
              />
              <div className="flex items-center gap-3">
                <Button
                  className="tap-target"
                  onClick={() => void generateChanges()}
                  disabled={status === "generating" || !instruction.trim()}
                >
                  {status === "generating" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Generating…
                    </>
                  ) : (
                    "Generate changes"
                  )}
                </Button>
              </div>

              {status === "done" ? (
                <p className="flex items-start gap-2 text-sm text-green-700 dark:text-green-500">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{statusMessage}</span>
                </p>
              ) : null}
              {status === "error" ? (
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{statusMessage}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </PageContainer>
  );
}
