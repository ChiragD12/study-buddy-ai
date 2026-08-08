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
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/shared/components/Page";

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
  }

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Push is delivered end-to-end: a scheduler calls your endpoint, the endpoint sends a Web Push message, and the service worker shows it — even when the app is closed."
      />

      <div className="surface-card space-y-4 p-5">
        <p className="text-sm leading-relaxed">{state ? STATE_COPY[state] : "Checking…"}</p>
        <label className="flex items-center justify-between gap-4 text-sm font-medium">
          <span>Current Affairs notifications</span>
          <input
            type="checkbox"
            checked={preferences.currentAffairsEnabled}
            disabled={
              state === "unsupported" ||
              state === "requires-install" ||
              state === "permission-denied"
            }
            onChange={(event) => void setEnabled(event.target.checked)}
            className="size-5 accent-primary"
          />
        </label>
      </div>

      <div className="surface-card mt-4 space-y-4 p-5">
        <div>
          <h2 className="font-medium">Categories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the topics allowed to notify you.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {NOTIFICATION_CATEGORIES.map((category) => (
            <label key={category} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={preferences.categories.includes(category)}
                onChange={() => toggleCategory(category)}
                className="size-4 accent-primary"
              />
              {category}
            </label>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
