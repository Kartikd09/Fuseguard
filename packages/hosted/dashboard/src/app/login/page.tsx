// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Login page — email magic-link auth via Supabase.
import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import Logo from "@/components/landing/Logo";
import AuroraBackground from "@/components/landing/AuroraBackground";

// Force dynamic rendering — this page checks auth state server-side.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — FuseGuard",
};

export default function LoginPage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-4">
      <AuroraBackground />
      <div className="fg-card-in relative z-10 w-full max-w-sm space-y-8">
        {/* Logo / brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary mb-1 text-primary-foreground shadow-lg shadow-primary/30">
            <Logo size={26} decorative />
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

        {/* Frosted glass card */}
        <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-xl backdrop-blur-xl">
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
