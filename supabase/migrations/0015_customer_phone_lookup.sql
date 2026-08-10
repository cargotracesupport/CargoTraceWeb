-- ============================================================
-- 0015: look up a customer's deliveries by mobile number.
-- Backs the customer home page (phone + delivery-reference login). Phones are
-- stored as free text ("+91 90000 00000" vs "9000000000"), so equality is on
-- the trailing 10 digits. SECURITY DEFINER + revoked from every client role:
-- only the service-role API route (which enforces the reference check and rate
-- limit) can call it.
-- ============================================================
create or replace function public.deliveries_for_customer_phone(p_phone text)
returns setof public.deliveries
language sql security definer set search_path = public as $$
  select d.* from public.deliveries d
  where length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 6
    and right(regexp_replace(coalesce(d.customer_phone, ''), '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
  order by d.created_at desc
$$;

revoke execute on function public.deliveries_for_customer_phone(text)
  from public, anon, authenticated;
