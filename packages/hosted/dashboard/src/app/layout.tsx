// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "sonner";

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
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Without JS the scroll-reveal sections never get .fg-reveal-in, so force
            them visible for no-JS users and crawlers. */}
        <noscript>
          <style>{`.fg-reveal{opacity:1!important;transform:none!important}.fg-hero-item{opacity:1!important;animation:none!important}`}</style>
        </noscript>
      </head>
      <body className="h-full bg-background">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              classNames: {
                toast: "bg-card border border-border text-foreground",
                description: "text-muted-foreground",
                actionButton: "bg-primary text-primary-foreground",
                cancelButton: "bg-muted text-muted-foreground",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
