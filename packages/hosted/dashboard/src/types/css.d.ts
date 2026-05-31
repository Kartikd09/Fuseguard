// TS 6 no longer implicitly allows untyped side-effect CSS imports (`import "./globals.css"`).
// Declare CSS modules so the Next.js global stylesheet import typechecks.
declare module "*.css";
