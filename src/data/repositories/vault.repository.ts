import { getDb } from "@/data/db/db";
import { newId, now, timestamps } from "@/data/repositories/util";
import type { ID, VaultItem, VaultKind } from "@/shared/types/domain";

export interface VaultFilter {
  query?: string;
  kind?: VaultKind | "all";
  favoritesOnly?: boolean;
}

export interface VaultRepository {
  list(filter?: VaultFilter): Promise<VaultItem[]>;
  get(id: ID): Promise<VaultItem | undefined>;
  addFile(file: File, meta?: Partial<VaultItem>): Promise<VaultItem>;
  addBlob(name: string, blob: Blob, meta?: Partial<VaultItem>): Promise<VaultItem>;
  getBlob(id: ID): Promise<Blob | undefined>;
  toggleFavorite(id: ID): Promise<void>;
  update(id: ID, patch: Partial<VaultItem>): Promise<void>;
  remove(id: ID): Promise<void>;
}

export function kindFromMime(mime: string): VaultKind {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

export const vaultRepository: VaultRepository = {
  async list(filter) {
    let items = await getDb().vaultItems.orderBy("updatedAt").reverse().toArray();
    if (filter?.kind && filter.kind !== "all") {
      items = items.filter((item) => item.kind === filter.kind);
    }
    if (filter?.favoritesOnly) items = items.filter((item) => item.favorite);
    const q = filter?.query?.trim().toLowerCase();
    if (q) {
      items = items.filter((item) =>
        [item.name, ...item.tags].some((field) => field.toLowerCase().includes(q)),
      );
    }
    return items;
  },
  get(id) {
    return getDb().vaultItems.get(id);
  },
  addFile(file, meta) {
    return vaultRepository.addBlob(file.name, file, {
      mimeType: file.type || "application/octet-stream",
      ...meta,
    });
  },
  async addBlob(name, blob, meta) {
    const mimeType = meta?.mimeType ?? blob.type ?? "application/octet-stream";
    const item: VaultItem = {
      id: newId(),
      name,
      kind: meta?.kind ?? kindFromMime(mimeType),
      mimeType,
      sizeBytes: blob.size,
      tags: meta?.tags ?? [],
      examId: meta?.examId ?? null,
      favorite: meta?.favorite ?? false,
      blobKey: newId(),
      ...timestamps(),
    };
    await getDb().transaction("rw", getDb().vaultItems, getDb().vaultBlobs, async () => {
      await getDb().vaultBlobs.add({ key: item.blobKey!, blob });
      await getDb().vaultItems.add(item);
    });
    return item;
  },
  async getBlob(id) {
    const item = await getDb().vaultItems.get(id);
    if (!item?.blobKey) return undefined;
    const record = await getDb().vaultBlobs.get(item.blobKey);
    return record?.blob;
  },
  async toggleFavorite(id) {
    const item = await getDb().vaultItems.get(id);
    if (!item) return;
    await getDb().vaultItems.update(id, { favorite: !item.favorite, updatedAt: now() });
  },
  async update(id, patch) {
    await getDb().vaultItems.update(id, { ...patch, updatedAt: now() });
  },
  async remove(id) {
    const item = await getDb().vaultItems.get(id);
    await getDb().transaction("rw", getDb().vaultItems, getDb().vaultBlobs, async () => {
      if (item?.blobKey) await getDb().vaultBlobs.delete(item.blobKey);
      await getDb().vaultItems.delete(id);
    });
  },
};
