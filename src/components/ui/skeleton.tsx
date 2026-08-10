import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer overflow-hidden rounded-md bg-glass-2", className)}
      {...props}
    />
  );
}

export { Skeleton };
