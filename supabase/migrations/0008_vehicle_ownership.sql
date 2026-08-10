-- ============================================================
-- 0008: vehicles get an owning agent too (like drivers & deliveries),
-- so the admin can assign everything to agents and each agent works with their
-- own fleet. Admin sees all; agent sees their own; a driver can still read the
-- single vehicle assigned to them (needed for the shift gate).
-- ============================================================

alter table public.vehicles
  add column if not exists agent_id uuid references public.profiles(id) on delete set null;
create index if not exists vehicles_agent_id_idx on public.vehicles(agent_id);

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'admin'
      or (public.auth_role() = 'agent' and agent_id = auth.uid())
      or (
        public.auth_role() = 'driver'
        and id = (select vehicle_id from public.profiles where id = auth.uid())
      )
    )
  );

-- Agents manage only their own vehicles (admins keep vehicles_write from 0001).
drop policy if exists vehicles_agent_write on public.vehicles;
create policy vehicles_agent_write on public.vehicles
  for all using (
    org_id = public.auth_org_id() and public.auth_role() = 'agent' and agent_id = auth.uid()
  )
  with check (
    org_id = public.auth_org_id() and public.auth_role() = 'agent' and agent_id = auth.uid()
  );

-- Assign RPC: the vehicle must belong to the org AND (admin, or the agent owns it).
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
revoke all on function public.assign_delivery_to_driver(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_delivery_to_driver(uuid, uuid, uuid) to authenticated;
