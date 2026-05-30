// Task 5: BudgetDO reserve/reconcile over transactional storage. TDD RED → GREEN.
// Task 6: Hard kill (per-key budget FR-3) — 402 budget_exceeded.
// Task 7: Per-session budget (FR-2/FR-3) — dual scope, compensating release.
// Task 8: Concurrency — N=50 concurrent calls, only 1 passes.
// Task 9: Post-flight reconciliation — actual < worst case → counter reflects actual.
// Task 11: Loop detection — ≥10 identical within 60s → 402 loop_detected.
//
// The BudgetDO is tested via direct method calls (no full Worker harness needed).
// Concurrency relies on DO single-thread serialization — simulated by sequential direct
// calls in this test suite, with a comment on the production guarantee.

import { describe, expect, it } from "vitest";
import { BudgetDO } from "./budget-do.js";

// ── Minimal DO storage shim ────────────────────────────────────────────────────────────────────
// The DurableObjectStorage interface (transactional) is too heavy to import from CF types in
// unit tests. We provide a minimal in-memory shim that covers get/put/transaction semantics.

class FakeStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async transaction<T>(closure: (txn: FakeStorage) => Promise<T>): Promise<T> {
    // Single-threaded shim: no real rollback needed for unit tests.
    return closure(this);
  }
}

class FakeState {
  readonly storage: FakeStorage;
  constructor() {
    this.storage = new FakeStorage();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
    return fn();
  }
}

function makeDO(_limitUsd: number): BudgetDO {
  const state = new FakeState() as unknown as DurableObjectState;
  const env = {
    ANTHROPIC_UPSTREAM: "https://api.anthropic.com",
    FAILURE_MODE: "closed" as const,
  };
  // Initialise with a budget limit
  const doInstance = new BudgetDO(state, env);
  // Use the internal HTTP protocol to initialise the budget
  return doInstance;
}

async function doReserve(
  doInstance: BudgetDO,
  estCost: number
): Promise<{ ok: boolean; blocked: boolean; reservationId?: string }> {
  const req = new Request("https://do/reserve", {
    method: "POST",
    body: JSON.stringify({ estCost }),
    headers: { "content-type": "application/json" },
  });
  const res = await doInstance.fetch(req);
  const json = (await res.json()) as { ok: boolean; blocked: boolean; reservationId?: string };
  return json;
}

async function doReconcile(
  doInstance: BudgetDO,
  reservationId: string,
  actualCost: number
): Promise<{ ok: boolean }> {
  const req = new Request("https://do/reconcile", {
    method: "POST",
    body: JSON.stringify({ reservationId, actualCost }),
    headers: { "content-type": "application/json" },
  });
  const res = await doInstance.fetch(req);
  return (await res.json()) as { ok: boolean };
}

async function doInit(doInstance: BudgetDO, limitUsd: number): Promise<void> {
  const req = new Request("https://do/init", {
    method: "POST",
    body: JSON.stringify({ limitUsd }),
    headers: { "content-type": "application/json" },
  });
  await doInstance.fetch(req);
}

async function doStatus(doInstance: BudgetDO): Promise<{
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  reservedUsd: number;
}> {
  const req = new Request("https://do/status", { method: "GET" });
  const res = await doInstance.fetch(req);
  return (await res.json()) as {
    limitUsd: number;
    spentUsd: number;
    remainingUsd: number;
    reservedUsd: number;
  };
}

async function doRecordLoop(
  doInstance: BudgetDO,
  reqHash: string
): Promise<{ loop: boolean; count: number }> {
  const req = new Request("https://do/loop/record", {
    method: "POST",
    body: JSON.stringify({ reqHash }),
    headers: { "content-type": "application/json" },
  });
  const res = await doInstance.fetch(req);
  return (await res.json()) as { loop: boolean; count: number };
}

async function doRelease(doInstance: BudgetDO, reservationId: string): Promise<{ ok: boolean }> {
  const req = new Request("https://do/release", {
    method: "POST",
    body: JSON.stringify({ reservationId }),
    headers: { "content-type": "application/json" },
  });
  const res = await doInstance.fetch(req);
  return (await res.json()) as { ok: boolean };
}

