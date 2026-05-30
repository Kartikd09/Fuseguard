// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Supabase magic-link callback — exchanges the auth code for a session.
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "edge";

// Only allow internal, single-slash paths — blocks open-redirect (//evil.com, /\evil.com,
// absolute URLs). Anything else falls back to /dashboard.
function safeNext(raw: string | null): string {
  if (!raw || !/^\/(?!\/)(?!\\)/.test(raw)) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    // No code param — redirect to login with an error hint
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
