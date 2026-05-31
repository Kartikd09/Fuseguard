// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Protected route group layout — wraps all authenticated pages with AppShell.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveActiveOrgId, fetchUserOrgs } from "@/lib/data/queries";
import AppShell from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get("fg_active_org")?.value ?? null;

  // Fetch orgs + resolve active in parallel for minimal latency.
  const [orgs, activeOrgId] = await Promise.all([
    fetchUserOrgs(supabase),
    resolveActiveOrgId(supabase, cookieOrgId),
  ]);

  return (
    <AppShell
      userEmail={user.email}
      orgs={orgs}
      activeOrgId={activeOrgId ?? undefined}
    >
      {children}
    </AppShell>
  );
}
