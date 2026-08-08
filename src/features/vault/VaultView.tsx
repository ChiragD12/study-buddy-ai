import { Archive, Star, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { vaultRepository } from "@/data/repositories/vault.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatBytes, formatDate } from "@/shared/utils/format";
import type { VaultKind } from "@/shared/types/domain";

interface VaultViewProps {
  title: string;
  description: string;
  kind?: VaultKind;
  favoritesOnly?: boolean;
}

export function VaultView({ title, description, kind, favoritesOnly }: VaultViewProps) {
  const [query, setQuery] = useState("");
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

  async function openItem(id: string, name: string) {
    const blob = await vaultRepository.getBlob(id);
    if (!blob) {
      toast.error("File data is missing for this item.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
              onChange={(event) => void handleFiles(event.target.files)}
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
              <button
                type="button"
                onClick={() => void openItem(item.id, item.name)}
                className="text-left"
              >
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
    </PageContainer>
  );
}
