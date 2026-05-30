// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// App shell — sidebar nav + main content area for authenticated pages.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/setup", label: "Setup", icon: "🔌" },
  { href: "/keys", label: "API Keys", icon: "🔑" },
  { href: "/budgets", label: "Budgets", icon: "🛡️" },
  { href: "/billing", label: "Billing", icon: "💳" },
] as const;

interface AppShellProps {
  children: React.ReactNode;
  userEmail?: string;
}

export default function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex h-full min-h-screen bg-gray-950">
      {/* Sidebar */}
      <nav
        aria-label="Main navigation"
        className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0"
      >
        <div className="flex flex-col flex-1 bg-gray-900 border-r border-gray-800 px-4 py-6">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 mb-8">
            <span className="text-xl" aria-hidden="true">⚡</span>
            <span className="text-lg font-bold text-white tracking-tight">FuseGuard</span>
          </Link>

          {/* Nav links */}
          <ul className="space-y-1 flex-1">
            {navItems.map(({ href, label, icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-gray-800 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800/50",
                    ].join(" ")}
                  >
                    <span aria-hidden="true">{icon}</span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* User + sign-out */}
          {userEmail && (
            <div className="mt-4 border-t border-gray-800 pt-4">
              <p className="text-xs text-gray-500 truncate mb-2">{userEmail}</p>
              <button
                onClick={() => void handleSignOut()}
                className="w-full text-left text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 md:pl-56 min-h-screen">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
