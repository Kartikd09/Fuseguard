// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// shadcn/ui Skeleton — owned copy.
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-skeleton-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