// ── Helper factory ─────────────────────────────────────────────────────────────────────────────
async function makeInitialisedDO(limitUsd: number): Promise<BudgetDO> {
  const instance = makeDO(limitUsd);
  await doInit(instance, limitUsd);
  return instance;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Task 5: reserve / reconcile
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("BudgetDO — reserve", () => {
  it("allows a reserve within the budget limit", async () => {
    const do_ = await makeInitialisedDO(1.0);
    const result = await doReserve(do_, 0.5);
    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.reservationId).toBeDefined();
  });

  it("returns blocked=true when reservation would exceed the limit", async () => {
    const do_ = await makeInitialisedDO(0.1);
    const result = await doReserve(do_, 0.5); // 0.5 > 0.1 limit
    expect(result.blocked).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("decrements the remaining budget after a successful reserve", async () => {
    const do_ = await makeInitialisedDO(1.0);
    await doReserve(do_, 0.3);
    const status = await doStatus(do_);
    // reservedUsd should reflect the hold
    expect(status.reservedUsd).toBeCloseTo(0.3, 6);
    expect(status.remainingUsd).toBeCloseTo(0.7, 6);
  });

  it("blocks exactly when cumulative reserved hits the limit", async () => {
    const do_ = await makeInitialisedDO(1.0);
    const first = await doReserve(do_, 0.6);
    expect(first.blocked).toBe(false);
    const second = await doReserve(do_, 0.5); // 0.6+0.5=1.1 > 1.0
    expect(second.blocked).toBe(true);
  });
});

describe("BudgetDO — reconcile", () => {
  it("releases the difference when actual < worst case", async () => {
    const do_ = await makeInitialisedDO(1.0);
    const { reservationId } = await doReserve(do_, 0.6);
    await doReconcile(do_, reservationId!, 0.2); // actual was 0.2, not 0.6
    const status = await doStatus(do_);
    expect(status.spentUsd).toBeCloseTo(0.2, 6);
    expect(status.reservedUsd).toBeCloseTo(0, 6);
    // freed up 0.4 from the overestimate
    expect(status.remainingUsd).toBeCloseTo(0.8, 6);
  });

  it("charges actual when actual == worst case (no release)", async () => {
    const do_ = await makeInitialisedDO(1.0);
    const { reservationId } = await doReserve(do_, 0.5);
    await doReconcile(do_, reservationId!, 0.5);
    const status = await doStatus(do_);
    expect(status.spentUsd).toBeCloseTo(0.5, 6);
    expect(status.reservedUsd).toBeCloseTo(0, 6);
  });

  it("is idempotent: reconciling twice on same reservationId doesn't double-charge", async () => {
    const do_ = await makeInitialisedDO(1.0);
    const { reservationId } = await doReserve(do_, 0.5);
    await doReconcile(do_, reservationId!, 0.2);
    await doReconcile(do_, reservationId!, 0.2); // second call is no-op
    const status = await doStatus(do_);
    expect(status.spentUsd).toBeCloseTo(0.2, 6); // not 0.4
  });
});

describe("BudgetDO — release (compensating release for session rollback)", () => {
  it("releases a reservation without charging spent", async () => {
    const do_ = await makeInitialisedDO(1.0);
    const { reservationId } = await doReserve(do_, 0.5);
    await doRelease(do_, reservationId!);
    const status = await doStatus(do_);
    expect(status.spentUsd).toBeCloseTo(0, 6);
    expect(status.reservedUsd).toBeCloseTo(0, 6);
    expect(status.remainingUsd).toBeCloseTo(1.0, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Task 8 / Finding #4: Concurrency — N=50 concurrent calls, EXACTLY 1 passes, EXACTLY 49 blocked.
// In production the DO is single-threaded (CF DO serialization guarantee). Here we simulate
// by driving 50 reserve calls against a $1 budget with a $1 reservation each. Exactly 1
// must pass; exactly 49 must be blocked. The previous ≤1/≥49 assertions allowed 0 passes,
// which would be a false positive hiding a complete budget blockade. Fixed to exact counts.
//
// NOTE: The in-process enqueue() queue is a TEST-ONLY fidelity shim emulating DO serialization.
// The production guarantee is CF's DO input-gates (single-threaded execution per DO instance).
// A real Miniflare/workerd concurrency harness is a separate task (out of scope for this PR).
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("BudgetDO — concurrency (DO serial guarantee simulated)", () => {
  it("N=50 calls against budget with room for 1 → EXACTLY 1 passes, EXACTLY 49 blocked", async () => {
    const do_ = await makeInitialisedDO(1.0);
    // Fire all 50 reserve calls. In production these would be serialised by the DO runtime.
    // In this test they run sequentially via the internal enqueue() shim (same semantic as DO serialization).
    const results = await Promise.all(
      Array.from({ length: 50 }, () => doReserve(do_, 1.0))
    );

    const passed = results.filter((r) => !r.blocked).length;
    const blocked = results.filter((r) => r.blocked).length;

    // EXACT assertions — not ≤1/≥49, which passes even when 0 succeed.
    expect(passed).toBe(1);
    expect(blocked).toBe(49);
  });

  it("counter never goes negative after 50 blocked calls", async () => {
    const do_ = await makeInitialisedDO(1.0);
    await Promise.all(Array.from({ length: 50 }, () => doReserve(do_, 1.0)));
    const status = await doStatus(do_);
    expect(status.remainingUsd).toBeGreaterThanOrEqual(0);
    expect(status.spentUsd).toBeGreaterThanOrEqual(0);
  });

  // Finding #4: interleaved reserve+reconcile must not allow overspend (final spent ≤ limit, remaining ≥ 0).
  it("interleaved reserve+reconcile: final spent ≤ limit and remaining ≥ 0 (no overspend)", async () => {
    const LIMIT = 1.0;
    const do_ = await makeInitialisedDO(LIMIT);

    // Interleave: 25 pairs of (reserve $0.5 then reconcile $0.3) and 25 reserve $0.5 only.
    // All fired concurrently — the DO's serial queue must serialize them correctly.
    const ops = [
      ...Array.from({ length: 25 }, async () => {
        const r = await doReserve(do_, 0.5);
        if (!r.blocked && r.reservationId != null) {
          await doReconcile(do_, r.reservationId, 0.3);
        }
      }),
      ...Array.from({ length: 25 }, () => doReserve(do_, 0.5)),
    ];
    await Promise.all(ops);

    const status = await doStatus(do_);
    expect(status.spentUsd).toBeLessThanOrEqual(LIMIT + 1e-9); // no overspend
    expect(status.remainingUsd).toBeGreaterThanOrEqual(-1e-9);  // no negative balance
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Task 11: Loop detection via DO
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("BudgetDO — loop detection", () => {
  it("allows below-threshold calls (count < 10)", async () => {
    const do_ = await makeInitialisedDO(100);
    let result = { loop: false, count: 0 };
    for (let i = 0; i < 9; i++) {
      result = await doRecordLoop(do_, "hash-abc");
    }
    expect(result.loop).toBe(false);
    expect(result.count).toBe(9);
  });

  it("flags loop at exactly the threshold (count >= 10)", async () => {
    const do_ = await makeInitialisedDO(100);
    let result = { loop: false, count: 0 };
    for (let i = 0; i < 10; i++) {
      result = await doRecordLoop(do_, "hash-abc");
    }
    expect(result.loop).toBe(true);
    expect(result.count).toBe(10);
  });

  it("different hashes do not cross-trigger each other", async () => {
    const do_ = await makeInitialisedDO(100);
    for (let i = 0; i < 9; i++) {
      await doRecordLoop(do_, "hash-A");
    }
    const other = await doRecordLoop(do_, "hash-B");
    expect(other.loop).toBe(false);
    expect(other.count).toBe(1);
  });

  // Finding #5: LoopDetector ring buffer is currently in-memory only.
  // It IS now persisted to DO storage alongside the budget state (see budget-do.ts).
  // This test documents that loop counts survive a simulated DO eviction
  // (a new BudgetDO instance reading from the same storage should see prior counts).
  it("loop detector state persists across DO eviction (same storage, new instance)", async () => {
    // Step 1: record 9 hashes in the first DO instance.
    const fakeState = new FakeState();
    const env = { ANTHROPIC_UPSTREAM: "https://api.anthropic.com", FAILURE_MODE: "closed" as const };
    const do1 = new BudgetDO(fakeState as unknown as DurableObjectState, env);
    await doInit(do1, 100);
    for (let i = 0; i < 9; i++) {
      await doRecordLoop(do1, "hash-persist");
    }

    // Step 2: simulate eviction — create a new BudgetDO instance on the SAME storage.
    const do2 = new BudgetDO(fakeState as unknown as DurableObjectState, env);
    const result = await doRecordLoop(do2, "hash-persist");

    // The 10th call on the new instance must trigger loop detection (count persisted).
    expect(result.loop).toBe(true);
    expect(result.count).toBe(10);
  });
});
