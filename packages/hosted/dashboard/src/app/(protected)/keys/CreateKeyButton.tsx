"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Create API key modal — collects label + Anthropic key, shows FG key once.
// The raw Anthropic key is sent to a server action / API route which encrypts it server-side.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import CopyButton from "@/components/ui/CopyButton";
import { Plus, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface CreateKeyButtonProps {
  keyCount: number;
  maxKeys: number; // -1 = unlimited (Pro)
}

type ModalState = "closed" | "form" | "created";

interface CreatedKey {
  label: string;
  fuseGuardKey: string;
}

export default function CreateKeyButton({ keyCount, maxKeys }: CreateKeyButtonProps) {
  const [modalState, setModalState] = useState<ModalState>("closed");
  const [label, setLabel] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const router = useRouter();

  // -1 = unlimited (Pro). Otherwise at-limit when count reaches the plan ceiling.
  const isAtKeyLimit = maxKeys !== -1 && keyCount >= maxKeys;

  function openModal() {
    setModalState("form");
    setLabel("");
    setAnthropicKey("");
    setError("");
  }

  function closeModal() {
    setModalState("closed");
    setCreatedKey(null);
    setAnthropicKey("");
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

      const json = (await res.json()) as { fuseGuardKey?: string; error?: string; upgrade?: boolean };

      if (!res.ok) {
        if (json.upgrade) {
          // Free tier limit — redirect to billing
          router.push("/billing");
          return;
        }
        setError(json.error ?? "Failed to create key");
        setIsSubmitting(false);
        return;
      }

      setAnthropicKey("");
      setCreatedKey({ label: label.trim(), fuseGuardKey: json.fuseGuardKey ?? "" });
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
      <Button
        type="button"
        onClick={openModal}
        title={
          isAtKeyLimit
            ? "Free tier allows 1 key. Upgrade to Pro for unlimited."
            : "Create a new API key"
        }
      >
        <Plus className="h-4 w-4" />
        Create key
        {isAtKeyLimit && (
          <Badge variant="warning" className="ml-1">Pro</Badge>
        )}
      </Button>

      {/* Create form dialog */}
      <Dialog open={modalState === "form"} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Your Anthropic key is encrypted server-side and never returned.
            </DialogDescription>
          </DialogHeader>

          {isAtKeyLimit && (
            <div className="rounded-lg border border-yellow-700/50 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Free tier allows 1 key.{" "}
                <a href="/billing" className="underline hover:text-yellow-300">Upgrade to Pro</a>{" "}
                for unlimited.
              </span>
            </div>
          )}

          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="key-label">Label</Label>
              <Input
                id="key-label"
                type="text"
                required
                maxLength={64}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="production"
                disabled={isSubmitting}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="anthropic-key">Your Anthropic API key</Label>
              <Input
                id="anthropic-key"
                type="password"
                required
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-…"
                autoComplete="off"
                className="h-10 font-mono"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Encrypted with AES-256-GCM. Never stored in plaintext or logged.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={closeModal} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !label || !anthropicKey}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Created key reveal dialog */}
      <Dialog open={modalState === "created"} onOpenChange={(open) => !open && handleDone()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
            </div>
            <DialogTitle className="text-center">Key created — copy it now!</DialogTitle>
            <DialogDescription className="text-center text-yellow-400/90">
              This is the <strong>only time</strong> you&apos;ll see your FuseGuard key. We store
              only a hash.
            </DialogDescription>
          </DialogHeader>

          {createdKey && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Your FuseGuard key for &quot;{createdKey.label}&quot;
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3">
                <code className="font-mono text-sm text-emerald-400 flex-1 break-all select-all">
                  {createdKey.fuseGuardKey}
                </code>
                <CopyButton value={createdKey.fuseGuardKey} iconOnly label="key" />
              </div>
              <p className="text-xs text-muted-foreground">
                Use this as <code className="fg-code">x-api-key</code> /{" "}
                <code className="fg-code">apiKey</code> in your SDK config.
              </p>
            </div>
          )}

          <Button onClick={handleDone} variant="secondary" className="w-full">
            I&apos;ve saved it — close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
