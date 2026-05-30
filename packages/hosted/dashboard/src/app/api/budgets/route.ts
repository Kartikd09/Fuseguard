// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// POST /api/budgets — create a new budget.
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { BudgetScope, LimitType, BudgetWindow } from "@/types";
import { resolveActiveOrgId } from "@/lib/data/queries";
import { rateLimit } from "@/lib/rate-limit";

interface CreateBudgetBody {
  scope: BudgetScope;
  scope_ref: string | null;
  limit_type: LimitType;
  limit_value: number;
  window_type: BudgetWindow;
  window_seconds: number | null;
}

const VALID_SCOPES: BudgetScope[] = ["key", "session"];
const VALID_LIMIT_TYPES: LimitType[] = ["usd", "tokens"];
const VALID_WINDOWS: BudgetWindow[] = ["rolling", "daily", "total"];

function isValidBody(v: unknown): v is CreateBudgetBody {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    VALID_SCOPES.includes(b["scope"] as BudgetScope) &&
    VALID_LIMIT_TYPES.includes(b["limit_type"] as LimitType) &&
    VALID_WINDOWS.includes(b["window_type"] as BudgetWindow) &&
    typeof b["limit_value"] === "number" &&
    (b["scope_ref"] === null || typeof b["scope_ref"] === "string") &&
    (b["window_seconds"] === null || typeof b["window_seconds"] === "number")
  );
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 20 budget writes per minute per user.
  const rl = rateLimit(`budgets:${user.id}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: "Invalid budget parameters" }, { status: 400 });
  }

  if (body.limit_value <= 0) {
    return NextResponse.json({ error: "limit_value must be positive" }, { status: 400 });
  }

  if (body.window_type === "rolling" && (body.window_seconds == null || body.window_seconds < 60)) {
    return NextResponse.json(
      { error: "Rolling window requires window_seconds >= 60" },
      { status: 400 }
    );
  }

  const orgId = await resolveActiveOrgId(supabase);
  if (!orgId) {
    return NextResponse.json({ error: "No organization for user" }, { status: 403 });
  }

  const { error: insertError } = await supabase.from("budgets").insert({
    org_id: orgId,
    scope: body.scope,
    scope_ref: body.scope_ref,
    limit_type: body.limit_type,
    limit_value: body.limit_value,
    window_type: body.window_type,
    window_seconds: body.window_seconds,
    is_active: true,
  });

  if (insertError) {
    console.error("[budgets] insert failed:", insertError);
    return NextResponse.json({ error: "Failed to create budget" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
