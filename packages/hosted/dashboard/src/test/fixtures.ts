// Test fixtures — typed mock data matching ARCHITECTURE §5 schema.
import type { ApiKey, Budget, UsageEvent, Block, Org } from "@/types";

export const mockOrg: Org = {
  id: "org-abc-123",
  name: "Acme AI",
  plan_id: "plan-free-1",
  created_at: "2025-01-15T10:00:00Z",
};

export const mockKey1: ApiKey = {
  id: "key-001",
  org_id: "org-abc-123",
  label: "production",
  fuseguard_key_prefix: "fg_live_p",
  is_active: true,
  created_at: "2025-01-15T10:00:00Z",
  last_used_at: "2025-05-30T08:00:00Z",
};

export const mockKey2: ApiKey = {
  id: "key-002",
  org_id: "org-abc-123",
  label: "staging",
  fuseguard_key_prefix: "fg_live_s",
  is_active: true,
  created_at: "2025-02-01T09:00:00Z",
  last_used_at: "2025-05-29T12:00:00Z",
};

export const mockBudgetUsd: Budget = {
  id: "budget-001",
  org_id: "org-abc-123",
  scope: "key",
  scope_ref: "key-001",
  limit_type: "usd",
  limit_value: 50,
  window: "daily",
  window_seconds: null,
  is_active: true,
  created_at: "2025-01-15T10:00:00Z",
};

export const mockBudgetTokens: Budget = {
  id: "budget-002",
  org_id: "org-abc-123",
  scope: "key",
  scope_ref: "key-002",
  limit_type: "tokens",
  limit_value: 1_000_000,
  window: "rolling",
  window_seconds: 86400,
  is_active: true,
  created_at: "2025-02-01T09:00:00Z",
};

export const mockEvents: UsageEvent[] = [
  {
    id: "evt-001",
    org_id: "org-abc-123",
    api_key_id: "key-001",
    session: null,
    model: "claude-sonnet-4",
    input_tokens: 1500,
    output_tokens: 320,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0.0093,
    status: "ok",
    request_hash: "abc123",
    ts: "2025-05-30T07:00:00Z",
  },
  {
    id: "evt-002",
    org_id: "org-abc-123",
    api_key_id: "key-001",
    session: "sess-xyz",
    model: "claude-opus-4",
    input_tokens: 4000,
    output_tokens: 1200,
    cache_read_tokens: 500,
    cache_write_tokens: 0,
    cost_usd: 0.15,
    status: "ok",
    request_hash: "def456",
    ts: "2025-05-30T07:30:00Z",
  },
  {
    id: "evt-003",
    org_id: "org-abc-123",
    api_key_id: "key-002",
    session: null,
    model: "claude-haiku-3.5",
    input_tokens: 800,
    output_tokens: 200,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0.0014,
    status: "ok",
    request_hash: "ghi789",
    ts: "2025-05-30T06:00:00Z",
  },
];

export const mockBlocks: Block[] = [
  {
    id: "blk-001",
    org_id: "org-abc-123",
    api_key_id: "key-001",
    session: "sess-xyz",
    reason: "budget_exceeded",
    scope: "key",
    budget_id: "budget-001",
    projected_usd: 51.2,
    current_usd: 45.3,
    ts: "2025-05-30T08:15:00Z",
  },
  {
    id: "blk-002",
    org_id: "org-abc-123",
    api_key_id: "key-001",
    session: null,
    reason: "loop_detected",
    scope: "key",
    budget_id: null,
    projected_usd: 0,
    current_usd: 0,
    ts: "2025-05-30T08:20:00Z",
  },
];
