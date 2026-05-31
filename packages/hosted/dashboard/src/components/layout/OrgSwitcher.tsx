// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// OrgSwitcher — shown in the sidebar only when the user belongs to more than one org.
// Selecting an org POSTs to /api/active-org (server validates membership before
// setting the httpOnly cookie) then reloads so all server components re-render with
// the new org context.
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { OrgOption } from "@/lib/data/queries";
import { cn } from "@/lib/utils";
import { ChevronsUpDown } from "lucide-react";

interface OrgSwitcherProps {
  orgs: OrgOption[];
  activeOrgId: string;
}

export default function OrgSwitcher({ orgs, activeOrgId }: OrgSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Only render when user has multiple orgs — caller should guard too, but double-check.
  if (orgs.length <= 1) return null;

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const orgId = e.target.value;
    if (orgId === activeOrgId) return;

    try {
      const res = await fetch("/api/active-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });

      if (!res.ok) {
        console.error("[OrgSwitcher] switch rejected:", res.status);
        return;
      }

      // Refresh all server components so they re-fetch under the new org.
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      console.error("[OrgSwitcher] fetch error:", err);
    }
  }

  return (
    <div className="relative w-full">
      <select
        value={activeOrgId}
        onChange={(e) => void handleChange(e)}
        disabled={isPending}
        aria-label="Switch organization"
        className={cn(
          "w-full appearance-none rounded-md border border-border bg-muted/50 px-3 py-1.5",
          "text-xs text-foreground truncate pr-7",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "hover:bg-muted transition-colors cursor-pointer"
        )}
      >
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
            {org.role !== "owner" ? " (member)" : ""}
          </option>
        ))}
      </select>
      <ChevronsUpDown
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}
