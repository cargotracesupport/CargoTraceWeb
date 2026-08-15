-- ============================================================
-- CargoTrace — 0018: notifications.
-- An in-app notification feed for staff (admin/agent/driver) and customers.
-- Rows are created by a delivery-events trigger (created/picked-up/en-route/
-- delivered/cancelled/drop-off-set) and by the app (e.g. a driver turning off
-- location). Staff read via RLS + realtime; customers read by tracking token.
-- ============================================================

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  -- Targeting: a specific user (recipient_id) and/or a whole role in the org.
  recipient_role text check (recipient_role in ('admin','agent','driver','customer')),
  recipient_id   uuid references public.profiles(id) on delete cascade,
  delivery_id    uuid references public.deliveries(id) on delete cascade,
  type           text not null,
  title          text not null,
  body           text,
  created_at     timestamptz not null default now()
);
create index notifications_org_idx on public.notifications(org_id, created_at desc);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index notifications_delivery_idx on public.notifications(delivery_id, created_at desc);

alter table public.notifications enable row level security;

-- Staff read: admins see everything in their org; agents/drivers see rows
-- targeted at them, broadcast to their role, or org-wide. (Customer rows are
-- read by tracking token via a server route, not RLS.) Writes are server-side
-- (trigger / service role), so no insert policy is needed.
create policy notifications_select on public.notifications
  for select using (
    org_id = public.auth_org_id()
    and (
      public.auth_role() = 'admin'
      or recipient_id = auth.uid()
      or (recipient_id is null and recipient_role = public.auth_role())
      or recipient_role is null
    )
  );

alter publication supabase_realtime add table public.notifications;
-- Ship the full row in WAL so realtime RLS can evaluate the recipient columns
-- (same reason as 0009 for the other tenant tables) — without this the live
-- bell silently receives nothing.
alter table public.notifications replica identity full;

-- ── Helpers ──────────────────────────────────────────────
-- Notify the admins + the owning agent about a delivery.
create or replace function public.notify_staff(
  d public.deliveries, p_type text, p_title text, p_body text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(org_id, recipient_role, delivery_id, type, title, body)
    values (d.org_id, 'admin', d.id, p_type, p_title, p_body);
  if d.agent_id is not null then
    insert into public.notifications(org_id, recipient_id, recipient_role, delivery_id, type, title, body)
      values (d.org_id, d.agent_id, 'agent', d.id, p_type, p_title, p_body);
  end if;
end;
$$;

-- Notify staff + the customer (customer row is delivery-scoped).
create or replace function public.notify_all(
  d public.deliveries, p_type text, p_title text, p_body text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_staff(d, p_type, p_title, p_body);
  insert into public.notifications(org_id, recipient_role, delivery_id, type, title, body)
    values (d.org_id, 'customer', d.id, p_type, p_title, p_body);
end;
$$;

-- ── Delivery-events trigger ──────────────────────────────
create or replace function public.notify_on_delivery_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref text := coalesce(new.reference, 'your delivery');
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(org_id, recipient_role, delivery_id, type, title, body)
      values (new.org_id, 'admin', new.id, 'created',
              'New delivery ' || v_ref || ' created', new.goods);
    return new;
  end if;

  -- Pickup confirmed by the driver.
  if new.picked_up_at is not null and old.picked_up_at is null then
    perform public.notify_all(new, 'picked_up',
      'Pickup confirmed — ' || v_ref, 'The driver has collected the goods.');
  end if;

  -- Status transitions.
  if new.status is distinct from old.status then
    if new.status = 'en_route' then
      perform public.notify_all(new, 'en_route',
        'Trip started — ' || v_ref, 'The driver is on the way.');
    elsif new.status = 'delivered' then
      perform public.notify_all(new, 'delivered',
        v_ref || ' delivered', 'The delivery is complete.');
    elsif new.status = 'cancelled' then
      perform public.notify_staff(new, 'cancelled', v_ref || ' cancelled', null);
    elsif new.status = 'pending' and old.status = 'awaiting_dropoff' then
      perform public.notify_staff(new, 'dropoff_set',
        'Drop-off set — ' || v_ref, 'The customer set their drop-off location.');
    end if;
  end if;

  -- Driver assigned (or reassigned) → notify that driver.
  if new.driver_id is not null and new.driver_id is distinct from old.driver_id then
    insert into public.notifications(org_id, recipient_id, recipient_role, delivery_id, type, title, body)
      values (new.org_id, new.driver_id, 'driver', new.id, 'assigned',
              'New delivery assigned — ' || v_ref,
              coalesce(new.origin_label, 'Pickup') || ' to '
                || coalesce(new.dest_label, 'the drop-off'));
  end if;

  return new;
end;
$$;

drop trigger if exists deliveries_notify on public.deliveries;
create trigger deliveries_notify
  after insert or update on public.deliveries
  for each row execute function public.notify_on_delivery_change();
