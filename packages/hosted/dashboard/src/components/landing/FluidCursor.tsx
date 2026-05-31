// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Full-page WebGL fluid simulation that trails the cursor ("hand in water").
// The lib binds mousemove to its own canvas, but our canvas sits behind content
// (z-0, pointer-events:none) so it never receives events. Instead we listen on
// window and drive the sim via splatAtLocation — works through the whole page.
// Guards: disabled on prefers-reduced-motion and touch devices; paused when hidden.
"use client";

import { useEffect, useRef } from "react";
import type WebGLFluidEnhanced from "webgl-fluid-enhanced";

type FluidInstance = InstanceType<typeof WebGLFluidEnhanced>;

export default function FluidCursor() {
  // Outer wrapper owns the fixed positioning; the lib forces its container to
  // position:relative + flex, so it gets a dedicated inner div sized to 100%.
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (innerRef.current == null) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (reduceMotion || isTouch) return;

    let sim: FluidInstance | null = null;
    let cancelled = false;
    let lastX = 0;
    let lastY = 0;
    let primed = false;

    // Drive the sim from window-level mouse moves so the trail follows the cursor
    // everywhere, including over page content that sits above the canvas.
    const onMouseMove = (e: MouseEvent) => {
      if (sim == null) return;
      const dx = primed ? e.clientX - lastX : 0;
      const dy = primed ? e.clientY - lastY : 0;
      lastX = e.clientX;
      lastY = e.clientY;
      primed = true;
      // The lib normalizes splat x by canvas.width (physical px) but y by
      // clientHeight (CSS px), so x must be scaled by devicePixelRatio to land
      // under the cursor on HiDPI displays. splatForce scales the delta.
      sim.splatAtLocation(e.clientX * window.devicePixelRatio, e.clientY, dx * 4, dy * 4);
    };

    void import("webgl-fluid-enhanced").then(({ default: WebGLFluidEnhanced }) => {
      if (cancelled || innerRef.current == null) return;
      const instance = new WebGLFluidEnhanced(innerRef.current);
      instance.setConfig({
        colorPalette: ["#E84C30", "#F2795E", "#C73A22"],
        transparent: true,
        backgroundColor: "#000000",
        densityDissipation: 6, // fade fast — leave only a brief wisp
        velocityDissipation: 3,
        splatRadius: 0.1, // thin trail, not big clouds
        splatForce: 2400, // gentle, less spread
        curl: 8, // calmer, less turbulent swirl
        pressure: 0.6,
        bloom: false,
        sunrays: false,
        hover: false, // we feed positions ourselves via splatAtLocation
      });
      instance.start();
      sim = instance;
      window.addEventListener("mousemove", onMouseMove);
    });

    // Pause via togglePause (cheap flag) rather than stop/start, which would
    // reallocate all GPU framebuffers on every tab re-focus. Track our own
    // paused flag so we only toggle when the visibility state actually flips.
    let paused = false;
    const onVisibility = () => {
      if (sim == null) return;
      if (document.hidden && !paused) {
        sim.togglePause();
        paused = true;
      } else if (!document.hidden && paused) {
        sim.togglePause();
        paused = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", onVisibility);
      sim?.stop();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div ref={innerRef} className="h-full w-full" />
    </div>
  );
}
