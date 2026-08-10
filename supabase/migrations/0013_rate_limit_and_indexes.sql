-- ============================================================
-- 0013: durable rate limiting + missing indexes.
-- The old in-memory limiter (src/lib/rate-limit.ts) is per-process, so on Vercel
-- serverless it both leaks (cold instances reset) and wrongly blocks (a warm
-- instance accumulates) — a real cause of "drop-off won't save". Move it to the
-- database so it's a single source of truth across all instances.
-- ============================================================

create table if not exists public.rate_hits (
  key text not null,
  hit_at timestamptz not null default now()
);
create index if not exists rate_hits_key_time_idx on public.rate_hits (key, hit_at);

-- No one but the service role touches this table.
alter table public.rate_hits enable row level security;

-- Atomic check-and-record. Returns true if the hit is allowed (under the limit
-- within the window), false if it should be throttled.
create or replace function public.rate_limit_hit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_since timestamptz := now() - make_interval(secs => p_window_seconds);
begin
  delete from public.rate_hits where key = p_key and hit_at < v_since;
  select count(*) into v_count from public.rate_hits where key = p_key and hit_at >= v_since;
  if v_count >= p_limit then
    return false;
  end if;
  insert into public.rate_hits (key) values (p_key);
  return true;
end;
$$;
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;

-- ── Indexes for common lookups ──────────────────────────────
create index if not exists deliveries_org_status_idx on public.deliveries (org_id, status);
create index if not exists deliveries_driver_status_idx on public.deliveries (driver_id, status);
create index if not exists positions_delivery_idx on public.positions (delivery_id);
