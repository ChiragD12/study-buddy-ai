# Phase 3A setup

Phase 3A adds the browser push and notification endpoint boundaries. The app remains local-first: exams, notes, Vault, plans, conversations, settings, and current-affairs records stay in Dexie/IndexedDB.

## Vercel environment variables

Client-safe:

```text
VITE_VAPID_PUBLIC_KEY=<your VAPID public key>
```

Server-only:

```text
VAPID_PRIVATE_KEY=<your VAPID private key>
VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=<a long random secret>
PUSH_SUBSCRIPTION_JSON=<optional personal PushSubscription JSON for the test sender>
```

Never put `VAPID_PRIVATE_KEY` or `CRON_SECRET` in a `VITE_` variable, source file, IndexedDB, localStorage, or Git.

Generate a VAPID key pair with a trusted Web Push tool or the `web-push` CLI. Keep the private key server-side. The public key is supplied to the client through `VITE_VAPID_PUBLIC_KEY`.

## Deployment and manual test

1. Add the variables above to the Vercel production environment, without committing their values.
2. Deploy the production Vite SPA and functions.
3. Open the deployed PWA and add it to the iPhone Home Screen if needed.
4. Open Settings > Notifications and explicitly enable Current Affairs notifications.
5. Confirm the browser reports a subscribed state.
6. The current repository intentionally does not add a hosted subscription database. Before relying on `/api/notifications/subscribe`, provide a `SubscriptionStore` implementation backed by storage you have chosen, or manually copy the browser's `PushSubscription.toJSON()` value into `PUSH_SUBSCRIPTION_JSON` for the single-device test path.
7. Send a manual test request:

```text
POST https://YOUR_VERCEL_DOMAIN/api/notifications/test
Authorization: Bearer YOUR_CRON_SECRET
```

8. Verify that the iPhone receives the small test notification.

## cron-job.org

Configure this manually after deployment. Do not configure a Vercel Cron job.

```text
Method: POST
URL: https://YOUR_VERCEL_DOMAIN/api/notifications/run
Header: Authorization: Bearer YOUR_CRON_SECRET
```

The endpoint currently establishes the authenticated trigger and sends a minimal current-affairs test-shaped payload when a personal subscription is available. It does not fetch news or rank items yet.

## Endpoints

- `POST /api/notifications/subscribe`: accepts a PushSubscription and returns `503` until a durable subscription store is configured.
- `POST /api/notifications/unsubscribe`: corresponding removal boundary; returns `503` until that store exists.
- `POST /api/notifications/test`: authenticated manual push test using `PUSH_SUBSCRIPTION_JSON`.
- `POST /api/notifications/run`: authenticated scheduled trigger boundary.

The endpoint functions never become the application's database. No Supabase, Firebase, hosted database, authentication service, or cron-job.org API is used.
