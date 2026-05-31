// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Scroll-reveal wrapper: fades + rises its children when they enter the viewport.
// Uses IntersectionObserver (no deps). Respects prefers-reduced-motion via the
// `.fg-reveal` CSS (animation disabled there — content shows immediately).
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger delay in ms before this element animates in. */
  delay?: number;
  className?: string;
}

export default function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el == null) return;
    // If already in view on mount (above the fold), reveal without waiting.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Drop the promoted compositor layer once the reveal transition finishes so we
  // don't keep a will-change layer alive for the page lifetime.
  const onTransitionEnd = () => {
    if (ref.current != null) ref.current.style.willChange = "auto";
  };

  return (
    <div
      ref={ref}
      className={`fg-reveal${shown ? " fg-reveal-in" : ""}${className ? ` ${className}` : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      onTransitionEnd={onTransitionEnd}
    >
      {children}
    </div>
  );
}
