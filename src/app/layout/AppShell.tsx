import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { navSections, titleForPath } from "@/app/layout/navigation";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-6 px-3 py-4">
      {navSections.map((section) => (
        <div key={section.title}>
          <h2 className="px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {section.title}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: item.to === "/" }}
                  className="tap-target flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[0.95rem] text-sidebar-foreground transition-all duration-200 hover:border-white/10 hover:bg-white/10 data-[status=active]:border-white/10 data-[status=active]:bg-white/12 data-[status=active]:font-semibold data-[status=active]:text-sidebar-accent-foreground"
                >
                  <item.icon className="size-[1.15rem] shrink-0 opacity-80" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-6 pt-5">
      <img src="/icons/icon-192.png" alt="" width={32} height={32} className="size-8 rounded-lg" />
      <div className="leading-tight">
        <p className="text-sm font-semibold">Exam Assistant</p>
        <p className="text-xs text-muted-foreground">Private · on this device</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-dvh-safe bg-background">
      <aside className="hidden w-72 shrink-0 border-r bg-sidebar lg:block">
        <div className="sticky top-0 max-h-dvh overflow-y-auto pb-8">
          <Brand />
          <NavList />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-background/45 pt-safe backdrop-blur-2xl lg:hidden dark:border-white/10">
          <div className="flex h-14 items-center gap-2 px-2 pl-safe pr-safe">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                className="tap-target inline-flex items-center justify-center rounded-xl text-foreground transition-colors hover:bg-accent"
                aria-label="Open navigation"
              >
                <Menu className="size-5" aria-hidden="true" />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[19rem] gap-0 border-r border-white/10 bg-sidebar/65 p-0 pt-safe pb-safe backdrop-blur-2xl dark:border-white/10"
              >
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Brand />
                <div className="max-h-full overflow-y-auto">
                  <NavList onNavigate={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <h1 className={cn("truncate text-base font-semibold")}>{titleForPath(pathname)}</h1>
          </div>
        </header>

        <main className="relative z-10 min-w-0 flex-1 bg-transparent pl-safe pr-safe">
          {children}
        </main>
      </div>
    </div>
  );
}
