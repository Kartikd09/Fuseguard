-- Fix: migration 0002 issued table-level GRANT SELECT on api_keys which silently
-- re-granted anthropic_key_ciphertext/iv to authenticated. Re-revoke the table grant
-- and replace with column-scoped SELECT so ciphertext columns are never accessible
-- to the authenticated role (dashboard sessions). Service role is unaffected.

revoke select on public.api_keys from authenticated;

grant select (id, org_id, label, fuseguard_key_hash, fuseguard_key_prefix,
              key_version, is_active, created_at, last_used_at)
  on public.api_keys to authenticated;

grant insert, update, delete on public.api_keys to authenticated;
