-- ============================================================
-- 0022: let the freeze trigger allow ownership FKs to be cleared to NULL.
--
-- freeze_delivery_after_start() (0012/0014) blocks ANY change to a started
-- delivery's detail columns, including driver_id/vehicle_id/device_id/agent_id.
-- But those four are FKs declared ON DELETE SET NULL: deleting a driver, agent,
-- vehicle or device makes Postgres set them to NULL on the referencing
-- deliveries. When such a delivery is en_route/delivered/cancelled, the trigger
-- fired on that cascade UPDATE and raised, so the whole delete was aborted —
-- e.g. "could not delete agent" for an agent who owns a completed delivery, and
-- the same for drivers and for the 90-day purge of a referenced vehicle/customer.
--
-- Fix: for those four ownership FKs, only block a change to a DIFFERENT non-null
-- value (a real reassignment). Allow clearing to NULL, which is exactly the
-- ON DELETE SET NULL cleanup. All other detail columns stay fully frozen, and
-- reassigning a driver/vehicle/agent on a started trip is still rejected.
-- ============================================================
create or replace function public.freeze_delivery_after_start()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('en_route','delivered','cancelled') then
    if new.reference     is distinct from old.reference
       or new.goods         is distinct from old.goods
       or new.origin_label  is distinct from old.origin_label
       or new.origin_lat    is distinct from old.origin_lat
       or new.origin_lng    is distinct from old.origin_lng
       or new.dest_label    is distinct from old.dest_label
       or new.dest_lat      is distinct from old.dest_lat
       or new.dest_lng      is distinct from old.dest_lng
       or new.customer_name is distinct from old.customer_name
       or new.customer_phone is distinct from old.customer_phone
       or new.customer_email is distinct from old.customer_email
       -- Ownership FKs: allow clearing to NULL (ON DELETE SET NULL cascade when
       -- the driver/vehicle/device/agent is removed), but block reassignment to
       -- a different value.
       or (new.driver_id  is distinct from old.driver_id  and new.driver_id  is not null)
       or (new.vehicle_id is distinct from old.vehicle_id and new.vehicle_id is not null)
       or (new.device_id  is distinct from old.device_id  and new.device_id  is not null)
       or (new.agent_id   is distinct from old.agent_id   and new.agent_id   is not null)
    then
      raise exception 'this delivery has started and its details can no longer be edited';
    end if;
  end if;
  return new;
end;
$$;
