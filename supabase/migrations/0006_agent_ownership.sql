-- ============================================================
-- 0006: per-agent ownership of deliveries and drivers.
-- Each agent works in their own space (their deliveries / drivers / customers).
-- Admin sees everything. Customers are embedded in deliveries, so they follow
-- the delivery's owner. Vehicles stay org-shared.
--   deliveries.agent_id  -> the owning agent (null = admin/org-level)
--   profiles.agent_id    -> for a driver, the owning agent (null = admin-level)
-- ============================================================

alter table public.deliveries
  add column if not exists agent_id uuid references public.profiles(id) on delete set null;
alter table public.profiles
  add column if not exists agent_id uuid references public.profiles(id) on delete set null;

create index if not exists deliveries_agent_id_idx on public.deliveries(agent_id);
create index if not exists profiles_agent_id_idx on public.profiles(agent_id);

-- ── Deliveries: an agent only sees / edits / creates their own ──
drop policy if exists deliveries_agent_select on public.deliveries;
create policy deliveries_agent_select on public.deliveries
  for select using (org_id = public.auth_org_id() and agent_id = auth.uid());

drop policy if exists deliveries_agent_insert on public.deliveries;
create policy deliveries_agent_insert on public.deliveries
  for insert with check (
    org_id = public.auth_org_id()
    and public.auth_role() = 'agent'
    and agent_id = auth.uid()
  );

drop policy if exists deliveries_agent_update on public.deliveries;
create policy deliveries_agent_update on public.deliveries
  for update using (org_id = public.auth_org_id() and agent_id = auth.uid())
  with check (org_id = public.auth_org_id() and agent_id = auth.uid());

-- ── Profiles: role-aware visibility ──
--   admin  -> all profiles in the org
--   agent  -> own row + the drivers they own
--   anyone -> their own row
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or (public.auth_role() = 'admin' and org_id = public.auth_org_id())
    or (public.auth_role() = 'agent' and agent_id = auth.uid())
  );

-- ── Assignment RPC: agents may only assign their own delivery to their own driver ──
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

  if v_row.status not in ('pending','assigned') then
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
