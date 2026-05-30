// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// DELETE /api/keys/[id] — revoke (soft-delete) a FuseGuard API key.
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify the key belongs to this user's org before revoking (IDOR protection).
  const { data: membership } = await supabase
    .from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 });

  const { error } = await supabase
    .from("api_keys")
    .update({ is_active: false })
    .eq("id", id)
    .eq("org_id", (membership as { org_id: string }).org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
