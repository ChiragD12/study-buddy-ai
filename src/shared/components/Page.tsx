import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-6 lg:pt-10">{children}</div>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="animate-fade-in-up mb-6 flex items-start justify-between gap-4 border-b border-border/40 pb-5">
      <div>
        <h1 className="text-balance-tight text-2xl font-semibold tracking-tight lg:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-1 animate-fade-in-up flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ? (
        <div
          className="flex size-12 items-center justify-center rounded-full bg-glass-2 text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

/** Explicit, honest state for capabilities that are intentionally deferred,
 *  or a routine informational notice. Pass `tone="warning"` for genuine
 *  errors so they read distinctly without becoming an alarming red box. */
export function NotImplementedNote({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <p
      className={cn(
        "mt-3 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tone === "warning"
          ? "border-warning/30 bg-warning/10 text-foreground"
          : "border-dashed border-border text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}
