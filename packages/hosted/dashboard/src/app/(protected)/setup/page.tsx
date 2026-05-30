// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Setup / Onboarding page — proxy URL, x-api-key instructions, cURL snippet.
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchApiKeys, resolveActiveOrgId } from "@/lib/data/queries";
import CopyButton from "@/components/ui/CopyButton";
import EmptyState from "@/components/ui/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { KeyRound, Plug, ArrowRight, AlertTriangle } from "lucide-react";

export const metadata: Metadata = { title: "Setup — FuseGuard" };
export const dynamic = "force-dynamic";

const PROXY_BASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  ? "https://proxy.fuseguard.app"
  : "https://proxy.fuseguard.app";

const SDK_SNIPPET = (keyPrefix: string) => `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  // 1. Point base_url at FuseGuard — that's the only change
  baseURL: "${PROXY_BASE_URL}",
  // 2. Your FuseGuard key (NOT your Anthropic key)
  apiKey: "${keyPrefix}••••••••",
});

// Your Anthropic key lives server-side — FuseGuard decrypts + forwards it.
// You never send it in client code.
const message = await client.messages.create({
  model: "claude-sonnet-4",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, world!" }],
});`;

const CURL_SNIPPET = (keyPrefix: string) => `curl ${PROXY_BASE_URL}/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "x-api-key: ${keyPrefix}••••••••" \\
  -d '{
    "model": "claude-sonnet-4",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello, world!"}]
  }'`;

function StepBadge({ n }: { n: number | string }) {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
      {n}
    </span>
  );
}

export default async function SetupPage() {
  const supabase = await createServerSupabaseClient();
  const orgId = (await resolveActiveOrgId(supabase)) ?? "";
  const keys = await fetchApiKeys(supabase, orgId);
  const firstKey = keys[0];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Setup</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          One line change — redirect your Anthropic client at FuseGuard.
        </p>
      </div>

      {/* Step 1: Create a key if none exist */}
      {!firstKey ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-base">
              <StepBadge n={1} />
              Create your first API key
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You need a FuseGuard API key before you can proxy calls. Your real Anthropic key is
              stored encrypted server-side — you supply it when creating the key.
            </p>
            <Button asChild>
              <Link href="/keys">
                Create API key
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Step 1: Proxy URL */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5 text-base">
                <StepBadge n={1} />
                Your proxy URL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use this as your{" "}
                <code className="fg-code">base_url</code> /{" "}
                <code className="fg-code">baseURL</code> in your Anthropic SDK client.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3">
                <code className="text-sm text-primary font-mono flex-1 select-all break-all">
                  {PROXY_BASE_URL}
                </code>
                <CopyButton value={PROXY_BASE_URL} label="URL" iconOnly />
              </div>
            </CardContent>
          </Card>

          {/* Step 2: FuseGuard key */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5 text-base">
                <StepBadge n={2} />
                Send your FuseGuard key as{" "}
                <code className="font-mono text-sm bg-transparent">x-api-key</code>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pass your <strong className="text-foreground">FuseGuard key</strong> (not your
                Anthropic key) as <code className="fg-code">x-api-key</code>. Your real Anthropic
                key lives encrypted on our servers.
              </p>

              <div className="rounded-lg border border-yellow-700/50 bg-yellow-950/30 dark:bg-yellow-900/10 px-4 py-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-400">
                  <strong>Security note:</strong> Never put your Anthropic API key in client-side
                  code. FuseGuard holds it encrypted server-side and uses it to forward your
                  requests.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Your active key</p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3">
                  <code className="text-sm text-primary/80 font-mono flex-1">
                    {firstKey.fuseguard_key_prefix}••••••••••••••••
                  </code>
                  <span className="text-xs text-muted-foreground">(copy from key creation screen)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SDK snippet */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <StepBadge n={3} />
                  TypeScript / JavaScript
                </CardTitle>
                <CopyButton value={SDK_SNIPPET(firstKey.fuseguard_key_prefix)} label="code" />
              </div>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs text-muted-foreground font-mono leading-relaxed">
                {SDK_SNIPPET(firstKey.fuseguard_key_prefix)}
              </pre>
            </CardContent>
          </Card>

          {/* cURL snippet */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <StepBadge n="↓" />
                  cURL
                </CardTitle>
                <CopyButton value={CURL_SNIPPET(firstKey.fuseguard_key_prefix)} label="curl" />
              </div>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs text-muted-foreground font-mono leading-relaxed">
                {CURL_SNIPPET(firstKey.fuseguard_key_prefix)}
              </pre>
            </CardContent>
          </Card>

          {/* Next steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next steps</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <span className="text-primary mt-0.5 shrink-0 font-bold">→</span>
                  <span>
                    <Link href="/budgets" className="text-foreground underline underline-offset-2 hover:text-muted-foreground transition-colors">
                      Set a budget
                    </Link>{" "}
                    so FuseGuard knows when to block.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-primary mt-0.5 shrink-0 font-bold">→</span>
                  <span>Make a test call — watch it appear on the Overview in ~2s.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-primary mt-0.5 shrink-0 font-bold">→</span>
                  <span>Hit your budget limit — see your first block event (the whole point).</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {/* No keys fallback */}
      {keys.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<KeyRound className="h-6 w-6 text-muted-foreground" />}
              title="No API keys yet"
              description="Create your first key to get your proxy credentials."
              action={
                <Button asChild>
                  <Link href="/keys">
                    <Plug className="h-4 w-4" />
                    Create API key
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
