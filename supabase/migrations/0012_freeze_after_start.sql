-- ============================================================
-- 0012: freeze a delivery's details once the trip has started.
-- Admins/agents can edit delivery details only until it starts moving. Once the
-- status is en_route/delivered/cancelled, the shipment details are locked. The
-- driver's live position + lifecycle updates (last_*, status, started_at,
-- delivered_at) still flow through, since those aren't "detail" columns.
-- ============================================================
create or replace function public.freeze_delivery_after_start()
returns trigger language plpgsql as $$
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
       or new.driver_id     is distinct from old.driver_id
       or new.vehicle_id    is distinct from old.vehicle_id
       or new.device_id     is distinct from old.device_id
       or new.agent_id      is distinct from old.agent_id
    then
      raise exception 'this delivery has started and its details can no longer be edited';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_freeze_after_start on public.deliveries;
create trigger deliveries_freeze_after_start
  before update on public.deliveries
  for each row execute function public.freeze_delivery_after_start();
