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
  // Defense-in-depth security headers (users paste a live Anthropic secret here).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "connect-src 'self' https://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
