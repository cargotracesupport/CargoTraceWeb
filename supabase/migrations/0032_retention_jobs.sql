-- ============================================================
-- 0032: retention for the two tables that only ever grow.
--
-- positions gets a row per GPS fix per en-route delivery (the driver app
-- reports in the background now), and notifications ~13 rows per delivery.
-- Nothing removed either, and on the free plan a database over 500 MB goes
-- read-only, which stops GPS, new deliveries and drop-offs for everyone.
--
-- Daily at 03:30 UTC / 09:00 IST (after the other nightly jobs):
--   * positions older than 60 days (by created_at, the server's clock; the
--     web app only uses the current point in deliveries.last_*);
--   * notifications older than 180 days.
-- Change the intervals here if a longer history is needed.
-- ============================================================
do $$
begin
  perform cron.unschedule('retention-positions-notifications')
  where exists (select 1 from cron.job where jobname = 'retention-positions-notifications');
  perform cron.schedule(
    'retention-positions-notifications',
    '30 3 * * *',
    $ret$
    delete from public.positions     where created_at < now() - interval '60 days';
    delete from public.notifications where created_at < now() - interval '180 days';
    $ret$
  );
end;
$$;
