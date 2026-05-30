// @vitest-environment node
import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "../encrypt";

// 32-byte base64 master key for tests (not a real secret).
const MASTER = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");

describe("encryptSecret / decryptSecret (AES-256-GCM)", () => {
  it("round-trips a secret", async () => {
    const { ciphertext, iv } = await encryptSecret("sk-ant-secret-value", MASTER);
    expect(ciphertext).not.toContain("sk-ant"); // never plaintext
    expect(await decryptSecret(ciphertext, iv, MASTER)).toBe("sk-ant-secret-value");
  });

  it("uses a fresh IV each time (different ciphertext for same input)", async () => {
    const a = await encryptSecret("x", MASTER);
    const b = await encryptSecret("x", MASTER);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt with the wrong master key", async () => {
    const { ciphertext, iv } = await encryptSecret("secret", MASTER);
    const wrong = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
    await expect(decryptSecret(ciphertext, iv, wrong)).rejects.toThrow();
  });

  it("rejects a master key that is not 32 bytes", async () => {
    const short = Buffer.from(new Uint8Array(16)).toString("base64");
    await expect(encryptSecret("x", short)).rejects.toThrow(/32 bytes/);
  });

  it("fails to decrypt tampered ciphertext (GCM auth tag)", async () => {
    const { ciphertext, iv } = await encryptSecret("secret", MASTER);
    const bytes = Buffer.from(ciphertext, "base64");
    bytes[0]! ^= 0xff;
    await expect(decryptSecret(bytes.toString("base64"), iv, MASTER)).rejects.toThrow();
  });
});
