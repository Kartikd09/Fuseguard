// FuseGuard proxy Worker entry point. MIT/OSS (ARCHITECTURE §2, §7).
// GET /health → 200; everything else → 501 until FR-1 forward path lands.

import type { Env } from "./budget-do.js";

export { BudgetDO } from "./budget-do.js";

// SSRF allowlist: the upstream host is a compile-time constant, NEVER derived from request
// input. Any header/param attempting to redirect upstream is ignored (ARCHITECTURE §6).
const ANTHROPIC_UPSTREAM = "https://api.anthropic.com";

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // TODO(ROADMAP Phase 1, task 4 / FR-1): authn → estimate → ALLOW/BLOCK → forward to
    // ANTHROPIC_UPSTREAM → reconcile. Forwarding is locked to the constant above (SSRF).
    void ANTHROPIC_UPSTREAM;
    return Response.json(
      { error: { type: "not_implemented", message: "proxy path not yet implemented (FR-1)" } },
      { status: 501 }
    );
  },
} satisfies ExportedHandler<Env>;
