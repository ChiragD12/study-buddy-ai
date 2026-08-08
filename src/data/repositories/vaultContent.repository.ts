import { getDb } from "@/data/db/db";
import { now } from "@/data/repositories/util";
import type { ID, VaultContent, VaultContentMethod } from "@/shared/types/domain";

/**
 * Cache for the plain-text reading of a Vault file's actual contents (see
 * VaultContent in shared/types/domain.ts). Populated lazily by
 * `vaultReadContent` (ai/tools/localTools.ts) — never written on upload.
 */
export interface VaultContentRepository {
  get(vaultItemId: ID): Promise<VaultContent | undefined>;
  put(
    vaultItemId: ID,
    text: string,
    method: VaultContentMethod,
    sourceUpdatedAt: string,
  ): Promise<VaultContent>;
  remove(vaultItemId: ID): Promise<void>;
}

export const vaultContentRepository: VaultContentRepository = {
  get(vaultItemId) {
    return getDb().vaultContent.get(vaultItemId);
  },
  async put(vaultItemId, text, method, sourceUpdatedAt) {
    const record: VaultContent = {
      vaultItemId,
      text,
      method,
      extractedAt: now(),
      sourceUpdatedAt,
    };
    await getDb().vaultContent.put(record);
    return record;
  },
  async remove(vaultItemId) {
    await getDb().vaultContent.delete(vaultItemId);
  },
};
