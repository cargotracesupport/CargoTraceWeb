-- ============================================================
-- 0031: limit what an agent can do to a delivery's lifecycle.
--
-- deliveries_agent_update / deliveries_agent_insert only check org_id and
-- agent_id, so an agent could (through the edit form, or the REST API
-- directly) mark their own deliveries en route or delivered, back-date the
-- trip timestamps, rewrite the truck position customers see, or change the
-- tracking link. Drivers already have the matching guard
-- (enforce_driver_update_scope).
--
-- For callers whose role is 'agent':
--   * insert: only a not-started delivery (awaiting_dropoff / pending /
--     assigned) with no trip timestamps and no position;
--   * update: no changes to started_at, picked_up_at, delivered_at, the
--     last_* position columns or tracking_token;
--   * status: only between awaiting_dropoff / pending / assigned, or from one
--     of those to cancelled. En route and delivered are recorded by the
--     driver (or an admin).
-- Admins, drivers (their own trigger) and server-side writes (service role,
-- auth_role() is null) are not affected.
-- ============================================================
create or replace function public.enforce_agent_delivery_scope()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.auth_role() is distinct from 'agent' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('awaiting_dropoff', 'pending', 'assigned')
       or new.started_at is not null
       or new.picked_up_at is not null
       or new.delivered_at is not null
       or new.last_lat is not null
       or new.last_lng is not null
       or new.last_position_at is not null
    then
      raise exception 'an agent can only create a delivery that has not started';
    end if;
    return new;
  end if;

  if new.started_at       is distinct from old.started_at
     or new.picked_up_at  is distinct from old.picked_up_at
     or new.delivered_at  is distinct from old.delivered_at
     or new.last_lat      is distinct from old.last_lat
     or new.last_lng      is distinct from old.last_lng
     or new.last_speed    is distinct from old.last_speed
     or new.last_position_at is distinct from old.last_position_at
     or new.tracking_token is distinct from old.tracking_token
  then
    raise exception 'an agent cannot record trip progress or change the tracking link';
  end if;

  if new.status is distinct from old.status
     and not (
       old.status in ('awaiting_dropoff', 'pending', 'assigned')
       and new.status in ('awaiting_dropoff', 'pending', 'assigned', 'cancelled')
     )
  then
    raise exception 'an agent cannot move a delivery from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_agent_delivery_scope() from public, anon, authenticated;

drop trigger if exists deliveries_agent_scope on public.deliveries;
create trigger deliveries_agent_scope
  before insert or update on public.deliveries
  for each row execute function public.enforce_agent_delivery_scope();
