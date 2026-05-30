// Crypto: AES-256-GCM helpers for encrypting customer Anthropic keys at rest. MIT/OSS
// (ARCHITECTURE §6, §7). Uses Web Crypto (globalThis.crypto.subtle) so it runs in
// Cloudflare Workers and Node 20+. Plaintext customer key exists only transiently in
// memory during a forward; never logged, never persisted.

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12; // 96-bit IV is the recommended size for AES-GCM.
const MASTER_KEY_BYTES = 32; // AES-256.

export interface EncryptedKey {
  ciphertext: string; // base64
  iv: string; // base64 (12 raw bytes)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importMasterKey(masterKeyBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(masterKeyBase64);
  if (raw.length !== MASTER_KEY_BYTES) {
    throw new Error(`master key must be ${MASTER_KEY_BYTES} bytes (AES-256)`);
  }
  return crypto.subtle.importKey("raw", raw, ALGORITHM, false, ["encrypt", "decrypt"]);
}

export async function encryptKey(
  plaintext: string,
  masterKeyBase64: string
): Promise<EncryptedKey> {
  const key = await importMasterKey(masterKeyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);

  const buffer = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);

  return { ciphertext: bytesToBase64(new Uint8Array(buffer)), iv: bytesToBase64(iv) };
}

export async function decryptKey(
  ciphertext: string,
  iv: string,
  masterKeyBase64: string
): Promise<string> {
  const key = await importMasterKey(masterKeyBase64);
  // GCM auth tag failure (wrong key / tampered data) rejects here.
  const buffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: base64ToBytes(iv) },
    key,
    base64ToBytes(ciphertext)
  );

  return new TextDecoder().decode(buffer);
}
