"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Client-side 2s polling badge — triggers router refresh to re-fetch RSC data.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2000;

export default function DashboardPoller() {
  const router = useRouter();
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    if (!isLive) return;

    const id = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isLive, router]);

  return (
    <button
      type="button"
      onClick={() => setIsLive((v) => !v)}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isLive
          ? "border-emerald-600/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
          : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
      )}
      aria-label={isLive ? "Live updates on — click to pause" : "Live updates paused — click to resume"}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          isLive ? "bg-emerald-600 dark:bg-emerald-400 animate-pulse" : "bg-muted-foreground"
        )}
        aria-hidden="true"
      />
      {isLive ? "Live" : "Paused"}
    </button>
  );
}
