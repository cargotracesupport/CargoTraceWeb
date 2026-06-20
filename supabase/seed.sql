-- ============================================================
-- CargoTrace — OPTIONAL demo seed data
-- ------------------------------------------------------------
-- Safe to run AFTER you have signed up at least once.
--
-- IMPORTANT: sign up first!
--   This seed does NOT create an organization or any auth users.
--   It attaches demo rows to the MOST RECENTLY created organization,
--   which only exists after you create a company account in the app
--   (that signup is what creates your org). If no organization exists
--   yet, this script does nothing.
--
-- What it inserts (for that one org):
--   • 1 vehicle
--   • 1 device  (hardware_id = 'DEV-DEMO-001')
--   • 1 sample 'pending' delivery (Manila-area origin/destination)
--
-- The delivery is created WITHOUT a driver/vehicle/device assignment so
-- you can practice assigning it from the admin UI. (The vehicle and
-- device below are also unassigned — pick them in the Fleet/assign step.)
--
-- After running, read the new delivery's tracking_token to open the
-- public customer view at /track/{token}:
--
--   select reference, goods, tracking_token
--   from public.deliveries
--   order by created_at desc
--   limit 1;
--
-- Then visit:  /track/<that-tracking_token>
-- ============================================================

do $$
declare
  v_org_id uuid;
begin
  -- Most recently created organization (your latest signup).
  select id
    into v_org_id
    from public.organizations
   order by created_at desc
   limit 1;

  if v_org_id is null then
    raise notice 'No organization found — sign up in the app first, then re-run this seed.';
    return;
  end if;

  -- 1 demo vehicle
  insert into public.vehicles (org_id, name, plate)
  values (v_org_id, 'Demo Truck 1', 'ABC-1234');

  -- 1 demo device (the hardware_id a tracker would POST to /api/track)
  insert into public.devices (org_id, hardware_id, label)
  values (v_org_id, 'DEV-DEMO-001', 'Demo GPS Tracker');

  -- 1 sample 'pending' delivery, Manila area (origin A -> destination B)
  insert into public.deliveries (
    org_id, reference, goods, status,
    origin_label, origin_lat, origin_lng,
    dest_label,   dest_lat,   dest_lng,
    customer_name, customer_phone
  )
  values (
    v_org_id,
    'DEMO-0001',
    'Building materials — cement x100',
    'pending',
    'Manila Port, Tondo',        14.5995, 120.9842,
    'Quezon City Warehouse',     14.6760, 121.0437,
    'Demo Receiver',             '+63 917 000 0000'
  );

  raise notice 'Seeded demo vehicle, device (DEV-DEMO-001), and a pending delivery for org %.', v_org_id;
end $$;
