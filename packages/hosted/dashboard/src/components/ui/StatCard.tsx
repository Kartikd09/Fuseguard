// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// KPI stat card — shadcn Card-based with trend delta and optional sparkline area.
import { cn } from "@/lib/utils";
import { Card, CardContent } from "./card";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  variant?: "default" | "danger" | "warning" | "success";
  trend?: number; // % delta, positive = up, negative = down
  icon?: React.ReactNode;
}

const variantValueClass = {
  default: "text-foreground",
  danger: "text-destructive",
  warning: "text-yellow-400",
  success: "text-emerald-400",
} as const;

function TrendIndicator({ trend }: { trend: number }) {
  if (trend === 0) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  if (trend > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
}

export default function StatCard({
  label,
  value,
  sub,
  variant = "default",
  trend,
  icon,
}: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p
              className={cn(
                "text-3xl font-bold tabular-nums tracking-tight",
                variantValueClass[variant]
              )}
            >
              {value}
            </p>
            {sub && (
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            )}
          </div>
          {icon && (
            <div className="rounded-lg bg-muted p-2 text-muted-foreground shrink-0">
              {icon}
            </div>
          )}
        </div>
        {trend !== undefined && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <TrendIndicator trend={trend} />
            <span
              className={cn(
                "font-medium",
                trend > 0 ? "text-emerald-400" : trend < 0 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {trend > 0 ? "+" : ""}{trend}%
            </span>
            <span className="text-muted-foreground">vs yesterday</span>
          </div>
        )}
      </CardContent>
      {/* Subtle accent stripe at card bottom for variants */}
      {variant !== "default" && (
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-0.5",
            variant === "danger" && "bg-destructive/60",
            variant === "warning" && "bg-yellow-500/60",
            variant === "success" && "bg-emerald-500/60"
          )}
        />
      )}
    </Card>
  );
}
