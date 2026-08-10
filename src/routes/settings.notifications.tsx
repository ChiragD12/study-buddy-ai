import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getPushState,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from "@/pwa/push/pushService";
import {
  getNotificationPreferences,
  NOTIFICATION_CATEGORIES,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/features/notifications/preferences";
import { CURRENT_AFFAIRS_TOPIC_LABELS } from "@/shared/types/domain";
import { PageContainer, PageHeader } from "@/shared/components/Page";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Exam Assistant" },
      { name: "description", content: "Configure real Web Push for your installed study app." },
      { property: "og:title", content: "Notifications — Exam Assistant" },
      {
        property: "og:description",
        content: "Configure real Web Push for your installed study app.",
      },
    ],
  }),
  component: NotificationSettings,
});

const STATE_COPY: Record<PushState, string> = {
  unsupported: "This browser does not support Web Push.",
  "requires-install":
    "On iPhone, add this app to your Home Screen first — iOS only allows push for installed web apps.",
  "permission-not-requested": "Notifications are not enabled yet.",
  "permission-granted-but-not-subscribed":
    "Permission granted. Enable Current Affairs notifications to subscribe.",
  "permission-denied": "Permission was denied. Re-enable notifications in system settings.",
  subscribed: "Subscribed. Your device will receive push messages from your endpoint.",
  "needs-renewal": "The push subscription expired. Subscribe again.",
};

/**
 * Pushes the person's current Current Affairs category selection up to the
 * server-side subscription record (see api/notifications/subscribe.ts and
 * subscriptionStore.ts), so the cron worker filters notifications by the
 * same preferences shown here. A no-op (silently, since local preferences
 * are already saved regardless) when there's no active push subscription
 * yet to attach the categories to.
 */
async function syncCategoriesWithServer(categories: NotificationPreferences["categories"]) {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        currentAffairsCategories: categories,
      }),
    });
  } catch {
    // Best-effort — the local preference is already saved either way, and
    // the next successful sync (or the next subscribeToPush() call) will
    // pick up the current selection.
  }
}

function NotificationSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(() =>
    getNotificationPreferences(),
  );

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  async function refresh() {
    setState(await getPushState());
  }

  async function setEnabled(enabled: boolean) {
    if (!enabled) {
      try {
        await unsubscribeFromPush();
        const next = { ...preferences, currentAffairsEnabled: false };
        setPreferences(next);
        saveNotificationPreferences(next);
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not disable notifications.");
      }
      return;
    }
    if (state === "permission-denied") return;
    try {
      const permission = await requestPermission();
      if (permission !== "granted") {
        await refresh();
        return;
      }
      await subscribeToPush();
      const next = { ...preferences, currentAffairsEnabled: true };
      setPreferences(next);
      saveNotificationPreferences(next);
      // subscribeToPush() registers the subscription itself but doesn't
      // know about category preferences — send them explicitly so the
      // worker doesn't default to "every topic enabled" only until the
      // next checkbox change.
      await syncCategoriesWithServer(next.categories);
      toast.success("Current Affairs notifications enabled");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable notifications.");
      await refresh();
    }
  }

  function toggleCategory(category: NotificationPreferences["categories"][number]) {
    const categories = preferences.categories.includes(category)
      ? preferences.categories.filter((item) => item !== category)
      : [...preferences.categories, category];
    const next = { ...preferences, categories };
    setPreferences(next);
    saveNotificationPreferences(next);
    if (preferences.currentAffairsEnabled) void syncCategoriesWithServer(categories);
  }

  const enabled = preferences.currentAffairsEnabled;
  const blocked =
    state === "unsupported" || state === "requires-install" || state === "permission-denied";
  const statusTone = enabled ? "success" : blocked ? "warning" : "muted";

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Push is delivered end-to-end: a scheduler calls your endpoint, the endpoint sends a Web Push message, and the service worker shows it — even when the app is closed."
      />

      <div className="surface-card space-y-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "size-2 rounded-full",
                statusTone === "success" && "bg-success",
                statusTone === "warning" && "bg-warning",
                statusTone === "muted" && "bg-muted-foreground/50",
              )}
              aria-hidden="true"
            />
            <span className="text-sm font-medium">
              {enabled ? "Notifications enabled" : "Notifications disabled"}
            </span>
          </div>
          <Switch
            checked={enabled}
            disabled={blocked}
            onCheckedChange={(checked) => void setEnabled(checked)}
            aria-label="Toggle Current Affairs notifications"
          />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {state ? STATE_COPY[state] : "Checking…"}
        </p>
      </div>

      <div className="surface-card mt-4 space-y-4 p-5">
        <div>
          <h2 className="font-medium">Categories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the topics allowed to notify you. Only articles the classifier marks important or
            critical are sent for your selected topics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {NOTIFICATION_CATEGORIES.map((category) => {
            const active = preferences.categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCategory(category)}
                className={cn(
                  "chip tap-target px-3.5 py-2 text-sm font-medium",
                  active ? "chip-active" : "text-foreground hover:bg-glass-3",
                )}
              >
                {CURRENT_AFFAIRS_TOPIC_LABELS[category]}
              </button>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}
