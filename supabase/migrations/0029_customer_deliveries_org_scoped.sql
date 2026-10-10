-- ============================================================
-- 0029: customer home lookup scoped to one organisation.
--
-- deliveries_for_customer_phone (0015/0021) matched the last 10 digits of the
-- phone across EVERY organisation. The customer home trusts "this phone" as
-- the identity, so anyone who could put a victim's number on a delivery of
-- their own (any agent, or before 0028 anyone who signed up) could open that
-- delivery's link and receive the tracking tokens of all the victim's
-- deliveries everywhere, then move their drop-offs (the drop-off endpoint
-- only checks the phone number).
--
-- customer_deliveries() always works inside one organisation:
--   * token login: the caller passes the org of the token's delivery;
--   * phone + reference login: the orgs where that phone + reference pair
--     actually exists (knowing both is the credential).
-- With neither, it returns nothing.
--
-- The phone match uses an expression index instead of scanning every row.
-- The old function stays until the new route code is live, then 0030 drops it.
-- ============================================================

create index if not exists deliveries_phone10_idx
  on public.deliveries ((right(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g'), 10)))
  where deleted_at is null;

create or replace function public.customer_deliveries(
  p_phone text,
  p_org uuid default null,
  p_reference text default null
)
returns setof public.deliveries
language sql stable security definer set search_path = public as $$
  with ph as (
    select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) as p10
  ),
  orgs as (
    select p_org as org_id
    where p_org is not null
    union
    select d.org_id
    from public.deliveries d, ph
    where p_org is null
      and p_reference is not null
      and d.deleted_at is null
      and right(regexp_replace(coalesce(d.customer_phone, ''), '\D', '', 'g'), 10) = ph.p10
      and lower(trim(d.reference)) = lower(trim(p_reference))
  )
  select d.*
  from public.deliveries d, ph
  where length(ph.p10) >= 6
    and d.deleted_at is null
    and d.org_id in (select org_id from orgs)
    and right(regexp_replace(coalesce(d.customer_phone, ''), '\D', '', 'g'), 10) = ph.p10
  order by d.created_at desc
$$;

revoke execute on function public.customer_deliveries(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.customer_deliveries(text, uuid, text) to service_role;
