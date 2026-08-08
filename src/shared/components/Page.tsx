import type { ReactNode } from "react";

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
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-balance-tight text-2xl font-semibold lg:text-3xl">{title}</h1>
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
    <div className="surface-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? (
        <div className="text-muted-foreground" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

/** Explicit, honest state for capabilities that are intentionally deferred. */
export function NotImplementedNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed px-4 py-3 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
