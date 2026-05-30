import { describe, expect, it } from "vitest";
import { generateFuseguardKey, hashFuseguardKey, safeEqual } from "./auth.js";

describe("hashFuseguardKey (SHA-256 hex)", () => {
  it("is deterministic: same key → same hash", async () => {
    const a = await hashFuseguardKey("fg_some-key");
    const b = await hashFuseguardKey("fg_some-key");
    expect(a).toBe(b);
  });

  it("produces a 64-char lowercase hex string", async () => {
    const hash = await hashFuseguardKey("fg_some-key");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different keys → different hashes", async () => {
    const a = await hashFuseguardKey("fg_key-one");
    const b = await hashFuseguardKey("fg_key-two");
    expect(a).not.toBe(b);
  });

  it("matches a known SHA-256 vector", async () => {
    // SHA-256("abc")
    expect(await hashFuseguardKey("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("generateFuseguardKey", () => {
  it("returns a key with the fg_ prefix", async () => {
    const { key } = generateFuseguardKey();
    expect(key.startsWith("fg_")).toBe(true);
  });

  it("returns a hash that matches hashFuseguardKey(key)", async () => {
    const { key, hash } = generateFuseguardKey();
    expect(await hash).toBe(await hashFuseguardKey(key));
  });

  it("has sufficient entropy (>= 32 random bytes, url-safe body)", () => {
    const { key } = generateFuseguardKey();
    const body = key.slice("fg_".length);
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes base64url (no padding) → 43 chars.
    expect(body.length).toBeGreaterThanOrEqual(43);
  });

  it("generates a unique key on each call", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateFuseguardKey().key));
    expect(keys.size).toBe(100);
  });
});

describe("safeEqual (constant-time string compare)", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for differing strings of equal length", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for strings of different length", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });
});
