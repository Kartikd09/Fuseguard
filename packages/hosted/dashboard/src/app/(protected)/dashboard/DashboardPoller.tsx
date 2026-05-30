"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Client-side 2s polling badge — triggers router refresh to re-fetch RSC data.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
      className="flex items-center gap-2 rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
      aria-label={isLive ? "Live updates on — click to pause" : "Live updates paused — click to resume"}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isLive ? "bg-green-400 animate-pulse" : "bg-gray-600"
        }`}
        aria-hidden="true"
      />
      {isLive ? "Live" : "Paused"}
    </button>
  );
}
