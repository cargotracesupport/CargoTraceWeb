-- ============================================================
-- 0011: a driver can only be assigned AFTER the customer sets the drop-off.
-- New flow: create delivery (no driver) -> customer sets drop-off (pending) ->
-- dispatcher assigns a driver (possibly the same driver to several same-route
-- deliveries). So assigning a driver now requires a drop-off to exist.
-- ============================================================
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

  -- A driver can only be put on a delivery once the customer has set a drop-off.
  if p_driver_id is not null and (v_row.dest_lat is null or v_row.dest_lng is null) then
    raise exception 'set a drop-off location before assigning a driver';
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.profiles
    where id = p_driver_id and org_id = v_org and role = 'driver'
      and (v_role = 'admin' or agent_id = v_uid)
  ) then
    raise exception 'driver not found among your drivers';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles
    where id = p_vehicle_id and org_id = v_org
      and (v_role = 'admin' or agent_id = v_uid)
  ) then
    raise exception 'vehicle not found among your vehicles';
  end if;

  update public.deliveries
  set driver_id   = p_driver_id,
      vehicle_id  = case when p_driver_id is null then null else p_vehicle_id end,
      assigned_at = case when p_driver_id is not null then now() else null end,
      status      = case
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
