// Transparent forward to Anthropic. MIT/OSS (ARCHITECTURE §2, §6).
// SSRF protection: upstream host is ANTHROPIC_HOST — a compile-time constant, NEVER
// derived from request input. Any header/param attempting to redirect upstream is ignored.

// The upstream host is a constant — never from request input (ARCHITECTURE §6, SSRF).
export const ANTHROPIC_HOST = "api.anthropic.com";

const ANTHROPIC_BASE = `https://${ANTHROPIC_HOST}`;

// Headers that are FuseGuard-internal and must NEVER be forwarded upstream.
const STRIPPED_HEADER_PREFIXES = ["x-fuseguard-"];

function buildUpstreamHeaders(
  incoming: Headers,
  decryptedAnthropicKey: string
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [name, value] of incoming.entries()) {
    const lower = name.toLowerCase();
    // Drop x-api-key (replaced below) and all x-fuseguard-* headers.
    if (lower === "x-api-key") continue;
    if (STRIPPED_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix))) continue;
    headers[lower] = value;
  }

  // Use the decrypted customer key, not the FuseGuard key the client sent.
  headers["x-api-key"] = decryptedAnthropicKey;

  return headers;
}

/**
 * Forward the incoming request to api.anthropic.com (SSRF-constant upstream), substituting
 * the decrypted customer Anthropic key. Returns the upstream Response unchanged.
 *
 * @param incoming    The original client request to FuseGuard.
 * @param anthropicKey The decrypted customer Anthropic API key to forward.
 * @param fetchFn     Injected fetch — mock in tests, globalThis.fetch in production.
 */
export async function forwardToAnthropic(
  incoming: Request,
  anthropicKey: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<Response> {
  const incomingUrl = new URL(incoming.url);
  // SSRF: reconstruct URL using the constant host only — path from the incoming request.
  // Query params are NOT forwarded; any attacker-supplied upstream redirect in query params
  // is silently dropped. The host is NEVER derived from request input (ARCHITECTURE §6).
  const upstreamUrl = new URL(incomingUrl.pathname, ANTHROPIC_BASE);

  const headers = buildUpstreamHeaders(incoming.headers, anthropicKey);

  return fetchFn(upstreamUrl.toString(), {
    method: incoming.method,
    headers,
    body: incoming.body,
    // Cloudflare Workers pass duplex:half for streaming; keep it undefined in tests.
    ...(incoming.body != null ? { duplex: "half" as const } : {}),
  });
}
