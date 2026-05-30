// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// FuseGuard API key generation + hashing helpers.
// Edge-runtime safe — uses Web Crypto + Web-standard encoding (no Node Buffer).

const FG_KEY_PREFIX = "fg_live_";
const KEY_BYTES = 24; // 192 bits

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Generate a cryptographically random FuseGuard API key.
 * Format: fg_live_<24-byte random base64url>. Shown once; stored only as a SHA-256 hash.
 */
export function generateFuseGuardKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  return `${FG_KEY_PREFIX}${toBase64Url(bytes)}`;
}

/** SHA-256 hash of a FuseGuard key for safe storage. Lookup key — never the plaintext. */
export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(hashBuffer));
}
