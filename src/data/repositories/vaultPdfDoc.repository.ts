import { getDb } from "@/data/db/db";
import { now } from "@/data/repositories/util";
import type { ID, VaultPdfDoc, VaultPdfSection } from "@/shared/types/domain";

export interface VaultPdfDocRepository {
  get(vaultItemId: ID): Promise<VaultPdfDoc | undefined>;
  put(vaultItemId: ID, title: string, sections: VaultPdfSection[]): Promise<VaultPdfDoc>;
  remove(vaultItemId: ID): Promise<void>;
}

export const vaultPdfDocRepository: VaultPdfDocRepository = {
  get(vaultItemId) {
    return getDb().vaultPdfDocs.get(vaultItemId);
  },
  async put(vaultItemId, title, sections) {
    const doc: VaultPdfDoc = { vaultItemId, title, sections, updatedAt: now() };
    await getDb().vaultPdfDocs.put(doc);
    return doc;
  },
  async remove(vaultItemId) {
    await getDb().vaultPdfDocs.delete(vaultItemId);
  },
};
