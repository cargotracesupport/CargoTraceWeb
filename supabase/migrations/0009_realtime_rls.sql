-- ============================================================
-- 0009: enforce RLS on realtime postgres_changes for tenant tables.
-- Default REPLICA IDENTITY only ships the primary key in WAL records, so RLS
-- policies that depend on other columns (agent_id, org_id, driver_id, role)
-- can't be evaluated — meaning realtime events leak across agents/orgs.
-- REPLICA IDENTITY FULL ships the full row so RLS evaluates correctly.
-- ============================================================

alter table public.deliveries replica identity full;
alter table public.positions  replica identity full;
alter table public.profiles   replica identity full;
alter table public.vehicles   replica identity full;
