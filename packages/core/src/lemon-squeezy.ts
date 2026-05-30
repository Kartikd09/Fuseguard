// Lemon Squeezy webhook helpers. MIT/OSS — pure, testable logic extracted from the
// Worker entry so signature verification + status mapping stay under coverage.

// Events that carry a subscription status we act on.
export const LS_HANDLED_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_resumed",
  "subscription_paused",
  "subscription_unpaused",
]);

// Map LS subscription status → our enum. Unknown → cancelled (conservative downgrade).
const STATUS_MAP: Record<string, "active" | "past_due" | "cancelled"> = {
  active: "active",
  on_trial: "active", // LS test mode sends this for new subscriptions
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  paused: "past_due",
  cancelled: "cancelled",
  expired: "cancelled",
};

export function mapLsStatus(lsStatus: string | undefined): "active" | "past_due" | "cancelled" {
  return STATUS_MAP[lsStatus ?? ""] ?? "cancelled";
}

export function isHandledEvent(eventName: string): boolean {
  return LS_HANDLED_EVENTS.has(eventName);
}

// Replay guard: an incoming webhook event is stale if its timestamp is <= the last
// processed one. Uses >= (not >) so equal-second events (LS timestamps are
// second-granularity) can't reorder a cancel over an active update. A missing/invalid
// incoming timestamp is treated as stale (fail-safe — don't let an untimestamped event win).
export function isStaleEvent(storedTsIso: string | null | undefined, eventTsIso: string | null | undefined): boolean {
  if (!eventTsIso) return true; // no event timestamp → cannot prove it's newer → treat as stale
  const eventTs = new Date(eventTsIso).getTime();
  if (Number.isNaN(eventTs)) return true;
  if (!storedTsIso) return false; // no prior record → not stale
  const storedTs = new Date(storedTsIso).getTime();
  if (Number.isNaN(storedTs)) return false;
  return eventTs <= storedTs;
}

// Constant-time HMAC-SHA256 verify. Rejects malformed/odd-length hex defensively.
export async function verifyLsSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!/^[0-9a-f]+$/i.test(signature) || signature.length % 2 !== 0) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = new Uint8Array((signature.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
  return crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(body));
}

// Compute an HMAC-SHA256 hex signature — used by tests to produce valid signatures.
export async function computeLsSignature(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
