// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Soft drifting brand-colored blobs ("aurora") for the login page. Fixed,
// behind content (z-0, pointer-events:none). Motion is paused under
// prefers-reduced-motion via the .fg-aurora-* classes in globals.css.

export default function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background">
      {/* warm orange blob — top-left drift */}
      <div
        className="fg-aurora-a absolute -left-32 -top-32 h-[34rem] w-[34rem] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(232,76,48,0.38), rgba(232,76,48,0.10) 45%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      {/* secondary ember blob — bottom-right drift */}
      <div
        className="fg-aurora-b absolute -right-40 -bottom-40 h-[38rem] w-[38rem] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(242,121,94,0.26), rgba(199,58,34,0.10) 50%, transparent 72%)",
          filter: "blur(100px)",
        }}
      />
      {/* faint dot texture + center vignette so the card reads cleanly */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(130,140,160,0.10) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, transparent 30%, black 90%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, transparent 30%, black 90%)",
        }}
      />
    </div>
  );
}
