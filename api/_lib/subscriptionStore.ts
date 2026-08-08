import type { PushSubscriptionJSON } from "./push";

export interface SubscriptionStore {
  register(subscription: PushSubscriptionJSON): Promise<void>;
  remove(endpoint: string): Promise<void>;
  get(): Promise<PushSubscriptionJSON | null>;
}

/**
 * The app has no hosted database. This boundary makes that limitation explicit
 * until a user chooses a small server-side store for the personal subscription.
 */
export class UnconfiguredSubscriptionStore implements SubscriptionStore {
  async register(): Promise<void> {
    throw new Error("Subscription storage is not configured.");
  }

  async remove(): Promise<void> {
    throw new Error("Subscription storage is not configured.");
  }

  async get(): Promise<PushSubscriptionJSON | null> {
    return null;
  }
}

export const subscriptionStore: SubscriptionStore = new UnconfiguredSubscriptionStore();
