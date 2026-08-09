import type { PushSubscriptionJSON } from "./push.js";
import { getRedis, KEY_PREFIX } from "./redisClient.js";
import { isCurrentAffairsTopic, type CurrentAffairsTopic } from "./currentAffairsTaxonomy.js";

/** Single-user app: one current PushSubscription is sufficient. */
const SUBSCRIPTION_KEY = `${KEY_PREFIX}push-subscription`;

/**
 * What's stored under study-buddy-ai:push-subscription. The Current Affairs
 * category preferences live alongside the subscription in this same record
 * (not a second Redis key) so the notification worker can read both in one
 * lookup.
 */
export interface StoredSubscription {
  subscription: PushSubscriptionJSON;
  /**
   * `undefined` means no preference has ever been recorded (a fresh
   * subscription, or one written before this field existed) — callers
   * should treat that as "every topic enabled", matching the Settings
   * page's default of every category checked (see
   * src/features/notifications/preferences.ts). An explicit `[]` means the
   * person unchecked every category on purpose and should receive nothing;
   * it is NOT the same as "unset" and must not be treated as "all enabled".
   */
  currentAffairsCategories?: CurrentAffairsTopic[] | undefined;
}

export interface SubscriptionStore {
  register(
    subscription: PushSubscriptionJSON,
    currentAffairsCategories?: CurrentAffairsTopic[],
  ): Promise<void>;
  remove(endpoint: string): Promise<void>;
  get(): Promise<StoredSubscription | null>;
}

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

function normalizeSubscription(subscription: PushSubscriptionJSON): PushSubscriptionJSON {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: { auth: subscription.keys.auth, p256dh: subscription.keys.p256dh },
  };
}

/** Returns undefined only when `value` isn't an array at all (field absent
 *  / corrupt) — an empty array is a valid, meaningful "no topics" value and
 *  must be preserved as `[]`, not collapsed to undefined. */
function normalizeCategories(value: unknown): CurrentAffairsTopic[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter(isCurrentAffairsTopic))];
}

/**
 * Reads the raw Redis value as either the current `StoredSubscription`
 * shape, or the old flat `PushSubscriptionJSON` shape written before
 * category preferences existed. Returns null for anything else (corrupt or
 * absent data) so callers can treat it the same as "not subscribed".
 */
function parseStoredValue(stored: unknown): StoredSubscription | null {
  if (isPushSubscriptionJSON(stored)) {
    // Legacy shape: the whole value was the PushSubscriptionJSON itself.
    return { subscription: normalizeSubscription(stored) };
  }
  if (stored && typeof stored === "object" && "subscription" in stored) {
    const record = stored as { subscription: unknown; currentAffairsCategories?: unknown };
    if (!isPushSubscriptionJSON(record.subscription)) return null;
    return {
      subscription: normalizeSubscription(record.subscription),
      currentAffairsCategories: normalizeCategories(record.currentAffairsCategories),
    };
  }
  return null;
}

export class UpstashSubscriptionStore implements SubscriptionStore {
  async register(
    subscription: PushSubscriptionJSON,
    currentAffairsCategories?: CurrentAffairsTopic[],
  ): Promise<void> {
    // A register() call that doesn't specify categories (e.g. a plain
    // re-subscribe/renewal) preserves whatever was saved before — the
    // person shouldn't have to re-pick categories just because their
    // browser silently renewed the push subscription. When categories IS
    // provided (including `[]`), it always overwrites.
    const categories =
      currentAffairsCategories !== undefined
        ? normalizeCategories(currentAffairsCategories)
        : (await this.get())?.currentAffairsCategories;
    const record: StoredSubscription = {
      subscription: normalizeSubscription(subscription),
      ...(categories !== undefined ? { currentAffairsCategories: categories } : {}),
    };
    // Overwrites whatever subscription was previously stored.
    await getRedis().set(SUBSCRIPTION_KEY, record);
  }

  async remove(endpoint: string): Promise<void> {
    const existing = await this.get();
    // Only delete when the stored subscription is the one being unsubscribed;
    // never clear out a different (newer) subscription.
    if (existing && existing.subscription.endpoint === endpoint) {
      await getRedis().del(SUBSCRIPTION_KEY);
    }
  }

  async get(): Promise<StoredSubscription | null> {
    const stored = await getRedis().get<unknown>(SUBSCRIPTION_KEY);
    return parseStoredValue(stored);
  }
}

export const subscriptionStore: SubscriptionStore = new UpstashSubscriptionStore();
