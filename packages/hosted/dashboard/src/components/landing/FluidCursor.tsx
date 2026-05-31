// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Full-page WebGL fluid simulation that trails the cursor ("hand in water").
// Guards: disabled on prefers-reduced-motion and touch devices (no cursor);
// paused while the tab is hidden to save GPU/battery.
"use client";

import { useEffect, useRef } from "react";

export default function FluidCursor() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container == null) return;

    // a11y + device guards — skip entirely when motion is unwanted or there's no cursor.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (reduceMotion || isTouch) return;

    let sim: { start: () => void; stop: () => void } | null = null;
    let cancelled = false;

    // Dynamic import keeps the WebGL bundle out of the initial page load.
    void import("webgl-fluid-enhanced").then(({ default: WebGLFluidEnhanced }) => {
      if (cancelled || containerRef.current == null) return;
      const instance = new WebGLFluidEnhanced(containerRef.current);
      instance.setConfig({
        // Brand-tinted dye on a transparent canvas so the grid + glow show through.
        colorPalette: ["#E84C30", "#F2795E", "#C73A22"],
        transparent: true,
        backgroundColor: "#000000",
        densityDissipation: 3.5, // fade trails quickly so it stays subtle
        velocityDissipation: 2,
        splatRadius: 0.2,
        splatForce: 6000,
        curl: 20,
        pressure: 0.8,
        bloom: false, // cheaper; the page already has a glow layer
        sunrays: false,
        hover: true,
      } as never);
      instance.start();
      sim = instance;
    });

    // Pause the sim when the tab is backgrounded.
    const onVisibility = () => {
      if (sim == null) return;
      if (document.hidden) sim.stop();
      else sim.start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sim?.stop();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
