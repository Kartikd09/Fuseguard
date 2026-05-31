// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// App shell — sidebar nav + main content area for authenticated pages.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import OrgSwitcher from "@/components/layout/OrgSwitcher";
import { cn } from "@/lib/utils";
import type { OrgOption } from "@/lib/data/queries";
import {
  LayoutDashboard,
  Plug,
  KeyRound,
  Shield,
  CreditCard,
  Zap,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/setup", label: "Setup", icon: Plug },
  { href: "/keys", label: "API Keys", icon: KeyRound },
  { href: "/budgets", label: "Budgets", icon: Shield },
  { href: "/billing", label: "Billing", icon: CreditCard },
] as const;

interface AppShellProps {
  children: React.ReactNode;
  userEmail?: string;
  /** All orgs the user belongs to — undefined or length<=1 hides the switcher. */
  orgs?: OrgOption[];
  /** Currently active org id — required when orgs.length > 1 to pre-select the dropdown. */
  activeOrgId?: string;
}

export default function AppShell({ children, userEmail, orgs, activeOrgId }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="flex h-full min-h-screen bg-background">
      {/* Sidebar */}
      <nav
        aria-label="Main navigation"
        className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0"
      >
        <div className="flex flex-col flex-1 border-r border-border bg-card px-3 py-5">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 mb-7 px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary shrink-0">
              <Zap className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">FuseGuard</span>
          </Link>

          {/* Nav links */}
          <ul className="space-y-0.5 flex-1" role="list">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}
                      aria-hidden="true"
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* User footer */}
          <div className="border-t border-border pt-3 mt-3 space-y-2">
            {/* Org switcher — only when user belongs to multiple orgs */}
            {orgs && orgs.length > 1 && activeOrgId && (
              <div className="px-2">
                <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
              </div>
            )}
            <div className="flex items-center justify-between px-2">
              <ThemeToggle />
              {userEmail && (
                <button
                  onClick={() => void handleSignOut()}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              )}
            </div>
            {userEmail && (
              <p className="px-2 text-xs text-muted-foreground truncate">{userEmail}</p>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 h-14">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <Zap className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">FuseGuard</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile nav strip */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-card"
      >
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main content */}
      <main className="flex-1 md:pl-56 min-h-screen pt-14 md:pt-0 pb-16 md:pb-0">
        <div className="p-5 md:p-8 max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
