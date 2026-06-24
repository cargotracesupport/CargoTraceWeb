-- ============================================================
-- 0004: vehicles in the dispatch flow.
-- A driver doesn't drive a fixed vehicle, so the vehicle (number plate) is
-- chosen per delivery at assignment time. Agents can also maintain the vehicle
-- list (admins already could).
-- ============================================================

-- Agents can add / edit / remove vehicles in their org.
drop policy if exists vehicles_agent_write on public.vehicles;
create policy vehicles_agent_write on public.vehicles
  for all using (org_id = public.auth_org_id() and public.auth_role() = 'agent')
  with check (org_id = public.auth_org_id() and public.auth_role() = 'agent');

-- Extend the assignment RPC to also set the delivery's vehicle.
-- (Old 2-arg version is dropped; the 3rd arg defaults to null so unassign works.)
drop function if exists public.assign_delivery_to_driver(uuid, uuid);
create or replace function public.assign_delivery_to_driver(
  p_delivery_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null
)
returns public.deliveries
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.auth_role();
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

  if v_row.status not in ('pending','assigned') then
    raise exception 'delivery is % and can no longer be reassigned', v_row.status;
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.profiles
    where id = p_driver_id and org_id = v_org and role = 'driver'
  ) then
    raise exception 'driver not found in your organization';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles
    where id = p_vehicle_id and org_id = v_org
  ) then
    raise exception 'vehicle not found in your organization';
  end if;

  update public.deliveries
  set driver_id   = p_driver_id,
      vehicle_id  = case when p_driver_id is null then null else p_vehicle_id end,
      assigned_at = case when p_driver_id is not null then now() else null end,
      status      = case
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
