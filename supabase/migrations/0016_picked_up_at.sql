-- ============================================================
-- 0016: when did the driver collect the goods?
-- Stamped by the GPS ingest API the first time a driver's fix lands within
-- ~300 m of the delivery's origin. Lets every side (customer tracker, agent,
-- admin) distinguish "driver heading to pickup" from "goods on the way to
-- you" — previously only the driver's own device knew (localStorage).
-- ============================================================
alter table public.deliveries
  add column if not exists picked_up_at timestamptz;
