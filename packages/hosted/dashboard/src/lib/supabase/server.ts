// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Server-side Supabase client for Next.js Server Components and Route Handlers.
// Uses cookie-based session from @supabase/ssr — reads the user's auth token from cookies.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Placeholder values allow the build to succeed without real credentials.
// In production, these must be set as real Supabase project values.
const supabaseUrl =
  process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "placeholder-anon-key";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll called from a Server Component; cookie mutations are no-ops there.
          // The middleware will handle session refresh.
        }
      },
    },
  });
}
