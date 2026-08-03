-- ============================================================
-- CargoTrace — 0017: vehicle dimensions + capacity.
-- Length / width (metres) and load capacity (kg), shown when a vehicle is
-- created, assigned, and wherever the vehicle appears. All optional and
-- covered by the existing vehicles RLS policies.
-- ============================================================
alter table public.vehicles
  add column if not exists length_m    double precision,
  add column if not exists width_m     double precision,
  add column if not exists capacity_kg double precision;
