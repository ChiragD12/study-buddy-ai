import { Redis } from "@upstash/redis";

/** All Study Buddy Redis keys live under this prefix; nothing else in the
 *  Upstash database is ever read or written from here. */
export const KEY_PREFIX = "study-buddy-ai:";

let client: Redis | undefined;

/** Throws if Upstash env vars are not configured — callers already handle
 *  that (see subscriptionStore.get()/register() and processedStore.ts). */
export function getRedis(): Redis {
  if (client) return client;
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) {
    throw new Error("Upstash Redis storage is not configured.");
  }
  client = new Redis({ url, token });
  return client;
}
