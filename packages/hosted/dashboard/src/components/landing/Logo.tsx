// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// FuseGuard mark: a circuit trace with a deliberate break (the "blown fuse") at
// center, framed by a shield bracket. Monoline, inherits color via currentColor
// so it themes with --primary. Used in nav + footer.

type LogoProps = {
  /** Pixel size of the square mark. */
  size?: number;
  className?: string;
  /** Hide from AT when a visible "FuseGuard" text label sits beside it. */
  decorative?: boolean;
};

export default function Logo({ size = 28, className, decorative = false }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable={false}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "FuseGuard" })}
      className={className}
    >
      {/* Shield bracket framing the fuse */}
      <path d="M16 3 L27 7 V15 C27 22 22 27 16 29 C10 27 5 22 5 15 V7 Z" opacity={0.45} />
      {/* Circuit trace entering left, broken gap mid-stroke, exiting right */}
      <path d="M8 16 H14" />
      <path d="M18 16 H24" />
      {/* The break — two short stubs facing the gap (the blown fuse) */}
      <path d="M14 13 V19" />
      <path d="M18 13 V19" />
      {/* Spark node at the break */}
      <circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
