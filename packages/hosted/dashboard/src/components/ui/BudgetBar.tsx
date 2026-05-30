// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Budget utilisation progress bar.

interface BudgetBarProps {
  percent: number; // 0–100+ (can exceed 100 when over budget)
  label?: string;
}

function barColor(percent: number): string {
  if (percent >= 100) return "bg-red-500";
  if (percent >= 80) return "bg-yellow-500";
  return "bg-green-500";
}

export default function BudgetBar({ percent, label }: BudgetBarProps) {
  const clamped = Math.min(percent, 100);
  const color = barColor(percent);

  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{label}</span>
          <span>{percent}%</span>
        </div>
      )}
      <div
        className="w-full h-2 bg-gray-700 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `${percent}% used`}
      >
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
