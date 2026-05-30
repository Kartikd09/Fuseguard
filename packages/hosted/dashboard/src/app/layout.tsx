// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FuseGuard — AI Agent Budget Control",
  description:
    "The circuit breaker for AI agents. Hard-block runaway LLM spending before it happens.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
