"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const RANGES = [
  { value: "24h", label: "24h" },
  { value: "7d",  label: "7d" },
  { value: "30d", label: "30d" },
];

export default function RangeSelector({ current }: { current: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(range: string) {
    const p = new URLSearchParams(params.toString());
    p.set("range", range);
    startTransition(() => {
      router.push(`/dashboard?${p.toString()}`);
    });
  }

  return (
    <div className={cn(
      "flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/40 transition-opacity",
      isPending && "opacity-60"
    )}>
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => select(r.value)}
          disabled={isPending}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1",
            current === r.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {isPending && current !== r.value && r.value === params.get("range") && (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          )}
          {r.label}
        </button>
      ))}
    </div>
  );
}
