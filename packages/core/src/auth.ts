// Auth: FuseGuard API key generation + hashing. MIT/OSS (ARCHITECTURE §6).
// Clients send a random FuseGuard key; it is shown once at creation and stored ONLY
// as a SHA-256 hash (fuseguard_key_hash). Lookups are by hash. Uses Web Crypto so it
// runs in Cloudflare Workers and Node 20+. Never log the plaintext key.

const KEY_PREFIX = "fg_";
const KEY_RANDOM_BYTES = 32; // 256 bits of entropy.

export interface GeneratedFuseguardKey {
  key: string; // shown once to the client; never stored
  hash: Promise<string>; // the only value to persist
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

export async function hashFuseguardKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest));
}

export function generateFuseguardKey(): GeneratedFuseguardKey {
  const random = crypto.getRandomValues(new Uint8Array(KEY_RANDOM_BYTES));
  const key = `${KEY_PREFIX}${toBase64Url(random)}`;
  return { key, hash: hashFuseguardKey(key) };
}

// Constant-time comparison: never short-circuit on first mismatch, so timing does not
// leak how much of a hash matched. Length mismatch returns false (lengths are public).
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
