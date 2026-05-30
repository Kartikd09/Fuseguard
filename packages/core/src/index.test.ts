import { describe, expect, it } from "vitest";
import { resolveSelfhostKey } from "./index.js";

// Finding #2: the self-host key resolution must FAIL CLOSED — never return an
// Infinity budget or an empty Anthropic key. Unconfigured / mismatched / invalid → null.
describe("resolveSelfhostKey (fail-closed Phase-1 self-host lookup)", () => {
  const HASH = "a".repeat(64);
  const fullCfg = {
    SELFHOST_FUSEGUARD_KEY_HASH: HASH,
    SELFHOST_ANTHROPIC_KEY: "sk-ant-real",
    SELFHOST_BUDGET_USD: "10",
  };

  it("returns the configured key + finite budget when fully configured and key matches", () => {
    const r = resolveSelfhostKey(HASH, fullCfg);
    expect(r).not.toBeNull();
    expect(r?.anthropicKey).toBe("sk-ant-real");
    expect(r?.limitUsd).toBe(10);
    expect(Number.isFinite(r?.limitUsd)).toBe(true);
  });

  it("fails closed (null) when not configured", () => {
    expect(resolveSelfhostKey(HASH, {})).toBeNull();
    expect(resolveSelfhostKey(HASH, { SELFHOST_FUSEGUARD_KEY_HASH: HASH })).toBeNull();
    expect(resolveSelfhostKey(HASH, { SELFHOST_FUSEGUARD_KEY_HASH: HASH, SELFHOST_ANTHROPIC_KEY: "x" })).toBeNull();
  });

  it("fails closed when the presented key hash does not match", () => {
    expect(resolveSelfhostKey("b".repeat(64), fullCfg)).toBeNull();
  });

  it("fails closed on a non-numeric, zero, or negative budget (never Infinity)", () => {
    expect(resolveSelfhostKey(HASH, { ...fullCfg, SELFHOST_BUDGET_USD: "abc" })).toBeNull();
    expect(resolveSelfhostKey(HASH, { ...fullCfg, SELFHOST_BUDGET_USD: "0" })).toBeNull();
    expect(resolveSelfhostKey(HASH, { ...fullCfg, SELFHOST_BUDGET_USD: "-5" })).toBeNull();
    expect(resolveSelfhostKey(HASH, { ...fullCfg, SELFHOST_BUDGET_USD: "Infinity" })).toBeNull();
  });
});
