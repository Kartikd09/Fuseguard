-- Self-hosted deployments emit usage events without a FuseGuard api_keys row,
-- so api_key_id must allow NULL (FK still enforces referential integrity when set).
alter table usage_events
  alter column api_key_id drop not null;

-- Drop the cascade-delete index that assumed api_key_id is always present;
-- replace with a partial index that still covers the keyed lookup path.
drop index if exists usage_events_key_ts;
create index if not exists usage_events_key_ts
  on usage_events (api_key_id, ts desc)
  where api_key_id is not null;

-- Same applies to blocks: self-host emits block events with no api_keys row.
alter table blocks
  alter column api_key_id drop not null;
