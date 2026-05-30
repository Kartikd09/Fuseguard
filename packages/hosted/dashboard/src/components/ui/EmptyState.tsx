// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Empty-state display — polished with icon, title, description, CTA.
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center px-4",
        className
      )}
    >
      {icon && (
        <div
          className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/50 text-2xl"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
