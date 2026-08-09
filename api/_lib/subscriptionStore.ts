import { Redis } from "@upstash/redis";
import type { PushSubscriptionJSON } from "./push.js";

export interface SubscriptionStore {
  register(subscription: PushSubscriptionJSON): Promise<void>;
  remove(endpoint: string): Promise<void>;
  get(): Promise<PushSubscriptionJSON | null>;
}

/** All Study Buddy Redis keys live under this prefix; nothing else in the
 *  Upstash database is ever read or written from here. */
const KEY_PREFIX = "study-buddy-ai:";
/** Single-user app: one current PushSubscription is sufficient. */
const SUBSCRIPTION_KEY = `${KEY_PREFIX}push-subscription`;

function isPushSubscriptionJSON(value: unknown): value is PushSubscriptionJSON {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PushSubscriptionJSON>;
  return (
    typeof candidate.endpoint === "string" &&
    candidate.endpoint.length > 0 &&
    typeof candidate.keys === "object" &&
    candidate.keys !== null &&
    typeof candidate.keys.auth === "string" &&
    candidate.keys.auth.length > 0 &&
    typeof candidate.keys.p256dh === "string" &&
    candidate.keys.p256dh.length > 0
  );
}

let client: Redis | undefined;

function redisClient(): Redis {
  if (client) return client;
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) {
    throw new Error("Upstash Redis storage is not configured.");
  }
  client = new Redis({ url, token });
  return client;
}

export class UpstashSubscriptionStore implements SubscriptionStore {
  async register(subscription: PushSubscriptionJSON): Promise<void> {
    const payload: PushSubscriptionJSON = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh,
      },
    };
    // Overwrites whatever subscription was previously stored.
    await redisClient().set(SUBSCRIPTION_KEY, payload);
  }

  async remove(endpoint: string): Promise<void> {
    const existing = await this.get();
    // Only delete when the stored subscription is the one being unsubscribed;
    // never clear out a different (newer) subscription.
    if (existing && existing.endpoint === endpoint) {
      await redisClient().del(SUBSCRIPTION_KEY);
    }
  }

  async get(): Promise<PushSubscriptionJSON | null> {
    const stored = await redisClient().get<unknown>(SUBSCRIPTION_KEY);
    if (!isPushSubscriptionJSON(stored)) return null;
    return {
      endpoint: stored.endpoint,
      expirationTime: stored.expirationTime ?? null,
      keys: { auth: stored.keys.auth, p256dh: stored.keys.p256dh },
    };
  }
}

export const subscriptionStore: SubscriptionStore = new UpstashSubscriptionStore();
