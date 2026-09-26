-- ============================================================
-- 0025: security hardening (customer-login lockout, session expiry, grants).
--
-- 1. rate_limit_peek(): read-only check of the rate_hits window, so the customer
--    login can LOCK OUT after repeated failures without counting successes.
--    (Delivery references are now sequential — CT-1000, CT-1001… — so the old
--    phone+reference login could be enumerated by anyone who knows a customer's
--    number. The route now records failures and refuses after too many.)
-- 2. customer_address_nearby(): only the server (service role) uses it; stop
--    exposing it to every signed-in user, since SECURITY DEFINER bypasses RLS.
-- 3. expire_stale_sessions() + a daily pg_cron job: sessions on this project
--    never expire (and Supabase's session timeouts need the Pro plan). Revoke
--    any session idle for 30 days or older than 90 days, for web and the mobile
--    app alike.
-- ============================================================

-- ── 1. Read-only rate-limit check ───────────────────────────
create or replace function public.rate_limit_peek(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) < p_limit
  from public.rate_hits
  where key = p_key
    and hit_at >= now() - make_interval(secs => p_window_seconds);
$$;
revoke execute on function public.rate_limit_peek(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_peek(text, int, int) to service_role;

-- ── 2. Server-only address dedupe ───────────────────────────
revoke execute on function public.customer_address_nearby(uuid, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.customer_address_nearby(uuid, double precision, double precision)
  to service_role;

-- ── 3. Session expiry ───────────────────────────────────────
-- Idle = no token refresh for 30 days (refreshed_at is stored as UTC without a
-- time zone). Absolute cap = 90 days since sign-in. Returns sessions removed.
create or replace function public.expire_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  with stale as (
    select id from auth.sessions
    where coalesce(refreshed_at at time zone 'UTC', updated_at, created_at)
            < now() - interval '30 days'
       or created_at < now() - interval '90 days'
  ), gone_tokens as (
    delete from auth.refresh_tokens where session_id in (select id from stale)
  )
  delete from auth.sessions where id in (select id from stale);
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;
revoke execute on function public.expire_stale_sessions() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('expire-stale-sessions')
  where exists (select 1 from cron.job where jobname = 'expire-stale-sessions');

  perform cron.schedule(
    'expire-stale-sessions',
    '15 3 * * *',
    'select public.expire_stale_sessions();'
  );
exception when others then
  raise notice 'pg_cron not scheduled (%). Enable pg_cron and re-run this block.', sqlerrm;
end $$;
