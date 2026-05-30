-- C3 fix: a key with no budget configured is blocked (fail-closed) with reason 'no_budget'.
-- Add it to the blocks.reason check constraint.

alter table blocks drop constraint if exists blocks_reason_check;
alter table blocks add constraint blocks_reason_check
  check (reason in ('budget_exceeded', 'loop_detected', 'enforcement_unavailable', 'no_budget'));
