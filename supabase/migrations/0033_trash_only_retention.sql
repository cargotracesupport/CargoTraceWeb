-- ============================================================
-- 0033: only the Trash is ever auto-deleted, after 60 days.
--
-- Replaces 0032 (which never ran): GPS points and notifications of live
-- deliveries are kept for good. They are removed only together with their
-- delivery, when that delivery is purged from the Trash
-- (positions_delivery_id_fkey and notifications_delivery_id_fkey cascade).
--
-- The Trash purge (from 0021) now removes anything trashed for more than
-- 60 days instead of 90. Same time, 03:00 UTC / 08:30 IST, children first.
-- ============================================================
do $$
begin
  perform cron.unschedule('retention-positions-notifications')
  where exists (select 1 from cron.job where jobname = 'retention-positions-notifications');

  perform cron.unschedule('purge-soft-deleted')
  where exists (select 1 from cron.job where jobname = 'purge-soft-deleted');

  perform cron.schedule('purge-soft-deleted', '0 3 * * *', $purge$
    delete from public.deliveries         where deleted_at is not null and deleted_at < now() - interval '60 days';
    delete from public.customer_addresses where deleted_at is not null and deleted_at < now() - interval '60 days';
    delete from public.customers          where deleted_at is not null and deleted_at < now() - interval '60 days';
    delete from public.devices            where deleted_at is not null and deleted_at < now() - interval '60 days';
    delete from public.vehicles           where deleted_at is not null and deleted_at < now() - interval '60 days';
  $purge$);
end $$;
