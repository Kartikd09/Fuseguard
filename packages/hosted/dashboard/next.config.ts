import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages adapter: use edge runtime where needed
  // Full CF Pages deploy needs @cloudflare/next-on-pages; for MVP we build standard Next.js
  // and note CF Pages deploy instructions separately.
  reactStrictMode: true,
  // Disable x-powered-by header
  poweredByHeader: false,
  // Skip ESLint during CI build — run it separately with npm run lint
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Workspace root for output file tracing
  outputFileTracingRoot: require("path").join(__dirname, "../../.."),
};

export default nextConfig;
