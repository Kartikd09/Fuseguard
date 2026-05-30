"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Create API key modal — collects label + Anthropic key, shows FG key once.
// The raw Anthropic key is sent to a server action / API route which encrypts it server-side.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface CreateKeyButtonProps {
  keyCount: number;
}

type ModalState = "closed" | "form" | "created";

interface CreatedKey {
  label: string;
  fuseGuardKey: string; // shown once, never stored client-side after dismiss
}

export default function CreateKeyButton({ keyCount }: CreateKeyButtonProps) {
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [label, setLabel] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const router = useRouter();

  // Free-tier limit: 1 key
  const isAtFreeLimit = keyCount >= 1;

  function openModal() {
    setModalState("form");
    setLabel("");
    setAnthropicKey("");
    setError("");
  }

  function closeModal() {
    setModalState("closed");
    setCreatedKey(null);
    setAnthropicKey(""); // clear key from state immediately
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), anthropicKey }),
      });

      const json = (await res.json()) as { fuseGuardKey?: string; error?: string };

      if (!res.ok) {
        setError(json.error ?? "Failed to create key");
        setIsSubmitting(false);
        return;
      }

      // Clear the Anthropic key from state immediately after successful submission
      setAnthropicKey("");

      setCreatedKey({
        label: label.trim(),
        fuseGuardKey: json.fuseGuardKey ?? "",
      });
      setModalState("created");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDone() {
    setCreatedKey(null);
    closeModal();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition-colors"
        title={
          isAtFreeLimit
            ? "Free tier allows 1 key. Upgrade to Pro for unlimited."
            : "Create a new API key"
        }
      >
        + Create key
        {isAtFreeLimit && (
          <span className="fg-badge-warning ml-1">Pro</span>
        )}
      </button>

      {/* Modal backdrop */}
      {modalState !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-key-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 p-6 space-y-6">
            {modalState === "form" && (
              <>
                <h2 id="create-key-title" className="text-lg font-bold text-white">
                  Create API key
                </h2>
                {isAtFreeLimit && (
                  <div className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-400">
                    Free tier allows 1 key.{" "}
                    <a href="/billing" className="underline">Upgrade to Pro</a> for unlimited.
                  </div>
                )}
                <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
                  <div>
                    <label htmlFor="key-label" className="block text-sm font-medium text-gray-300 mb-1">
                      Label
                    </label>
                    <input
                      id="key-label"
                      type="text"
                      required
                      maxLength={64}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="production"
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label htmlFor="anthropic-key" className="block text-sm font-medium text-gray-300 mb-1">
                      Your Anthropic API key
                    </label>
                    <input
                      id="anthropic-key"
                      type="password"
                      required
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder="sk-ant-…"
                      autoComplete="off"
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                      disabled={isSubmitting}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Encrypted with AES-256-GCM. Never stored in plaintext, never logged, never returned.
                    </p>
                  </div>

                  {error && (
                    <p role="alert" className="text-sm text-red-400">
                      {error}
                    </p>
                  )}

                  <div className="flex gap-3 justify-end pt-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !label || !anthropicKey}
                      className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
                    >
                      {isSubmitting ? "Creating…" : "Create"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {modalState === "created" && createdKey && (
              <>
                <div className="text-center space-y-2">
                  <span className="text-4xl" aria-hidden="true">🎉</span>
                  <h2 id="create-key-title" className="text-lg font-bold text-white">
                    Key created — copy it now!
                  </h2>
                  <p className="text-sm text-yellow-400">
                    This is the <strong>only time</strong> you&apos;ll see your FuseGuard key.
                    We store only a hash.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Your FuseGuard key for &quot;{createdKey.label}&quot;</p>
                  <div className="flex items-center gap-2 rounded-lg bg-gray-800 border border-gray-700 px-4 py-3">
                    <code className="font-mono text-sm text-green-400 flex-1 break-all select-all">
                      {createdKey.fuseGuardKey}
                    </code>
                  </div>
                  <p className="text-xs text-gray-500">
                    Use this as <code className="fg-code">x-api-key</code> / <code className="fg-code">apiKey</code> in your SDK config.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDone}
                  className="w-full rounded-lg bg-gray-700 hover:bg-gray-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  I&apos;ve saved it — close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
