// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// PATCH /api/budgets/[id] — update a budget. DELETE /api/budgets/[id] — deactivate.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveActiveOrgId } from "@/lib/data/queries";
import type { BudgetScope, LimitType, BudgetWindow } from "@/types";

export const runtime = "edge";

interface UpdateBudgetBody {
  scope?: BudgetScope;
  scope_ref?: string | null;
  limit_type?: LimitType;
  limit_value?: number;
  window_type?: BudgetWindow;
  window_seconds?: number | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get("fg_active_org")?.value ?? null;
  const orgId = await resolveActiveOrgId(supabase, cookieOrgId);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 });

  let body: UpdateBudgetBody;
  try { body = await request.json() as UpdateBudgetBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = {};
  if (body.scope !== undefined) updates["scope"] = body.scope;
  if (body.scope_ref !== undefined) updates["scope_ref"] = body.scope_ref;
  if (body.limit_type !== undefined) updates["limit_type"] = body.limit_type;
  if (body.limit_value !== undefined) updates["limit_value"] = body.limit_value;
  if (body.window_type !== undefined) updates["window_type"] = body.window_type;
  if (body.window_seconds !== undefined) updates["window_seconds"] = body.window_seconds;

  const { error } = await supabase.from("budgets").update(updates).eq("id", id).eq("org_id", orgId);
  if (error) {
    console.error("[budgets] update failed:", error);
    return NextResponse.json({ error: "Failed to update budget" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get("fg_active_org")?.value ?? null;
  const orgId = await resolveActiveOrgId(supabase, cookieOrgId);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 403 });

  const { error } = await supabase.from("budgets").update({ is_active: false }).eq("id", id).eq("org_id", orgId);
  if (error) {
    console.error("[budgets] delete failed:", error);
    return NextResponse.json({ error: "Failed to delete budget" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
