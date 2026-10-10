-- ============================================================
-- 0030: keep rate_hits bounded; drop the cross-org phone lookup.
--
-- rate_limit_hit() only deletes expired rows for the key it is checking, so a
-- key that is never used again (one per IP, per link, per phone...) stayed
-- forever. Every public request writes a row, so the limiter itself could be
-- used to fill the free plan's 500 MB, which turns the database read-only.
-- The longest window any caller uses is 24 hours; an hourly job removes
-- anything older than 25 hours. Indexed on hit_at so the sweep doesn't scan.
--
-- deliveries_for_customer_phone (matches a phone across every organisation)
-- is replaced by customer_deliveries (0029) and no longer called.
-- ============================================================

create index if not exists rate_hits_hit_at_idx on public.rate_hits (hit_at);

do $$
begin
  perform cron.unschedule('sweep-rate-hits')
  where exists (select 1 from cron.job where jobname = 'sweep-rate-hits');
  perform cron.schedule(
    'sweep-rate-hits',
    '7 * * * *',
    $sweep$delete from public.rate_hits where hit_at < now() - interval '25 hours'$sweep$
  );
end;
$$;

drop function if exists public.deliveries_for_customer_phone(text);
