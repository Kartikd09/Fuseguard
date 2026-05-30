// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Setup / Onboarding page — proxy URL, x-api-key instructions, cURL snippet.
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchApiKeys } from "@/lib/data/queries";
import CopyButton from "@/components/ui/CopyButton";
import EmptyState from "@/components/ui/EmptyState";
import Link from "next/link";

export const metadata: Metadata = { title: "Setup — FuseGuard" };
export const dynamic = "force-dynamic";

const PROXY_BASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  ? "https://proxy.fuseguard.app"
  : "https://proxy.fuseguard.app"; // replace with actual hosted URL

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

export default async function SetupPage() {
  const supabase = await createServerSupabaseClient();
  const keys = await fetchApiKeys(supabase);
  const firstKey = keys[0];

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Setup</h1>
        <p className="mt-1 text-gray-400">
          One line change — redirect your Anthropic client at FuseGuard.
        </p>
      </div>

      {/* Step 1: Create a key if none exist */}
      {!firstKey ? (
        <div className="fg-card space-y-4">
          <h2 className="text-base font-semibold text-white">
            Step 1 — Create your first API key
          </h2>
          <p className="text-sm text-gray-400">
            You need a FuseGuard API key before you can proxy calls. Your real Anthropic key is
            stored encrypted server-side — you supply it when creating the key.
          </p>
          <Link
            href="/keys"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Create API key →
          </Link>
        </div>
      ) : (
        <>
          {/* Step 1: Proxy URL */}
          <section aria-labelledby="step1-heading" className="fg-card space-y-3">
            <h2 id="step1-heading" className="text-base font-semibold text-white flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold shrink-0">1</span>
              Your proxy URL
            </h2>
            <p className="text-sm text-gray-400">
              Use this as your <code className="fg-code">base_url</code> / <code className="fg-code">baseURL</code> in your Anthropic SDK client.
            </p>
            <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
              <code className="text-sm text-green-400 font-mono flex-1 select-all break-all">
                {PROXY_BASE_URL}
              </code>
              <CopyButton value={PROXY_BASE_URL} label="URL" />
            </div>
          </section>

          {/* Step 2: Your FuseGuard key */}
          <section aria-labelledby="step2-heading" className="fg-card space-y-3">
            <h2 id="step2-heading" className="text-base font-semibold text-white flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold shrink-0">2</span>
              Send your FuseGuard key as <code className="font-mono text-sm">x-api-key</code>
            </h2>
            <p className="text-sm text-gray-400">
              Pass your <strong className="text-white">FuseGuard key</strong> (not your Anthropic key) as{" "}
              <code className="fg-code">x-api-key</code>. Your real Anthropic key lives encrypted on our servers.
            </p>

            <div className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3">
              <p className="text-xs text-yellow-400">
                <strong>Security note:</strong> Never put your Anthropic API key in client-side code.
                FuseGuard holds it encrypted server-side and uses it to forward your requests.
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-gray-500">Your active key</p>
              <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                <code className="text-sm text-blue-400 font-mono flex-1">
                  {firstKey.fuseguard_key_prefix}••••••••••••••••
                </code>
                <span className="text-xs text-gray-500">(copy from key creation screen)</span>
              </div>
            </div>
          </section>

          {/* SDK snippet */}
          <section aria-labelledby="sdk-heading" className="fg-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="sdk-heading" className="text-base font-semibold text-white flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold shrink-0">3</span>
                TypeScript / JavaScript
              </h2>
              <CopyButton value={SDK_SNIPPET(firstKey.fuseguard_key_prefix)} label="code" />
            </div>
            <pre className="overflow-x-auto rounded-lg bg-gray-800 p-4 text-xs text-gray-300 font-mono leading-relaxed">
              {SDK_SNIPPET(firstKey.fuseguard_key_prefix)}
            </pre>
          </section>

          {/* cURL snippet */}
          <section aria-labelledby="curl-heading" className="fg-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="curl-heading" className="text-base font-semibold text-white flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-white text-xs font-bold shrink-0">↓</span>
                cURL
              </h2>
              <CopyButton value={CURL_SNIPPET(firstKey.fuseguard_key_prefix)} label="curl" />
            </div>
            <pre className="overflow-x-auto rounded-lg bg-gray-800 p-4 text-xs text-gray-300 font-mono leading-relaxed">
              {CURL_SNIPPET(firstKey.fuseguard_key_prefix)}
            </pre>
          </section>

          {/* Next steps */}
          <div className="fg-card space-y-2">
            <h2 className="text-base font-semibold text-white">Next steps</h2>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">→</span>
                <span>
                  <Link href="/budgets" className="text-white underline hover:text-gray-300">
                    Set a budget
                  </Link>{" "}
                  so FuseGuard knows when to block.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">→</span>
                <span>Make a test call — watch it appear on the Overview in ~2s.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">→</span>
                <span>Hit your budget limit — see your first block event (the whole point).</span>
              </li>
            </ul>
          </div>
        </>
      )}

      {/* No keys fallback */}
      {keys.length === 0 && (
        <EmptyState
          icon="🔑"
          title="No API keys yet"
          description="Create your first key to get your proxy credentials."
          action={
            <Link
              href="/keys"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Create API key →
            </Link>
          }
        />
      )}
    </div>
  );
}
