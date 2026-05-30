"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Copy-to-clipboard button with confirmation state.

import { useState } from "react";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export default function CopyButton({ value, label = "Copy", className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available in all contexts
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`text-xs font-medium transition-colors ${
        copied
          ? "text-green-400"
          : "text-gray-400 hover:text-white"
      } ${className}`}
      aria-label={copied ? "Copied!" : `Copy ${label}`}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}
