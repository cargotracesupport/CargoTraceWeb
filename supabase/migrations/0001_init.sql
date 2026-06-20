-- ============================================================
-- CargoTrace — initial schema
-- Delivery tracking: goods A -> B, tracked by GPS hardware (or phone interim).
-- Roles: admin (sender), driver. Customer (receiver) tracks via public token.
-- Multi-tenant: every row scoped by org_id; isolation enforced by RLS.
-- ============================================================

create extension if not exists postgis;

-- ── Organizations (the sender business = the SaaS tenant) ──
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ── Profiles (1:1 with auth.users) ──
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  role        text not null check (role in ('admin','driver')),
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now()
);
create index profiles_org_idx on public.profiles(org_id);

-- ── Vehicles ──
create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  plate       text,
  created_at  timestamptz not null default now()
);
create index vehicles_org_idx on public.vehicles(org_id);

-- ── Devices (GPS hardware; integrated later via /api/track) ──
create table public.devices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  hardware_id text not null unique,                 -- the id the hardware sends
  label       text,
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index devices_org_idx on public.devices(org_id);

-- ── Deliveries (the central object: goods from A to B) ──
create table public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  reference     text,                               -- order / consignment ref
  goods         text,                               -- e.g. "Cement x100 bags"
  status        text not null default 'pending'
                check (status in ('pending','assigned','en_route','delivered','cancelled')),
  driver_id     uuid references public.profiles(id) on delete set null,
  vehicle_id    uuid references public.vehicles(id) on delete set null,
  device_id     uuid references public.devices(id) on delete set null,

  origin_label  text,
  origin_lat    double precision,
  origin_lng    double precision,
  dest_label    text,
  dest_lat      double precision,
  dest_lng      double precision,

  customer_name  text,
  customer_phone text,
  customer_email text,
  tracking_token uuid not null default gen_random_uuid(),  -- public link id

  -- denormalized last-known position for fast reads (updated by /api/track)
  last_lat        double precision,
  last_lng        double precision,
  last_speed      double precision,
  last_position_at timestamptz,

  created_at    timestamptz not null default now(),
  assigned_at   timestamptz,
  started_at    timestamptz,
  delivered_at  timestamptz
);
create index deliveries_org_idx on public.deliveries(org_id);
create index deliveries_driver_idx on public.deliveries(driver_id);
create unique index deliveries_token_idx on public.deliveries(tracking_token);

-- ── Positions (raw GPS history) ──
create table public.positions (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  delivery_id  uuid references public.deliveries(id) on delete cascade,
  device_id    uuid references public.devices(id) on delete set null,
  driver_id    uuid references public.profiles(id) on delete set null,
  lat          double precision not null,
  lng          double precision not null,
  speed        double precision,
  heading      double precision,
  recorded_at  timestamptz not null default now(),  -- device/GNSS time
  created_at   timestamptz not null default now()
);
create index positions_delivery_idx on public.positions(delivery_id, recorded_at desc);

-- ============================================================
-- Helper functions (security definer so they can read profiles under RLS)
-- ============================================================
create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- Auto-create profile + org on signup.
-- The FIRST user of a brand-new signup becomes an admin of a new org.
-- raw_user_meta_data may carry { full_name, org_name }.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_org uuid;
begin
  insert into public.organizations(name)
  values (coalesce(new.raw_user_meta_data->>'org_name', 'My Company'))
  returning id into new_org;

  insert into public.profiles(id, org_id, role, full_name)
  values (new.id, new_org, 'admin', new.raw_user_meta_data->>'full_name');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.vehicles      enable row level security;
alter table public.devices       enable row level security;
alter table public.deliveries    enable row level security;
alter table public.positions     enable row level security;

-- Organizations: members can read their own org
create policy org_select on public.organizations
  for select using (id = public.auth_org_id());

-- Profiles: read profiles in your org; update your own
create policy profiles_select on public.profiles
  for select using (org_id = public.auth_org_id());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- Vehicles / Devices: admins manage; everyone in org reads
create policy vehicles_select on public.vehicles
  for select using (org_id = public.auth_org_id());
create policy vehicles_write on public.vehicles
  for all using (org_id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (org_id = public.auth_org_id() and public.auth_role() = 'admin');

create policy devices_select on public.devices
  for select using (org_id = public.auth_org_id());
create policy devices_write on public.devices
  for all using (org_id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (org_id = public.auth_org_id() and public.auth_role() = 'admin');

-- Deliveries:
--  admins: full access within org
--  drivers: read their assigned deliveries + update them (e.g. status)
create policy deliveries_admin_all on public.deliveries
  for all using (org_id = public.auth_org_id() and public.auth_role() = 'admin')
  with check (org_id = public.auth_org_id() and public.auth_role() = 'admin');
create policy deliveries_driver_select on public.deliveries
  for select using (driver_id = auth.uid());
create policy deliveries_driver_update on public.deliveries
  for update using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

-- Positions: read within org (admins see all org; drivers see their deliveries).
-- Writes happen server-side via the service role (bypasses RLS) in /api/track.
create policy positions_select on public.positions
  for select using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'admin'
      or exists (
        select 1 from public.deliveries d
        where d.id = positions.delivery_id and d.driver_id = auth.uid()
      )
    )
  );

-- ============================================================
-- Realtime: broadcast position + delivery changes to authed clients
-- ============================================================
alter publication supabase_realtime add table public.positions;
alter publication supabase_realtime add table public.deliveries;
