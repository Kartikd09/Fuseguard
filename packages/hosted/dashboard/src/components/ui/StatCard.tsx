// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Metric stat card for the dashboard overview.

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  variant?: "default" | "danger" | "warning" | "success";
}

const variantClasses = {
  default: "text-white",
  danger: "text-red-400",
  warning: "text-yellow-400",
  success: "text-green-400",
} as const;

export default function StatCard({
  label,
  value,
  sub,
  variant = "default",
}: StatCardProps) {
  return (
    <div className="fg-card">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${variantClasses[variant]}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
