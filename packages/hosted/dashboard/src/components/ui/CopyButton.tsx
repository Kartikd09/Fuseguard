"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Copy-to-clipboard button with confirmation state — polished with lucide icons.

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  size?: "default" | "sm" | "icon";
  iconOnly?: boolean;
}

export default function CopyButton({
  value,
  label = "Copy",
  className = "",
  size = "sm",
  iconOnly = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available in all contexts
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          copied && "text-emerald-400",
          className
        )}
        aria-label={copied ? "Copied!" : `Copy ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={() => void handleCopy()}
      className={cn(
        "gap-1.5 transition-colors",
        copied ? "text-emerald-400" : "text-muted-foreground hover:text-foreground",
        className
      )}
      aria-label={copied ? "Copied!" : `Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
