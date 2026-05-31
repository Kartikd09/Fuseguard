// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Full-page WebGL fluid simulation that trails the cursor ("hand in water").
// Guards: disabled on prefers-reduced-motion and touch devices (no cursor);
// paused while the tab is hidden to save GPU/battery.
"use client";

import { useEffect, useRef } from "react";

export default function FluidCursor() {
  // Outer wrapper owns the fixed full-viewport positioning. The lib forces its
  // container to position:relative + display:flex, so we hand it a dedicated inner
  // div sized to 100% — otherwise it overrides our `fixed` and collapses the layout.
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = innerRef.current;
    if (container == null) return;

    // a11y + device guards — skip entirely when motion is unwanted or there's no cursor.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (reduceMotion || isTouch) return;

    let sim: { start: () => void; stop: () => void } | null = null;
    let cancelled = false;

    // Dynamic import keeps the WebGL bundle out of the initial page load.
    void import("webgl-fluid-enhanced").then(({ default: WebGLFluidEnhanced }) => {
      if (cancelled || innerRef.current == null) return;
      const instance = new WebGLFluidEnhanced(innerRef.current);
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
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* Lib sets this inner div to position:relative + flex and sizes the canvas to it. */}
      <div ref={innerRef} className="h-full w-full" />
    </div>
  );
}
