-- ============================================================
-- 0023: auto-generate delivery reference numbers (CT-1000, CT-1001, …).
--
-- The create-delivery form no longer asks for a reference. On insert, if none
-- is supplied, a BEFORE INSERT trigger assigns the next number from a sequence
-- that starts at 1000. Editing a delivery can still set the reference by hand.
--
-- Numbering starts at CT-1000 by request. References are display labels (not a
-- unique key — tracking_token is), so this does not attempt to avoid clashing
-- with pre-existing test references.
-- ============================================================

create sequence if not exists public.delivery_reference_seq
  as bigint start with 1000 increment by 1;

-- Force the next number to 1000 even if the sequence already existed.
select setval('public.delivery_reference_seq', 1000, false);

-- Assign the next reference when one isn't provided.
create or replace function public.set_delivery_reference()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := 'CT-' || nextval('public.delivery_reference_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_set_reference on public.deliveries;
create trigger deliveries_set_reference
  before insert on public.deliveries
  for each row execute function public.set_delivery_reference();

-- The insert runs as the signed-in staff member, so that role needs to draw
-- from the sequence.
grant usage, select on sequence public.delivery_reference_seq to authenticated;
