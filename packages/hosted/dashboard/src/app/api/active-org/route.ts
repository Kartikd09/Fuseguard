// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// POST /api/active-org — sets the fg_active_org httpOnly cookie after
// validating server-side that the authenticated user is a member of the
// requested org. Never trusts the client-supplied org_id (IDOR defense).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "edge";

const COOKIE_NAME = "fg_active_org";
// 30-day TTL; re-validated on every resolveActiveOrgId call regardless.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

interface SwitchOrgBody {
  orgId: string;
}

function isSwitchOrgBody(v: unknown): v is SwitchOrgBody {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>)["orgId"] === "string" &&
    (v as Record<string, unknown>)["orgId"] !== ""
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isSwitchOrgBody(body)) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const { orgId } = body;

  // Validate: user must be a member of the requested org. The explicit user_id filter is
  // defense-in-depth — RLS already scopes this, but the filter keeps the check correct even
  // if the client context ever changes (e.g. service-role) (F7).
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
  }

  if (!membership) {
    // User is not a member of that org — reject silently with 403.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Membership confirmed — set httpOnly cookie so subsequent server renders use this org.
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    // secure: true in production; Next.js/CF Pages handles HTTPS so this is always secure.
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true });
}
