// Budget Durable Object — authoritative per-key / per-session spend counter.
// MIT/OSS (ARCHITECTURE §2, §7). One DO instance per budget scope serializes all access,
// so read-decide-reserve is atomic by construction — no races (ARCHITECTURE §4c).

export interface Env {
  readonly ANTHROPIC_UPSTREAM: string;
  readonly FAILURE_MODE: string;
}

export class BudgetDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  // TODO(ROADMAP Phase 1, task 5): reserve(estCost) / reconcile(actualCost) over transactional
  // storage; loop-detection ring buffer (task 11); window resets. Single-threaded serialization
  // guarantees concurrency safety (ARCHITECTURE §4c).
  async fetch(_request: Request): Promise<Response> {
    return new Response(JSON.stringify({ error: { type: "not_implemented" } }), {
      status: 501,
      headers: { "content-type": "application/json" },
    });
  }
}
