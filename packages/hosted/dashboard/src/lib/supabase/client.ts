// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Browser-side Supabase client — uses anon key (public), RLS enforces data isolation.
import { createBrowserClient } from "@supabase/ssr";

// These env vars are intentionally NEXT_PUBLIC — the anon key is safe to expose;
// actual data access is controlled by Supabase RLS policies server-side.
// Placeholder values allow the build to succeed without real credentials;
// real values must be set in .env.local for the app to function.
const supabaseUrl =
  process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "placeholder-anon-key";

// Warn at runtime (browser) if the real env vars are not set
if (
  typeof window !== "undefined" &&
  (!process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    !process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"])
) {
  console.warn(
    "[FuseGuard] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in your Supabase project credentials."
  );
}

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
