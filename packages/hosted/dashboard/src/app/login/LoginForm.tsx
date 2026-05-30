"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Client-side login form — Google OAuth + email magic-link via Supabase Auth.

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, Loader2, CheckCircle } from "lucide-react";

type FormState = "idle" | "loading" | "sent" | "error";

// Google "G" SVG — inline to avoid external image dependency.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const supabase = createClient();

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setErrorMsg(error.message);
      setGoogleLoading(false);
    }
    // On success Supabase redirects — no need to reset loading state.
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setState("error");
      setErrorMsg(error.message);
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-lg border border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/30 p-5 text-center space-y-3">
        <div className="flex justify-center">
          <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="font-medium text-emerald-800 dark:text-emerald-300">Check your email</p>
          <p className="text-sm text-muted-foreground mt-1">
            We sent a magic link to{" "}
            <span className="font-mono text-foreground">{email}</span>
          </p>
        </div>
        <button
          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
          onClick={() => { setState("idle"); setEmail(""); }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Google OAuth */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-10 gap-2"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || state === "loading"}
      >
        {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </Button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">or continue with email</span>
        </div>
      </div>

      {/* Magic link form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={state === "loading" || googleLoading}
            aria-describedby={state === "error" ? "login-error" : undefined}
            className="h-10"
          />
        </div>

        {(state === "error" || errorMsg) && (
          <p id="login-error" role="alert" className="text-sm text-destructive">
            {errorMsg || "Something went wrong. Please try again."}
          </p>
        )}

        <Button
          type="submit"
          disabled={state === "loading" || !email || googleLoading}
          className="w-full h-10"
        >
          {state === "loading" ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
          ) : (
            <><Mail className="h-4 w-4" />Send magic link</>
          )}
        </Button>
      </form>
    </div>
  );
}
