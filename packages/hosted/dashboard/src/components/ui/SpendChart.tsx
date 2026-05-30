"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Spend-over-time area chart — recharts with design-token colors.

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SpendDataPoint {
  label: string;
  spend: number;
  blocked: number;
}

interface SpendChartProps {
  data: SpendDataPoint[];
  height?: number;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1.5 font-medium">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: entry.color }}
          />
          <span className="text-foreground capitalize">{entry.name}:</span>
          <span className="font-medium tabular-nums text-foreground">
            {entry.name === "spend" ? `$${entry.value.toFixed(4)}` : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SpendChart({ data, height = 220 }: SpendChartProps) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#e84c30" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#e84c30" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="blockedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => {
            if (v === 0) return "$0";
            if (v < 0.001) return `$${v.toFixed(5)}`;
            if (v < 0.01) return `$${v.toFixed(4)}`;
            if (v < 1) return `$${v.toFixed(3)}`;
            return `$${v.toFixed(2)}`;
          }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="spend"
          stroke="#e84c30"
          strokeWidth={2}
          fill="url(#spendGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
