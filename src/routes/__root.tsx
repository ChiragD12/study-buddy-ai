import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { SettingsProvider } from "@/app/providers/SettingsProvider";
import { ThemeEffect } from "@/app/providers/ThemeEffect";
import { AppShell } from "@/app/layout/AppShell";
import { StarField } from "@/app/layout/StarField";
import { registerServiceWorker } from "@/pwa/register";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="app-atmosphere relative flex min-h-dvh items-center justify-center bg-background px-4">
      <StarField />
      <div className="glass-panel animate-fade-in-up relative z-10 max-w-md p-8 text-center">
        <h1 className="text-6xl font-semibold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">This screen doesn't exist in the app.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="tap-target inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98]"
          >
            Back to assistant
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="app-atmosphere relative flex min-h-dvh items-center justify-center bg-background px-4">
      <StarField />
      <div className="glass-panel animate-fade-in-up relative z-10 max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This screen didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your local data is untouched. Try again or return to the assistant.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="tap-target inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98]"
          >
            Try again
          </button>
          <a
            href="/"
            className="tap-target glass-sm inline-flex items-center justify-center rounded-xl border border-border/70 bg-surface/40 px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-accent/60 active:scale-[0.98]"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { name: "theme-color", content: "#faf9f7" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Exams" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ThemeEffect />
        <div className="app-atmosphere relative min-h-dvh bg-background">
          <StarField />
          <div className="relative z-10">
            <AppShell>
              {/* Required: nested routes render here. Keyed on pathname so route
                  changes get a short, subtle fade/slide instead of a hard cut —
                  AppShell itself (sidebar, header) stays mounted. */}
              <div key={pathname} className="animate-route-in">
                <Outlet />
              </div>
            </AppShell>
          </div>
        </div>
        <Toaster position="top-center" />
      </SettingsProvider>
    </QueryClientProvider>
  );
}
