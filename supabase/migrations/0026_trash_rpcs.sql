-- ============================================================
-- 0026: make soft-delete / restore / purge actually work under RLS.
--
-- 0021 hides trashed rows with a RESTRICTIVE select policy (deleted_at is null).
-- Postgres also checks the NEW row of an UPDATE against SELECT policies, so the
-- client's "UPDATE ... SET deleted_at = now()" was rejected:
--   new row violates row-level security policy "deliveries_hide_deleted"
-- Restore and purge had the mirror problem (a hidden row can't be matched).
--
-- Fix: do all three through SECURITY DEFINER functions that bypass RLS and
-- enforce the same permissions the table policies express:
--   deliveries, devices        admin only
--   vehicles                   admin, or the agent who owns the vehicle
--   customers                  admin, or the staff member who created it
--   customer_addresses         admin, or the creator of the parent customer
--   restore / purge            admin only (the Trash page is admin-only)
-- Everything is scoped to the caller's organization. Purge only removes rows
-- that are already in the Trash, so it can never hard-delete live data.
-- ============================================================

create or replace function public.soft_delete_row(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_org  uuid := public.auth_org_id();
  v_role text := public.auth_role();
begin
  if v_uid is null or v_role is null or v_role not in ('admin', 'agent') then
    raise exception 'not authorized';
  end if;

  if p_table = 'deliveries' then
    update public.deliveries set deleted_at = now()
     where id = p_id and org_id = v_org and deleted_at is null
       and v_role = 'admin';
  elsif p_table = 'devices' then
    update public.devices set deleted_at = now()
     where id = p_id and org_id = v_org and deleted_at is null
       and v_role = 'admin';
  elsif p_table = 'vehicles' then
    update public.vehicles set deleted_at = now()
     where id = p_id and org_id = v_org and deleted_at is null
       and (v_role = 'admin' or agent_id = v_uid);
  elsif p_table = 'customers' then
    update public.customers set deleted_at = now()
     where id = p_id and org_id = v_org and deleted_at is null
       and (v_role = 'admin' or created_by = v_uid);
  elsif p_table = 'customer_addresses' then
    update public.customer_addresses a set deleted_at = now()
     where a.id = p_id and a.org_id = v_org and a.deleted_at is null
       and (v_role = 'admin' or exists (
             select 1 from public.customers c
             where c.id = a.customer_id and c.created_by = v_uid));
  else
    raise exception 'unknown table %', p_table;
  end if;

  if not found then
    raise exception 'not found, already deleted, or not allowed';
  end if;
end;
$$;

create or replace function public.restore_row(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.auth_org_id();
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'only admins can restore from the trash';
  end if;

  if p_table = 'deliveries' then
    update public.deliveries set deleted_at = null
     where id = p_id and org_id = v_org and deleted_at is not null;
  elsif p_table = 'devices' then
    update public.devices set deleted_at = null
     where id = p_id and org_id = v_org and deleted_at is not null;
  elsif p_table = 'vehicles' then
    update public.vehicles set deleted_at = null
     where id = p_id and org_id = v_org and deleted_at is not null;
  elsif p_table = 'customers' then
    update public.customers set deleted_at = null
     where id = p_id and org_id = v_org and deleted_at is not null;
  elsif p_table = 'customer_addresses' then
    update public.customer_addresses set deleted_at = null
     where id = p_id and org_id = v_org and deleted_at is not null;
  else
    raise exception 'unknown table %', p_table;
  end if;

  if not found then
    raise exception 'not found in the trash';
  end if;
end;
$$;

create or replace function public.purge_row(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.auth_org_id();
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'only admins can delete permanently';
  end if;

  -- Only rows already in the Trash (deleted_at set) can be purged.
  if p_table = 'deliveries' then
    delete from public.deliveries
     where id = p_id and org_id = v_org and deleted_at is not null;
  elsif p_table = 'devices' then
    delete from public.devices
     where id = p_id and org_id = v_org and deleted_at is not null;
  elsif p_table = 'vehicles' then
    delete from public.vehicles
     where id = p_id and org_id = v_org and deleted_at is not null;
  elsif p_table = 'customers' then
    delete from public.customers
     where id = p_id and org_id = v_org and deleted_at is not null;
  elsif p_table = 'customer_addresses' then
    delete from public.customer_addresses
     where id = p_id and org_id = v_org and deleted_at is not null;
  else
    raise exception 'unknown table %', p_table;
  end if;

  if not found then
    raise exception 'not found in the trash';
  end if;
end;
$$;

revoke execute on function public.soft_delete_row(text, uuid) from public, anon;
revoke execute on function public.restore_row(text, uuid)     from public, anon;
revoke execute on function public.purge_row(text, uuid)       from public, anon;
grant execute on function public.soft_delete_row(text, uuid) to authenticated;
grant execute on function public.restore_row(text, uuid)     to authenticated;
grant execute on function public.purge_row(text, uuid)       to authenticated;
