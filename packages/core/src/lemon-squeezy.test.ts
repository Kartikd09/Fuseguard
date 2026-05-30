import { describe, it, expect } from "vitest";
import {
  isHandledEvent,
  mapLsStatus,
  verifyLsSignature,
  computeLsSignature,
  isStaleEvent,
  LS_HANDLED_EVENTS,
} from "./lemon-squeezy.js";

const SECRET = "test_webhook_secret_40_chars_xxxxxxxxxxx";

describe("isHandledEvent", () => {
  it("accepts subscription lifecycle events", () => {
    expect(isHandledEvent("subscription_created")).toBe(true);
    expect(isHandledEvent("subscription_updated")).toBe(true);
    expect(isHandledEvent("subscription_cancelled")).toBe(true);
    expect(isHandledEvent("subscription_expired")).toBe(true);
    expect(isHandledEvent("subscription_resumed")).toBe(true);
    expect(isHandledEvent("subscription_paused")).toBe(true);
    expect(isHandledEvent("subscription_unpaused")).toBe(true);
  });

  it("rejects unrelated events (no accidental downgrade)", () => {
    expect(isHandledEvent("subscription_payment_success")).toBe(false);
    expect(isHandledEvent("order_created")).toBe(false);
    expect(isHandledEvent("")).toBe(false);
    expect(isHandledEvent("garbage")).toBe(false);
  });

  it("LS_HANDLED_EVENTS has exactly the 7 lifecycle events", () => {
    expect(LS_HANDLED_EVENTS.size).toBe(7);
  });
});

describe("mapLsStatus", () => {
  it("maps active states to active (including trial)", () => {
    expect(mapLsStatus("active")).toBe("active");
    expect(mapLsStatus("on_trial")).toBe("active");
    expect(mapLsStatus("trialing")).toBe("active");
  });

  it("maps payment-issue states to past_due", () => {
    expect(mapLsStatus("past_due")).toBe("past_due");
    expect(mapLsStatus("unpaid")).toBe("past_due");
    expect(mapLsStatus("paused")).toBe("past_due");
  });

  it("maps terminal states to cancelled", () => {
    expect(mapLsStatus("cancelled")).toBe("cancelled");
    expect(mapLsStatus("expired")).toBe("cancelled");
  });

  it("defaults unknown/undefined status to cancelled (conservative downgrade)", () => {
    expect(mapLsStatus("weird_new_status")).toBe("cancelled");
    expect(mapLsStatus(undefined)).toBe("cancelled");
    expect(mapLsStatus("")).toBe("cancelled");
  });
});

describe("verifyLsSignature", () => {
  it("accepts a correctly-signed body", async () => {
    const body = JSON.stringify({ meta: { event_name: "subscription_created" } });
    const sig = await computeLsSignature(body, SECRET);
    expect(await verifyLsSignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const body = JSON.stringify({ meta: { event_name: "subscription_created" } });
    const sig = await computeLsSignature(body, SECRET);
    expect(await verifyLsSignature(body + "x", sig, SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const body = "payload";
    const sig = await computeLsSignature(body, "wrong_secret");
    expect(await verifyLsSignature(body, sig, SECRET)).toBe(false);
  });

  it("rejects empty signature without throwing", async () => {
    expect(await verifyLsSignature("body", "", SECRET)).toBe(false);
  });

  it("rejects non-hex signature without throwing", async () => {
    expect(await verifyLsSignature("body", "zzzz", SECRET)).toBe(false);
  });

  it("rejects odd-length hex signature without throwing", async () => {
    expect(await verifyLsSignature("body", "abc", SECRET)).toBe(false);
  });
});

describe("isStaleEvent (replay guard)", () => {
  const T1 = "2026-05-31T10:00:00Z";
  const T2 = "2026-05-31T11:00:00Z";

  it("newer event is not stale", () => {
    expect(isStaleEvent(T1, T2)).toBe(false);
  });

  it("older event is stale", () => {
    expect(isStaleEvent(T2, T1)).toBe(true);
  });

  it("equal-timestamp event is stale (prevents same-second reorder)", () => {
    expect(isStaleEvent(T1, T1)).toBe(true);
  });

  it("missing event timestamp is treated as stale (fail-safe)", () => {
    expect(isStaleEvent(T1, undefined)).toBe(true);
    expect(isStaleEvent(T1, null)).toBe(true);
  });

  it("invalid event timestamp is stale", () => {
    expect(isStaleEvent(T1, "not-a-date")).toBe(true);
  });

  it("no prior record → event is not stale (first write)", () => {
    expect(isStaleEvent(null, T1)).toBe(false);
    expect(isStaleEvent(undefined, T1)).toBe(false);
  });
});
