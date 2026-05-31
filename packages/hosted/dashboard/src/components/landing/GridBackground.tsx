// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Faint masked grid with an optional top glow. Fixed, behind content (z-0,
// pointer-events:none). Extracted from the landing hero so login + dashboard
// can share one source of truth.

type GridBackgroundProps = {
  /** Render the orange top glow. Off for data-dense surfaces (dashboard). */
  glow?: boolean;
};

export default function GridBackground({ glow = false }: GridBackgroundProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(130,140,160,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(130,140,160,0.18) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        maskImage: "radial-gradient(ellipse 75% 70% at 50% 45%, transparent 35%, black 95%)",
        WebkitMaskImage: "radial-gradient(ellipse 75% 70% at 50% 45%, transparent 35%, black 95%)",
      }}
    >
      {glow && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: "-140px",
            height: "520px",
            width: "780px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(232,76,48,0.42), rgba(232,76,48,0.12) 45%, transparent 70%)",
            filter: "blur(70px)",
          }}
        />
      )}
    </div>
  );
}
