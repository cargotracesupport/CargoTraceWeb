-- ============================================================
-- 0014: pin the freeze trigger's search_path.
-- Security hardening (Supabase advisor: function_search_path_mutable). A function
-- with a mutable search_path can, in principle, be steered to resolve unqualified
-- names against attacker-controlled objects. This function touches no schema
-- objects (only OLD/NEW columns), so the risk is theoretical — but pinning
-- search_path = public closes the advisor finding and matches every other
-- function in this schema. Body is unchanged from 0012.
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
