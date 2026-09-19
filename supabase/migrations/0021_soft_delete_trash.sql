-- ============================================================
-- Goodswala — 0021: soft-delete + Trash (90-day retention).
--
-- "Delete" no longer removes a row. It stamps deleted_at, which hides the row
-- from every normal read (a RESTRICTIVE select policy per table), so no list
-- query needs changing. Admins see trashed rows via admin_trash(); restore
-- clears deleted_at; a daily pg_cron job hard-deletes anything trashed for more
-- than 90 days.
--
-- Covered tables: deliveries, vehicles, devices, customers, customer_addresses.
-- Drivers are auth users and are intentionally NOT covered (they stay an
-- immediate, permanent delete via /api/drivers).
-- ============================================================

-- ── 1. deleted_at columns ───────────────────────────────────
alter table public.deliveries         add column if not exists deleted_at timestamptz;
alter table public.vehicles           add column if not exists deleted_at timestamptz;
alter table public.devices            add column if not exists deleted_at timestamptz;
alter table public.customers          add column if not exists deleted_at timestamptz;
alter table public.customer_addresses add column if not exists deleted_at timestamptz;

-- Partial indexes: only trashed rows are indexed — fast Trash listing + purge,
-- zero overhead on the common (not-deleted) path.
create index if not exists deliveries_deleted_idx         on public.deliveries(deleted_at)         where deleted_at is not null;
create index if not exists vehicles_deleted_idx           on public.vehicles(deleted_at)           where deleted_at is not null;
create index if not exists devices_deleted_idx            on public.devices(deleted_at)            where deleted_at is not null;
create index if not exists customers_deleted_idx          on public.customers(deleted_at)          where deleted_at is not null;
create index if not exists customer_addresses_deleted_idx on public.customer_addresses(deleted_at) where deleted_at is not null;

-- ── 2. Hide trashed rows from every read ────────────────────
-- A RESTRICTIVE policy is AND-ed with all existing (permissive) policies, so one
-- per table hides deleted rows across admin/agent/driver reads at once without
-- touching any existing policy. It only affects SELECT: soft-delete, restore
-- (both UPDATE) and purge (DELETE) still run under the existing write policies.
drop policy if exists deliveries_hide_deleted         on public.deliveries;
drop policy if exists vehicles_hide_deleted           on public.vehicles;
drop policy if exists devices_hide_deleted            on public.devices;
drop policy if exists customers_hide_deleted          on public.customers;
drop policy if exists customer_addresses_hide_deleted on public.customer_addresses;

create policy deliveries_hide_deleted         on public.deliveries         as restrictive for select using (deleted_at is null);
create policy vehicles_hide_deleted           on public.vehicles           as restrictive for select using (deleted_at is null);
create policy devices_hide_deleted            on public.devices            as restrictive for select using (deleted_at is null);
create policy customers_hide_deleted          on public.customers          as restrictive for select using (deleted_at is null);
create policy customer_addresses_hide_deleted on public.customer_addresses as restrictive for select using (deleted_at is null);

-- ── 3. Keep SECURITY DEFINER readers from leaking trashed rows ──
-- These bypass RLS, so they need the filter added by hand.

-- Customer home: list a customer's deliveries by phone (0015).
create or replace function public.deliveries_for_customer_phone(p_phone text)
returns setof public.deliveries
language sql security definer set search_path = public as $$
  select d.* from public.deliveries d
  where d.deleted_at is null
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 6
    and right(regexp_replace(coalesce(d.customer_phone, ''), '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
  order by d.created_at desc
$$;

-- Drop-off dedupe: match a new drop-off against saved addresses (0020).
create or replace function public.customer_address_nearby(
  p_customer uuid,
  p_lat double precision,
  p_lng double precision
) returns setof public.customer_addresses
language sql stable security definer set search_path = public as $$
  select *
  from public.customer_addresses
  where customer_id = p_customer
    and deleted_at is null
    and abs(lat - p_lat) < 0.00045
    and abs(lng - p_lng) < 0.00045
  order by created_at desc
  limit 1;
$$;

-- ── 4. Admin Trash listing ──────────────────────────────────
-- One call returns every trashed row in the admin's org, newest first, as a
-- flat list the Trash page renders. Admin-only; org-scoped.
create or replace function public.admin_trash()
returns table (
  kind        text,
  id          uuid,
  title       text,
  subtitle    text,
  deleted_at  timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.auth_org_id();
begin
  if public.auth_role() <> 'admin' then
    raise exception 'only admins can view the trash';
  end if;

  return query
    select 'delivery'::text, d.id,
           coalesce(nullif(d.reference, ''), 'Delivery'),
           nullif(coalesce(d.dest_label, d.customer_name, ''), ''),
           d.deleted_at
    from public.deliveries d
    where d.org_id = v_org and d.deleted_at is not null
  union all
    select 'vehicle'::text, v.id,
           coalesce(nullif(v.name, ''), 'Vehicle'),
           nullif(v.plate, ''),
           v.deleted_at
    from public.vehicles v
    where v.org_id = v_org and v.deleted_at is not null
  union all
    select 'device'::text, dv.id,
           coalesce(nullif(dv.label, ''), dv.hardware_id, 'Device'),
           nullif(dv.hardware_id, ''),
           dv.deleted_at
    from public.devices dv
    where dv.org_id = v_org and dv.deleted_at is not null
  union all
    select 'customer'::text, c.id,
           coalesce(nullif(c.name, ''), nullif(c.phone, ''), 'Customer'),
           nullif(c.phone, ''),
           c.deleted_at
    from public.customers c
    where c.org_id = v_org and c.deleted_at is not null
  union all
    select 'address'::text, a.id,
           coalesce(nullif(a.nickname, ''), nullif(a.label, ''),
                    a.lat::text || ', ' || a.lng::text),
           nullif(a.label, ''),
           a.deleted_at
    from public.customer_addresses a
    where a.org_id = v_org and a.deleted_at is not null
  order by 5 desc;
end;
$$;

revoke execute on function public.admin_trash() from public, anon;
grant execute on function public.admin_trash() to authenticated;

-- ── 5. Daily purge of anything trashed for > 90 days ────────
-- Runs inside the database via pg_cron. Children first so cascades are tidy.
-- Wrapped so the migration still succeeds if pg_cron isn't enabled yet — in
-- that case enable it (Dashboard > Database > Extensions > pg_cron) and re-run
-- just this block.
do $$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('purge-soft-deleted')
  where exists (select 1 from cron.job where jobname = 'purge-soft-deleted');

  perform cron.schedule('purge-soft-deleted', '0 3 * * *', $purge$
    delete from public.deliveries         where deleted_at is not null and deleted_at < now() - interval '90 days';
    delete from public.customer_addresses where deleted_at is not null and deleted_at < now() - interval '90 days';
    delete from public.customers          where deleted_at is not null and deleted_at < now() - interval '90 days';
    delete from public.devices            where deleted_at is not null and deleted_at < now() - interval '90 days';
    delete from public.vehicles           where deleted_at is not null and deleted_at < now() - interval '90 days';
  $purge$);
exception when others then
  raise notice 'pg_cron not scheduled (%). Enable the pg_cron extension, then re-run the DO block in 0021 to schedule purge-soft-deleted.', sqlerrm;
end $$;
