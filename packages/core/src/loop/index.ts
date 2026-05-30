// Loop detection: ring buffer + stable request hash. Engine is MIT/OSS; productized as a
// paid feature gated at the edge in packages/hosted (ARCHITECTURE §7, FR-4).
//
// Pure + framework-free: the Budget Durable Object wraps this engine later. The clock is
// injected so detection is deterministic and unit-testable (never real Date.now).

export interface LoopRequest {
  readonly model: string;
  readonly system?: unknown;
  readonly messages?: unknown;
  readonly tools?: unknown;
}

export interface LoopResult {
  readonly loop: boolean;
  readonly count: number;
}

export interface LoopDetectorOptions {
  readonly threshold?: number;
  readonly windowSeconds?: number;
  readonly now: () => number;
}

const DEFAULT_THRESHOLD = 10;
const DEFAULT_WINDOW_SECONDS = 60;

// FNV-1a (32-bit) over the normalized request JSON. Pure + synchronous so tests stay simple;
// not cryptographic — collision resistance is "sane enough" to separate distinct requests.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // >>> 0 coerces to unsigned 32-bit before hex encoding.
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Collapse all whitespace runs to a single space and trim, so cosmetic spacing in prompts
// does not change the hash ("near-identical" per FR-4).
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [key, canonicalize(val)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Stable, deterministic hash over {model, system, messages, tools} with normalized whitespace.
 * Same logical request ⇒ same hash; a change to any of those fields ⇒ different hash.
 */
export function requestHash(request: LoopRequest): string {
  const canonical = canonicalize({
    model: request.model,
    system: request.system ?? null,
    messages: request.messages ?? null,
    tools: request.tools ?? null,
  });
  return fnv1a(JSON.stringify(canonical));
}

/**
 * Detects N near-identical requests within T seconds on a single key/session scope. Pure and
 * framework-free; the Durable Object owns one instance per scope (ARCHITECTURE §4c).
 */
export class LoopDetector {
  private readonly threshold: number;
  private readonly windowSeconds: number;
  private readonly now: () => number;
  private readonly entries: Array<{ hash: string; ts: number }> = [];

  constructor(opts: LoopDetectorOptions) {
    const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    const windowSeconds = opts.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
    if (!Number.isFinite(threshold) || threshold < 1) {
      throw new Error("LoopDetector threshold must be a finite number >= 1");
    }
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
      throw new Error("LoopDetector windowSeconds must be a finite number > 0");
    }
    this.threshold = threshold;
    this.windowSeconds = windowSeconds;
    this.now = opts.now;
  }

  /**
   * Append (hash, now) to the ring buffer, prune entries older than the window, and report the
   * in-window count for this hash. loop=true once that count reaches the threshold.
   */
  record(hash: string): LoopResult {
    const ts = this.now();
    this.entries.push({ hash, ts });
    this.prune(ts);

    const count = this.entries.reduce((total, entry) => (entry.hash === hash ? total + 1 : total), 0);
    return { loop: count >= this.threshold, count };
  }

  // Drop entries whose age exceeds the window; the boundary (age === window) is retained.
  private prune(now: number): void {
    const cutoff = now - this.windowSeconds;
    let firstLive = 0;
    while (firstLive < this.entries.length && this.entries[firstLive]!.ts < cutoff) {
      firstLive++;
    }
    if (firstLive > 0) {
      this.entries.splice(0, firstLive);
    }
  }
}
