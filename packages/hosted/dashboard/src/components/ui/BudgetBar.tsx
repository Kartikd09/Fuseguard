// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Budget utilisation progress bar — shadcn Progress-based.
import { cn } from "@/lib/utils";
import { Progress } from "./progress";

interface BudgetBarProps {
  percent: number; // 0–100+ (can exceed 100 when over budget)
  label?: string;
}

function barIndicatorClass(percent: number): string {
  if (percent >= 100) return "bg-destructive";
  if (percent >= 80) return "bg-yellow-500";
  return "bg-emerald-500";
}

export default function BudgetBar({ percent, label }: BudgetBarProps) {
  const clamped = Math.min(percent, 100);
  const indicatorClass = barIndicatorClass(percent);

  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>{label}</span>
          <span
            className={cn(
              "font-medium tabular-nums",
              percent >= 100
                ? "text-destructive"
                : percent >= 80
                ? "text-yellow-400"
                : "text-muted-foreground"
            )}
          >
            {percent}%
          </span>
        </div>
      )}
      <Progress
        value={clamped}
        className="h-1.5"
        indicatorClassName={indicatorClass}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `${percent}% used`}
      />
    </div>
  );
}
