// Budget Durable Object — authoritative per-key / per-session spend counter.
// MIT/OSS (ARCHITECTURE §2, §7). One DO instance per budget scope serializes all access,
// so read-decide-reserve is atomic by construction — no races (ARCHITECTURE §4c).
//
// HTTP protocol (internal, Worker ↔ DO):
//   POST /init      { limitUsd }                   → { ok }
//   POST /reserve   { estCost }                    → { ok, blocked, reservationId? }
//   POST /reconcile { reservationId, actualCost }  → { ok }
//   POST /release   { reservationId }              → { ok }
//   GET  /status                                   → { limitUsd, spentUsd, remainingUsd, reservedUsd }
//   POST /loop/record { reqHash }                  → { loop, count }

import { requestHash as _requestHash } from "./loop/index.js";

export type FailureMode = "open" | "closed";

export interface Env {
  readonly ANTHROPIC_UPSTREAM: string;
  readonly FAILURE_MODE: FailureMode;
}

// C2/H3 FIX: reservations carry their creation time so stale orphans self-heal.
// A worker crash between reserve and reconcile would otherwise hold the budget forever.
const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface Reservation {
  readonly estCost: number;
  readonly createdAt: number; // epoch ms — set at reserve time
  reconciled: boolean;
}

interface BudgetState {
  limitUsd: number;
  spentUsd: number;
  reservations: Record<string, Reservation>;
}

// Finding #5: persist the LoopDetector ring buffer alongside the budget state.
// Without persistence, the ring buffer resets on every DO eviction/restart — a client
// could accumulate 9 requests, wait for eviction, then repeat indefinitely without
// triggering loop detection. Persisting to DO storage closes this bypass.
interface LoopEntry {
  hash: string;
  ts: number;
}

const LOOP_STORAGE_KEY = "loop_entries";

function makeReservationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function totalReserved(reservations: Record<string, Reservation>): number {
  const now = Date.now();
  let total = 0;
  for (const r of Object.values(reservations)) {
    // C2/H3 FIX: exclude stale unreconciled reservations so crashed-mid-flight holds self-heal.
    if (!r.reconciled && (now - (r.createdAt ?? 0)) <= RESERVATION_TTL_MS) {
      total += r.estCost;
    }
  }
  return total;
}

