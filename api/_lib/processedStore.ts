import { getRedis, KEY_PREFIX } from "./redisClient.js";

/** Single Redis key, as required — every processed article id lives in one
 *  sorted set here, never a per-article key. */
const PROCESSED_KEY = `${KEY_PREFIX}processed-current-affairs`;

/** How long a processed id is retained before it's pruned. Comfortably
 *  longer than any realistic "same story resurfaces in a feed" window,
 *  while keeping the sorted set from growing forever. */
const RETENTION_MS = 1000 * 60 * 60 * 24 * 60; // 60 days

export interface ProcessedStore {
  /** Returns the subset of `ids` that have not previously been marked processed. */
  filterNew(ids: string[]): Promise<string[]>;
  /** Marks the given ids as processed (score = now) and prunes entries older than RETENTION_MS. */
  markProcessed(ids: string[]): Promise<void>;
}

export class UpstashProcessedStore implements ProcessedStore {
  async filterNew(ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const redis = getRedis();
    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.zscore(PROCESSED_KEY, id);
    const scores = (await pipeline.exec()) as (number | null)[];
    return ids.filter((_, index) => scores[index] === null || scores[index] === undefined);
  }

  async markProcessed(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const redis = getRedis();
    const now = Date.now();
    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.zadd(PROCESSED_KEY, { score: now, member: id });
    pipeline.zremrangebyscore(PROCESSED_KEY, 0, now - RETENTION_MS);
    await pipeline.exec();
  }
}

export const processedStore: ProcessedStore = new UpstashProcessedStore();
