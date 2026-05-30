import { describe, expect, it } from "vitest";
import { decryptKey, encryptKey } from "./index.js";

// AES-256 needs a 32-byte master key; tests generate their own (no hardcoded secrets).
function randomMasterKeyBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

describe("encryptKey / decryptKey (AES-256-GCM)", () => {
  it("round-trips: decrypt(encrypt(x)) === x", async () => {
    const master = randomMasterKeyBase64();
    const plaintext = "sk-ant-api03-EXAMPLE-customer-key-do-not-use";

    const { ciphertext, iv } = await encryptKey(plaintext, master);
    const decrypted = await decryptKey(ciphertext, iv, master);

    expect(decrypted).toBe(plaintext);
  });

  it("produces base64 ciphertext and a 12-byte (base64) IV", async () => {
    const master = randomMasterKeyBase64();
    const { ciphertext, iv } = await encryptKey("hello world", master);

    expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(iv).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // 12 raw bytes → 16 base64 chars.
    expect(atob(iv).length).toBe(12);
  });

  it("uses a fresh random IV on every encrypt (same input differs)", async () => {
    const master = randomMasterKeyBase64();
    const a = await encryptKey("same-input", master);
    const b = await encryptKey("same-input", master);

    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("throws when decrypting with the wrong master key", async () => {
    const master = randomMasterKeyBase64();
    const wrong = randomMasterKeyBase64();
    const { ciphertext, iv } = await encryptKey("secret-value", master);

    await expect(decryptKey(ciphertext, iv, wrong)).rejects.toThrow();
  });

  it("throws when the ciphertext has been tampered with", async () => {
    const master = randomMasterKeyBase64();
    const { ciphertext, iv } = await encryptKey("secret-value", master);

    const raw = atob(ciphertext);
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    bytes.set([(bytes[0] ?? 0) ^ 0xff], 0); // flip a bit → GCM auth tag must reject
    const tampered = btoa(String.fromCharCode(...bytes));

    await expect(decryptKey(tampered, iv, master)).rejects.toThrow();
  });

  it("rejects a master key that is not 32 bytes", async () => {
    const shortKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    await expect(encryptKey("x", shortKey)).rejects.toThrow();
  });
});
