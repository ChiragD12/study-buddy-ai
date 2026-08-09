import { CURRENT_AFFAIRS_TOPICS, type CurrentAffairsTopic } from "@/shared/types/domain";

/**
 * Categories a person can enable Current Affairs push notifications for.
 *
 * These are the exact `CurrentAffairsTopic` values the classifier assigns
 * to each article as `primaryTopic` (see
 * ai/context/currentAffairsClassification.ts on the client, and the
 * server-safe mirror in api/_lib/currentAffairsTaxonomy.ts used by the
 * cron worker) — NOT RSS category strings, and not a separate ad-hoc list.
 * A preference here only ever matches an article whose
 * classification.primaryTopic equals the same value, so the labels shown
 * here are the same CURRENT_AFFAIRS_TOPIC_LABELS already used on the
 * Current Affairs page's topic filter.
 *
 * Previously this was its own ad-hoc list (e.g. "Rajasthan", "National")
 * that didn't correspond to anything the classifier could ever produce, so
 * a saved preference could never actually match an article. Renamed here
 * to the real taxonomy so notification filtering works.
 */
export const NOTIFICATION_CATEGORIES = CURRENT_AFFAIRS_TOPICS;

export type NotificationCategory = CurrentAffairsTopic;

export interface NotificationPreferences {
  currentAffairsEnabled: boolean;
  categories: NotificationCategory[];
}

const STORAGE_KEY = "exam-assistant.notification-preferences";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  currentAffairsEnabled: false,
  categories: [...NOTIFICATION_CATEGORIES],
};

function isCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof localStorage === "undefined") return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
      currentAffairsEnabled?: unknown;
      categories?: unknown;
    } | null;
    const categories = Array.isArray(parsed?.categories)
      ? parsed.categories.filter(
          (category): category is NotificationCategory =>
            typeof category === "string" && isCategory(category),
        )
      : DEFAULT_PREFERENCES.categories;
    return {
      currentAffairsEnabled: parsed?.currentAffairsEnabled === true,
      categories: categories.length ? categories : [...NOTIFICATION_CATEGORIES],
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveNotificationPreferences(preferences: NotificationPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
