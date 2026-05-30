// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// AES-256-GCM encryption for customer Anthropic keys at rest. SERVER-ONLY — this module
// must never be imported into a client component (it reads FG_MASTER_KEY). Uses Web Crypto
// (available in the Node/Edge server runtime), mirroring packages/core/src/crypto.

const ALGO = "AES-GCM";
const IV_BYTES = 12;

// Return a fresh ArrayBuffer-backed Uint8Array (avoids SharedArrayBuffer typing issues
// with Web Crypto under TS strict).
function fromBase64(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
// Copy into a guaranteed ArrayBuffer (not SharedArrayBuffer) for Web Crypto under TS strict.
function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

async function importMasterKey(masterKeyBase64: string): Promise<CryptoKey> {
  const raw = fromBase64(masterKeyBase64);
  if (raw.byteLength !== 32) {
    throw new Error("FG_MASTER_KEY must be exactly 32 bytes (base64-encoded)");
  }
  return crypto.subtle.importKey("raw", bytesToArrayBuffer(raw), { name: ALGO }, false, ["encrypt", "decrypt"]);
}

/** Encrypt a plaintext secret. Returns base64 ciphertext + base64 IV. */
export async function encryptSecret(
  plaintext: string,
  masterKeyBase64: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importMasterKey(masterKeyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = bytesToArrayBuffer(new TextEncoder().encode(plaintext));
  const buf = await crypto.subtle.encrypt({ name: ALGO, iv: bytesToArrayBuffer(iv) }, key, data);
  return { ciphertext: toBase64(new Uint8Array(buf)), iv: toBase64(iv) };
}

/** Decrypt. Throws on wrong key / tampered ciphertext (GCM auth tag). */
export async function decryptSecret(
  ciphertextBase64: string,
  ivBase64: string,
  masterKeyBase64: string
): Promise<string> {
  const key = await importMasterKey(masterKeyBase64);
  const iv = bytesToArrayBuffer(fromBase64(ivBase64));
  const ct = bytesToArrayBuffer(fromBase64(ciphertextBase64));
  const buf = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ct);
  return new TextDecoder().decode(buf);
}
