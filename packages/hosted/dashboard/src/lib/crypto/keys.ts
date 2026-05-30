// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// FuseGuard API key generation + hashing helpers.
// Designed for use in Next.js Route Handlers (Node.js crypto available via Web Crypto API).

const FG_KEY_PREFIX = "fg_live_";
const KEY_BYTES = 24; // 192 bits → 32-char base64url

/**
 * Generate a cryptographically random FuseGuard API key.
 * Format: fg_live_<24-byte random base64url>
 * Shown once at creation; stored only as a SHA-256 hash.
 */
export function generateFuseGuardKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const b64 = Buffer.from(bytes).toString("base64url");
  return `${FG_KEY_PREFIX}${b64}`;
}

/**
 * SHA-256 hash of a FuseGuard key for safe storage.
 * Used as the lookup key — never the plaintext.
 */
export async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hashBuffer).toString("hex");
}
