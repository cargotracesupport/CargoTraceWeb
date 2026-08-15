-- ============================================================
-- CargoTrace — 0019: customer master (per-agent address book).
-- A reusable list of receivers so staff can pick an existing customer when
-- creating a delivery instead of retyping name/phone/email every time.
-- Visibility is PER-AGENT: an agent sees only the customers they created;
-- admins see every customer in the org. Deliveries may link to a customer
-- (customer_id) but still carry the denormalized name/phone/email, so the
-- public tracker and notifications keep working with no extra joins.
-- ============================================================

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  -- The staff member who added this customer — drives per-agent visibility.
  created_by  uuid references public.profiles(id) on delete set null,
  name        text,
  phone       text,
  email       text,
  created_at  timestamptz not null default now()
);
create index customers_org_idx on public.customers(org_id, created_at desc);
create index customers_owner_idx on public.customers(created_by, created_at desc);

alter table public.customers enable row level security;

-- Read: admins see all in their org; agents see only their own.
create policy customers_select on public.customers
  for select using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'admin' or created_by = auth.uid())
  );

-- Insert: admin/agent, into their own org, as themselves (created_by = them).
create policy customers_insert on public.customers
  for insert with check (
    org_id = public.auth_org_id()
    and created_by = auth.uid()
    and public.auth_role() in ('admin', 'agent')
  );

-- Update / delete: admins any in org; agents only their own.
create policy customers_update on public.customers
  for update using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'admin' or created_by = auth.uid())
  ) with check (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'admin' or created_by = auth.uid())
  );
create policy customers_delete on public.customers
  for delete using (
    org_id = public.auth_org_id()
    and (public.auth_role() = 'admin' or created_by = auth.uid())
  );

-- Link a delivery to a master customer (optional). ON DELETE SET NULL so
-- removing a customer never deletes their delivery history.
alter table public.deliveries
  add column customer_id uuid references public.customers(id) on delete set null;
create index deliveries_customer_idx on public.deliveries(customer_id);
