// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// DELETE /api/keys/[id] — revoke (soft-delete) a FuseGuard API key.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveActiveOrgId } from "@/lib/data/queries";


export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify the key belongs to this user's org before revoking (IDOR protection).
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get("fg_active_org")?.value ?? null;
  const orgId = await resolveActiveOrgId(supabase, cookieOrgId);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 });

  const { error } = await supabase
    .from("api_keys")
    .update({ is_active: false })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    console.error("[keys] revoke failed:", error);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
