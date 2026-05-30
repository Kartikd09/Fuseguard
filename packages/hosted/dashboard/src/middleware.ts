// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Supabase auth session refresh middleware — runs on every request before rendering.
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static assets)
     * - _next/image (image optimization)
     * - favicon.ico
     * - Public auth callback route
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback).*)",
  ],
};
