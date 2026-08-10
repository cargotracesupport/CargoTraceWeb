-- ============================================================
-- CargoTrace — 0002: add the "agent" (dispatcher) role.
-- An agent assigns / reassigns deliveries to drivers within their org.
-- Admin still creates deliveries; driver still delivers A -> B.
-- ============================================================

-- 1. Allow the new role value on profiles.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','driver','agent'));

-- 2. Agents can read every delivery in their org (so they can dispatch them).
drop policy if exists deliveries_agent_select on public.deliveries;
create policy deliveries_agent_select on public.deliveries
  for select using (org_id = public.auth_org_id() and public.auth_role() = 'agent');

-- 3. Secure assignment path.
--    Postgres RLS can't restrict an UPDATE to a single column, so assignment
--    goes through this SECURITY DEFINER function: callable by admins and agents,
--    scoped to their own org, and limited to the driver_id / assigned_at / status
--    transition. Pass p_driver_id = null to unassign.
create or replace function public.assign_delivery_to_driver(
  p_delivery_id uuid,
  p_driver_id uuid
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

  update public.deliveries
  set driver_id   = p_driver_id,
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

revoke all on function public.assign_delivery_to_driver(uuid, uuid) from public, anon;
grant execute on function public.assign_delivery_to_driver(uuid, uuid) to authenticated;
