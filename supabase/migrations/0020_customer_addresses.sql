-- ============================================================
-- Goodswala — 0020: customer address book.
-- A customer may have multiple saved drop-offs (home, office, warehouse…).
-- Delivery flow: agent picks one at create time, or sends the tracking link;
-- when the customer sets a drop-off from the link, we also save it here so it's
-- available for their next delivery.
--
-- Visibility mirrors public.customers: agents see only their own customers'
-- addresses; admins see everything in the org.
-- ============================================================

create table public.customer_addresses (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  -- Auto label (reverse-geocoded street/address) + optional nickname the agent
  -- gives it. UI shows nickname when set, else the auto label.
  label       text,
  nickname    text,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz not null default now(),
  check (lat between -90 and 90),
  check (lng between -180 and 180)
);
create index customer_addresses_customer_idx on public.customer_addresses(customer_id, created_at desc);
create index customer_addresses_org_idx on public.customer_addresses(org_id);

alter table public.customer_addresses enable row level security;

-- Read: admins see all in their org; other staff see rows belonging to the
-- customers they created (matches customers_select scoping).
create policy customer_addresses_select on public.customer_addresses
  for select using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'admin'
      or exists (
        select 1 from public.customers c
        where c.id = customer_addresses.customer_id
          and c.created_by = auth.uid()
      )
    )
  );

-- Insert / update / delete: admin/agent in their own org, and the parent
-- customer must be one they can see under the customers RLS above.
create policy customer_addresses_insert on public.customer_addresses
  for insert with check (
    org_id = public.auth_org_id()
    and public.auth_role() in ('admin', 'agent')
    and exists (
      select 1 from public.customers c
      where c.id = customer_addresses.customer_id
        and c.org_id = public.auth_org_id()
        and (public.auth_role() = 'admin' or c.created_by = auth.uid())
    )
  );
create policy customer_addresses_update on public.customer_addresses
  for update using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'admin'
      or exists (
        select 1 from public.customers c
        where c.id = customer_addresses.customer_id
          and c.created_by = auth.uid()
      )
    )
  ) with check (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'admin'
      or exists (
        select 1 from public.customers c
        where c.id = customer_addresses.customer_id
          and c.created_by = auth.uid()
      )
    )
  );
create policy customer_addresses_delete on public.customer_addresses
  for delete using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'admin'
      or exists (
        select 1 from public.customers c
        where c.id = customer_addresses.customer_id
          and c.created_by = auth.uid()
      )
    )
  );

-- Deduplicate a new address against the customer's existing ones within ~50 m
-- (roughly 0.00045 degrees). Returns the matching row, or null. Used by the
-- server route that saves a drop-off from the public tracker.
create or replace function public.customer_address_nearby(
  p_customer uuid,
  p_lat double precision,
  p_lng double precision
) returns setof public.customer_addresses
language sql stable security definer set search_path = public as $$
  select *
  from public.customer_addresses
  where customer_id = p_customer
    and abs(lat - p_lat) < 0.00045
    and abs(lng - p_lng) < 0.00045
  order by created_at desc
  limit 1;
$$;

-- Backfill: seed one address per customer from their most recent delivery
-- that has a drop-off, so existing customers get their history without an
-- extra step.
insert into public.customer_addresses (customer_id, org_id, label, lat, lng, created_at)
select distinct on (d.customer_id)
  d.customer_id, d.org_id, d.dest_label, d.dest_lat, d.dest_lng, d.created_at
from public.deliveries d
where d.customer_id is not null
  and d.dest_lat is not null
  and d.dest_lng is not null
order by d.customer_id, d.created_at desc;
