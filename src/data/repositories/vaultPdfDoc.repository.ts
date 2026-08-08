import { getDb } from "@/data/db/db";
import { now } from "@/data/repositories/util";
import type { ID, VaultPdfDoc, VaultPdfSection } from "@/shared/types/domain";

export interface VaultPdfDocInput {
  title: string;
  subtitle?: string | undefined;
  columns?: 1 | 2 | undefined;
  sections: VaultPdfSection[];
}

export interface VaultPdfDocRepository {
  get(vaultItemId: ID): Promise<VaultPdfDoc | undefined>;
  put(vaultItemId: ID, doc: VaultPdfDocInput): Promise<VaultPdfDoc>;
  remove(vaultItemId: ID): Promise<void>;
}

export const vaultPdfDocRepository: VaultPdfDocRepository = {
  get(vaultItemId) {
    return getDb().vaultPdfDocs.get(vaultItemId);
  },
  async put(vaultItemId, doc) {
    const record: VaultPdfDoc = {
      vaultItemId,
      title: doc.title,
      subtitle: doc.subtitle,
      columns: doc.columns,
      sections: doc.sections,
      updatedAt: now(),
    };
    await getDb().vaultPdfDocs.put(record);
    return record;
  },
  async remove(vaultItemId) {
    await getDb().vaultPdfDocs.delete(vaultItemId);
  },
};
