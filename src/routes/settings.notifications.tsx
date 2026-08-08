import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getPushEndpoint,
  getPushState,
  getVapidPublicKey,
  requestPermission,
  setPushEndpoint,
  setVapidPublicKey,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from "@/pwa/push/pushService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotImplementedNote, PageContainer, PageHeader } from "@/shared/components/Page";

export const Route = createFileRoute("/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Exam Assistant" },
      { name: "description", content: "Configure real Web Push for your installed study app." },
      { property: "og:title", content: "Notifications — Exam Assistant" },
      { property: "og:description", content: "Configure real Web Push for your installed study app." },
    ],
  }),
  component: NotificationSettings,
});

const STATE_COPY: Record<PushState, string> = {
  unsupported: "This browser does not support Web Push.",
  "requires-install": "On iPhone, add this app to your Home Screen first — iOS only allows push for installed web apps.",
  default: "Notifications are not enabled yet.",
  granted: "Permission granted. Subscribe to start receiving push messages.",
  denied: "Permission was denied. Re-enable notifications in system settings.",
  subscribed: "Subscribed. Your device will receive push messages from your endpoint.",
  "needs-renewal": "The push subscription expired. Subscribe again.",
};

function NotificationSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [vapid, setVapid] = useState("");

  useEffect(() => {
    setEndpoint(getPushEndpoint());
    setVapid(getVapidPublicKey());
    void getPushState().then(setState);
  }, []);

  async function refresh() {
    setState(await getPushState());
  }

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Push is delivered end-to-end: a scheduler calls your endpoint, the endpoint sends a Web Push message, and the service worker shows it — even when the app is closed."
      />

      <div className="surface-card space-y-4 p-5">
        <p className="text-sm leading-relaxed">{state ? STATE_COPY[state] : "Checking…"}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            className="tap-target"
            onClick={async () => {
              const permission = await requestPermission();
              if (permission !== "granted") toast.error("Permission not granted.");
              await refresh();
            }}
          >
            Enable permission
          </Button>
          <Button
            variant="secondary"
            className="tap-target"
            onClick={async () => {
              try {
                await subscribeToPush();
                toast.success("Subscribed to push");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Subscription failed.");
              }
              await refresh();
            }}
          >
            Subscribe
          </Button>
          <Button
            variant="ghost"
            className="tap-target"
            onClick={async () => {
              await unsubscribeFromPush();
              toast.success("Unsubscribed");
              await refresh();
            }}
          >
            Unsubscribe
          </Button>
        </div>
      </div>

      <div className="surface-card mt-4 space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="vapid">VAPID public key</Label>
          <Input
            id="vapid"
            value={vapid}
            onChange={(event) => setVapid(event.target.value)}
            onBlur={() => setVapidPublicKey(vapid)}
            placeholder="B…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endpoint">Subscription endpoint URL</Label>
          <Input
            id="endpoint"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            onBlur={() => setPushEndpoint(endpoint)}
            placeholder="https://your-host.example/push/subscribe"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your own small server (any host) stores subscriptions and sends pushes. Keeping it
            outside the app is what makes this project portable.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <NotImplementedNote>
          The scheduling server is not part of this app. Point a scheduler such as cron-job.org at
          your endpoint to send reminders.
        </NotImplementedNote>
      </div>
    </PageContainer>
  );
}
