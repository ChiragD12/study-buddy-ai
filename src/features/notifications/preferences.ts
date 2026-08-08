export const NOTIFICATION_CATEGORIES = [
  "National",
  "Defence",
  "Space & Science",
  "Technology",
  "Sports",
  "Economy",
  "Polity/Governance",
  "Awards",
  "Environment",
  "Important appointments",
  "Important reports/indexes",
  "Haryana",
  "Rajasthan",
  "Other state-specific relevance",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

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
