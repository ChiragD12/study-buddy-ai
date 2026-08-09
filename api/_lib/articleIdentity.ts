/**
 * Stable article identity for dedup, mirroring the FNV-1a hash + fallback
 * chain in `normalizeItem()` (src/data/repositories/knowledge.repository.ts):
 * RSS GUID first, then the canonical article URL, then a title+source+date
 * fallback for the rare item with neither. Only ever used server-side, as
 * the key under which an article is marked processed in Redis — it does not
 * need to byte-for-byte match the client's IndexedDB id, only to be stable
 * across cron runs for the same article.
 */

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export interface ArticleIdentityInput {
  guid?: string | undefined;
  url: string;
  title: string;
  source: string;
  publishedAt?: string | undefined;
}

export function canonicalArticleId(item: ArticleIdentityInput): string {
  const identity =
    item.guid ||
    item.url ||
    `${item.title.trim().toLowerCase()}|${item.source}|${item.publishedAt ?? ""}`;
  return `current-affairs-${hash(identity)}`;
}
