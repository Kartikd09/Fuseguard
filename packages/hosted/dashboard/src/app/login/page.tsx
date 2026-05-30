// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Login page — email magic-link auth via Supabase.
import type { Metadata } from "next";
import LoginForm from "./LoginForm";

// Force dynamic rendering — this page checks auth state server-side.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — FuseGuard",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / brand */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-2xl" aria-hidden="true">⚡</span>
            <span className="text-xl font-bold text-white tracking-tight">FuseGuard</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Sign in</h1>
          <p className="mt-2 text-sm text-gray-400">
            We&apos;ll email you a magic link — no password needed.
          </p>
        </div>

        <LoginForm />

        <p className="text-center text-xs text-gray-500">
          By signing in you agree to our{" "}
          <a href="#" className="underline hover:text-gray-300">
            Terms
          </a>{" "}
          and{" "}
          <a href="#" className="underline hover:text-gray-300">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}
