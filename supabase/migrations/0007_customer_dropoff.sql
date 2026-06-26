-- ============================================================
-- 0007: customer-set drop-off.
-- Deliveries are created WITHOUT a destination — the customer sets the drop-off
-- via their link. Such deliveries sit in a new 'awaiting_dropoff' status until
-- the customer confirms it. Agents/admins cannot set the drop-off.
-- ============================================================

alter table public.deliveries drop constraint if exists deliveries_status_check;
alter table public.deliveries
  add constraint deliveries_status_check
  check (status in
    ('awaiting_dropoff','pending','assigned','en_route','delivered','cancelled'));

-- Assign RPC: a delivery can be (re)assigned while awaiting drop-off too, and it
-- stays 'awaiting_dropoff' until the customer sets the destination.
drop function if exists public.assign_delivery_to_driver(uuid, uuid, uuid);
create or replace function public.assign_delivery_to_driver(
  p_delivery_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null
)
returns public.deliveries
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.auth_role();
  v_uid  uuid := auth.uid();
  v_org  uuid := public.auth_org_id();
  v_row  public.deliveries;
begin
  if v_role not in ('admin','agent') then
    raise exception 'not authorized to assign deliveries';
  end if;

  select * into v_row from public.deliveries
  where id = p_delivery_id and org_id = v_org;
  if not found then
    raise exception 'delivery not found in your organization';
  end if;

  if v_role = 'agent' and v_row.agent_id is distinct from v_uid then
    raise exception 'this delivery is not in your queue';
  end if;

  if v_row.status not in ('awaiting_dropoff','pending','assigned') then
    raise exception 'delivery is % and can no longer be reassigned', v_row.status;
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.profiles
    where id = p_driver_id and org_id = v_org and role = 'driver'
      and (v_role = 'admin' or agent_id = v_uid)
  ) then
    raise exception 'driver not found among your drivers';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles where id = p_vehicle_id and org_id = v_org
  ) then
    raise exception 'vehicle not found in your organization';
  end if;

  update public.deliveries
  set driver_id   = p_driver_id,
      vehicle_id  = case when p_driver_id is null then null else p_vehicle_id end,
      assigned_at = case when p_driver_id is not null then now() else null end,
      status      = case
                      -- stays awaiting until the customer confirms the drop-off
                      when status = 'awaiting_dropoff' then 'awaiting_dropoff'
                      when p_driver_id is not null and status = 'pending' then 'assigned'
                      when p_driver_id is null     and status = 'assigned' then 'pending'
                      else status
                    end
  where id = p_delivery_id and org_id = v_org
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public.assign_delivery_to_driver(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_delivery_to_driver(uuid, uuid, uuid) to authenticated;
