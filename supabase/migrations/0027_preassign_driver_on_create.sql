-- ============================================================
-- 0027: a driver can be chosen when the delivery is created.
--
-- The create form now takes an optional driver. If the delivery reuses a saved
-- drop-off it is created 'assigned' straight away. If the customer still has to
-- set the drop-off it is created 'awaiting_dropoff' with the driver already on
-- it, and the drop-off endpoint moves it to 'assigned' once the customer picks
-- a location (that path already handled driver_id).
--
-- Driver notifications used to fire whenever driver_id changed. With a driver
-- pre-assigned that is wrong twice over: the driver would be told about a trip
-- the app does not show yet (it lists assigned/en_route only), and nothing
-- would tell them later when it became live, because driver_id doesn't change
-- then. So both the push and the in-app notification now fire when the driver
-- actually has the trip: status is 'assigned' and either the driver or the
-- status just changed. The staff "drop-off set" notice also covers the
-- awaiting_dropoff -> assigned move.
-- ============================================================

-- Push (via the notify-driver edge function).
create or replace function public.notify_driver_on_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  fn_url        text := 'https://ahfrdgbcatlnnckopvni.supabase.co/functions/v1/notify-driver';
  service_key   text;
  shared_secret text;
  v_old         jsonb;
begin
  if new.driver_id is not null
     and new.status = 'assigned'
     and (tg_op = 'INSERT'
          or old.driver_id is distinct from new.driver_id
          or old.status is distinct from 'assigned')
  then
    select decrypted_secret into service_key
    from vault.decrypted_secrets where name = 'notify_driver_service_key';
    select decrypted_secret into shared_secret
    from vault.decrypted_secrets where name = 'notify_driver_shared_secret';

    if service_key is null or shared_secret is null then
      raise warning 'notify-driver secrets missing from Vault; skipping push';
      return new;
    end if;

    -- The edge function only pushes when the payload shows driver_id changing.
    -- A pre-assigned trip that just went live keeps the same driver, so present
    -- the old row without one: from the driver's side it is a new assignment.
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      if old.driver_id is not distinct from new.driver_id then
        v_old := v_old || jsonb_build_object('driver_id', null);
      end if;
    end if;

    perform net.http_post(
      url     := fn_url,
      body    := jsonb_build_object(
                   'type',       tg_op,
                   'table',      'deliveries',
                   'record',     to_jsonb(new),
                   'old_record', v_old
                 ),
      headers := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'Authorization',   'Bearer ' || service_key,
                   'X-Notify-Secret', shared_secret
                 )
    );
  end if;
  return new;
end;
$function$;

-- The push now also depends on status, so fire on status changes too.
drop trigger if exists deliveries_notify_driver on public.deliveries;
create trigger deliveries_notify_driver
  after insert or update of driver_id, status on public.deliveries
  for each row execute function public.notify_driver_on_assignment();

-- In-app notifications.
create or replace function public.notify_on_delivery_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref text := coalesce(new.reference, 'your delivery');
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(org_id, recipient_role, delivery_id, type, title, body)
      values (new.org_id, 'admin', new.id, 'created',
              'New delivery ' || v_ref || ' created', new.goods);
    -- Created with a driver and a drop-off: the driver has it now.
    if new.driver_id is not null and new.status = 'assigned' then
      insert into public.notifications(org_id, recipient_id, recipient_role, delivery_id, type, title, body)
        values (new.org_id, new.driver_id, 'driver', new.id, 'assigned',
                'New delivery assigned — ' || v_ref,
                coalesce(new.origin_label, 'Pickup') || ' to ' || coalesce(new.dest_label, 'the drop-off'));
    end if;
    return new;
  end if;
  if new.picked_up_at is not null and old.picked_up_at is null then
    perform public.notify_all(new, 'picked_up',
      'Pickup confirmed — ' || v_ref, 'The driver has collected the goods.');
  end if;
  if new.status is distinct from old.status then
    if new.status = 'en_route' then
      perform public.notify_all(new, 'en_route', 'Trip started — ' || v_ref, 'The driver is on the way.');
    elsif new.status = 'delivered' then
      perform public.notify_all(new, 'delivered', v_ref || ' delivered', 'The delivery is complete.');
    elsif new.status = 'cancelled' then
      perform public.notify_staff(new, 'cancelled', v_ref || ' cancelled', null);
    elsif new.status in ('pending', 'assigned') and old.status = 'awaiting_dropoff' then
      perform public.notify_staff(new, 'dropoff_set', 'Drop-off set — ' || v_ref, 'The customer set their drop-off location.');
    end if;
  end if;
  if new.driver_id is not null
     and new.status = 'assigned'
     and (new.driver_id is distinct from old.driver_id
          or old.status is distinct from 'assigned')
  then
    insert into public.notifications(org_id, recipient_id, recipient_role, delivery_id, type, title, body)
      values (new.org_id, new.driver_id, 'driver', new.id, 'assigned',
              'New delivery assigned — ' || v_ref,
              coalesce(new.origin_label, 'Pickup') || ' to ' || coalesce(new.dest_label, 'the drop-off'));
  end if;
  return new;
end;
$function$;

-- ------------------------------------------------------------
-- Check the driver on direct writes too.
--
-- assign_delivery_to_driver() already refuses a driver from outside the
-- caller's team, but the create and edit forms write driver_id directly and
-- the RLS policies only look at org_id / agent_id. Without this an agent could
-- put another agent's driver on a delivery (and that driver would see it).
-- Service-role writes (no auth.uid()) only get the same-org check.
-- ------------------------------------------------------------
create or replace function public.check_delivery_driver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.driver_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.driver_id is not distinct from new.driver_id then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.driver_id
      and p.role = 'driver'
      and p.org_id = new.org_id
      and (auth.uid() is null
           or public.auth_role() = 'admin'
           or p.agent_id = auth.uid())
  ) then
    raise exception 'driver not found among your drivers';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_delivery_driver() from public, anon, authenticated;

drop trigger if exists deliveries_check_driver on public.deliveries;
create trigger deliveries_check_driver
  before insert or update of driver_id on public.deliveries
  for each row execute function public.check_delivery_driver();
