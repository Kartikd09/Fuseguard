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

import { LoopDetector, requestHash as _requestHash } from "./loop/index.js";

export type FailureMode = "open" | "closed";

export interface Env {
  readonly ANTHROPIC_UPSTREAM: string;
  readonly FAILURE_MODE: FailureMode;
}

interface Reservation {
  readonly estCost: number;
  reconciled: boolean;
}

interface BudgetState {
  limitUsd: number;
  spentUsd: number;
  reservations: Record<string, Reservation>;
}

function makeReservationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function totalReserved(reservations: Record<string, Reservation>): number {
  let total = 0;
  for (const r of Object.values(reservations)) {
    if (!r.reconciled) total += r.estCost;
  }
  return total;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────

export class BudgetDO {
  // In-memory state (survives within a single DO lifetime; also persisted via transactional
  // storage so it survives eviction/restart — ARCHITECTURE §4d).
  private state_: BudgetState | null = null;
  private loopDetector: LoopDetector | null = null;
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

  private getLoopDetector(): LoopDetector {
    if (this.loopDetector == null) {
      this.loopDetector = new LoopDetector({ now: () => Date.now() / 1000 });
    }
    return this.loopDetector;
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
    const newReservations = { ...s.reservations, [reservationId]: { estCost, reconciled: false } };
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

  private async handleLoopRecord(request: Request): Promise<Response> {
    const { reqHash } = (await request.json()) as { reqHash: string };
    const detector = this.getLoopDetector();
    const result = detector.record(reqHash);
    return jsonResponse({ loop: result.loop, count: result.count });
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