// Drop entries older than the TTL so storage doesn't grow unbounded across crashes (F9).
// Reconciled cost is already folded into spentUsd; the TTL window keeps a reconciled entry
// only long enough to preserve reconcile idempotency, then it's safe to forget.
function pruneReservations(reservations: Record<string, Reservation>): Record<string, Reservation> {
  const now = Date.now();
  const kept: Record<string, Reservation> = {};
  for (const [id, r] of Object.entries(reservations)) {
    if (now - (r.createdAt ?? 0) <= RESERVATION_TTL_MS) kept[id] = r;
  }
  return kept;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────

export class BudgetDO {
  // In-memory state (survives within a single DO lifetime; also persisted via transactional
  // storage so it survives eviction/restart — ARCHITECTURE §4d).
  private state_: BudgetState | null = null;
  // Finding #5: loop ring buffer persisted to DO storage as a write-through cache.
  // Every record() call updates this cache AND writes to storage so the ring buffer
  // survives DO eviction/restart (no in-memory-only bypass).
  private loopEntries_: LoopEntry[] | null = null;
  // Serial queue: ensures concurrent fetch() calls are processed one at a time,
  // mirroring the CF DO single-thread guarantee in tests (ARCHITECTURE §4c).
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  // Enqueue work to run after all prior work completes — emulates DO serialization.
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  // Lazy-init: hydrate from storage on first access.
  private async getBudgetState(): Promise<BudgetState> {
    if (this.state_ != null) return this.state_;

    const stored = await this.state.storage.get<BudgetState>("budget");
    if (stored != null) {
      this.state_ = stored;
      return this.state_;
    }

    // No stored state yet — return a zero-state (will be populated by /init).
    this.state_ = { limitUsd: 0, spentUsd: 0, reservations: {} };
    return this.state_;
  }

  private async saveBudgetState(s: BudgetState): Promise<void> {
    this.state_ = s;
    await this.state.storage.put("budget", s);
  }

  // Finding #5: lazy-load the persisted loop entries from storage.
  private async getLoopEntries(): Promise<LoopEntry[]> {
    if (this.loopEntries_ != null) return this.loopEntries_;
    const stored = await this.state.storage.get<LoopEntry[]>(LOOP_STORAGE_KEY);
    this.loopEntries_ = stored ?? [];
    return this.loopEntries_;
  }

  async fetch(request: Request): Promise<Response> {
    // Clone the request body before enqueuing so the stream isn't consumed by the time
    // the queued fn runs. This ensures serial handling of concurrent requests.
    const cloned = request.clone();
    return this.enqueue(() => this.handleRequest(cloned));
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/status") {
      return this.handleStatus();
    }
    if (request.method === "POST" && url.pathname === "/init") {
      return this.handleInit(request);
    }
    if (request.method === "POST" && url.pathname === "/reserve") {
      return this.handleReserve(request);
    }
    if (request.method === "POST" && url.pathname === "/reconcile") {
      return this.handleReconcile(request);
    }
    if (request.method === "POST" && url.pathname === "/release") {
      return this.handleRelease(request);
    }
    if (request.method === "POST" && url.pathname === "/loop/record") {
      return this.handleLoopRecord(request);
    }

    return jsonResponse({ error: { type: "not_found" } }, 404);
  }

  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as { limitUsd: number };
    const s = await this.getBudgetState();
    const updated: BudgetState = { ...s, limitUsd: body.limitUsd };
    await this.saveBudgetState(updated);
    return jsonResponse({ ok: true });
  }

  private async handleStatus(): Promise<Response> {
    const s = await this.getBudgetState();
    const reservedUsd = totalReserved(s.reservations);
    return jsonResponse({
      limitUsd: s.limitUsd,
      spentUsd: s.spentUsd,
      reservedUsd,
      remainingUsd: Math.max(0, s.limitUsd - s.spentUsd - reservedUsd),
    });
  }

  private async handleReserve(request: Request): Promise<Response> {
    const { estCost } = (await request.json()) as { estCost: number };
    const s = await this.getBudgetState();

    const currentReserved = totalReserved(s.reservations);
    const projected = s.spentUsd + currentReserved + estCost;

    if (projected > s.limitUsd) {
      return jsonResponse({ ok: false, blocked: true });
    }

    const reservationId = makeReservationId();
    const newReservations = {
      ...pruneReservations(s.reservations),
      [reservationId]: { estCost, reconciled: false, createdAt: Date.now() },
    };
    await this.saveBudgetState({ ...s, reservations: newReservations });

    return jsonResponse({ ok: true, blocked: false, reservationId });
  }

  private async handleReconcile(request: Request): Promise<Response> {
    const { reservationId, actualCost } = (await request.json()) as {
      reservationId: string;
      actualCost: number;
    };
    const s = await this.getBudgetState();

    const reservation = s.reservations[reservationId];
    if (reservation == null || reservation.reconciled) {
      // Idempotent: already reconciled or unknown id — no-op.
      return jsonResponse({ ok: true });
    }

    const newReservations = {
      ...s.reservations,
      [reservationId]: { ...reservation, reconciled: true },
    };
    const updated: BudgetState = {
      ...s,
      spentUsd: s.spentUsd + Math.min(actualCost, reservation.estCost),
      reservations: newReservations,
    };
    await this.saveBudgetState(updated);
    return jsonResponse({ ok: true });
  }

  private async handleRelease(request: Request): Promise<Response> {
    const { reservationId } = (await request.json()) as { reservationId: string };
    const s = await this.getBudgetState();

    const reservation = s.reservations[reservationId];
    if (reservation == null || reservation.reconciled) {
      return jsonResponse({ ok: true });
    }

    // Mark as reconciled with zero actual cost — releases the hold without charging.
    const newReservations = {
      ...s.reservations,
      [reservationId]: { ...reservation, reconciled: true },
    };
    await this.saveBudgetState({ ...s, reservations: newReservations });
    return jsonResponse({ ok: true });
  }

  // Finding #5: loop detection with persisted ring buffer.
  // We manage the ring buffer directly (instead of delegating to LoopDetector's internal array)
  // so we can persist it to DO storage. The pruning and counting logic mirrors LoopDetector exactly.
  private async handleLoopRecord(request: Request): Promise<Response> {
    const { reqHash } = (await request.json()) as { reqHash: string };
    const now = Date.now() / 1000;
    const windowSeconds = 60; // DEFAULT_WINDOW_SECONDS from LoopDetector
    const threshold = 10;     // DEFAULT_THRESHOLD from LoopDetector

    const entries = await this.getLoopEntries();

    // Append the new entry.
    entries.push({ hash: reqHash, ts: now });

    // Prune entries older than the window (same logic as LoopDetector.prune).
    const cutoff = now - windowSeconds;
    let firstLive = 0;
    while (firstLive < entries.length && entries[firstLive]!.ts < cutoff) {
      firstLive++;
    }
    const pruned = firstLive > 0 ? entries.slice(firstLive) : entries;

    // Count entries matching this hash.
    const count = pruned.reduce((total, e) => (e.hash === reqHash ? total + 1 : total), 0);

    // Persist the pruned entries — write-through so they survive eviction.
    this.loopEntries_ = pruned;
    await this.state.storage.put(LOOP_STORAGE_KEY, pruned);

    return jsonResponse({ loop: count >= threshold, count });
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
