"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Client-side login form — email magic-link via Supabase Auth.

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

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
        // Redirect to auth callback which exchanges the token and then sends to /dashboard
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
        className="rounded-xl border border-green-800 bg-green-900/20 p-6 text-center space-y-2"
      >
        <p className="text-green-400 font-medium">Check your email</p>
        <p className="text-sm text-gray-400">
          We sent a magic link to{" "}
          <span className="text-white font-mono">{email}</span>. Click it to
          sign in.
        </p>
        <button
          className="mt-4 text-xs text-gray-500 underline hover:text-gray-300"
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
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-300 mb-1.5"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          disabled={state === "loading"}
          aria-describedby={state === "error" ? "login-error" : undefined}
        />
      </div>

      {state === "error" && (
        <p id="login-error" role="alert" className="text-sm text-red-400">
          {errorMsg || "Something went wrong. Please try again."}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "loading" || !email}
        className="w-full rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors"
      >
        {state === "loading" ? "Sending…" : "Send magic link"}
      </button>
    </form>
  );
}
