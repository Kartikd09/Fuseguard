// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Login page — email magic-link auth via Supabase.
import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import { Zap } from "lucide-react";

// Force dynamic rendering — this page checks auth state server-side.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — FuseGuard",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary mb-1">
            <Zap className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              We&apos;ll email you a magic link — no password needed.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          By signing in you agree to our{" "}
          <a href="#" className="underline hover:text-foreground transition-colors">
            Terms
          </a>{" "}
          and{" "}
          <a href="#" className="underline hover:text-foreground transition-colors">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}
