"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Client-side login form — email magic-link via Supabase Auth.

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, Loader2, CheckCircle } from "lucide-react";

type FormState = "idle" | "loading" | "sent" | "error";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const supabase = createClient();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
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
      <div
        role="status"
        className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 dark:bg-emerald-900/10 p-5 text-center space-y-3"
      >
        <div className="flex justify-center">
          <CheckCircle className="h-8 w-8 text-emerald-400" />
        </div>
        <div>
          <p className="font-medium text-emerald-300">Check your email</p>
          <p className="text-sm text-muted-foreground mt-1">
            We sent a magic link to{" "}
            <span className="font-mono text-foreground">{email}</span>
          </p>
        </div>
        <button
          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
          onClick={() => {
            setState("idle");
            setEmail("");
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
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
          disabled={state === "loading"}
          aria-describedby={state === "error" ? "login-error" : undefined}
          className="h-10"
        />
      </div>

      {state === "error" && (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {errorMsg || "Something went wrong. Please try again."}
        </p>
      )}

      <Button
        type="submit"
        disabled={state === "loading" || !email}
        className="w-full h-10"
      >
        {state === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            Send magic link
          </>
        )}
      </Button>
    </form>
  );
}
