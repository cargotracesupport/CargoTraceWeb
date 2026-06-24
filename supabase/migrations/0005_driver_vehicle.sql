-- ============================================================
-- 0005: a driver's current / assigned vehicle.
-- Admins & agents assign a vehicle to a driver; at dispatch, picking that driver
-- auto-fills the vehicle number (still overridable per delivery, since a driver
-- may swap vehicles).
-- ============================================================
alter table public.profiles
  add column if not exists vehicle_id uuid
  references public.vehicles(id) on delete set null;
