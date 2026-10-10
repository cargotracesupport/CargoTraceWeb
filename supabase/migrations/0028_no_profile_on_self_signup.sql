-- ============================================================
-- 0028: a self-service sign-up no longer becomes an admin.
--
-- handle_new_user (0001) created a new organisation and an ADMIN profile for
-- every row inserted into auth.users. Supabase public sign-up was enabled, so
-- anyone holding the public anon key could call auth/v1/signup, confirm their
-- email and log in as the admin of their own organisation. From there they
-- could reach every endpoint that only checks "signed in as staff" (paid
-- Google routing, user provisioning, delivery creation feeding the customer
-- phone lookup, ...).
--
-- The app never uses sign-up: drivers and agents are created by
-- /api/drivers and /api/agents with the service role, and those routes now
-- write the profile themselves. So the trigger does nothing any more. A user
-- who signs up on their own gets an auth account with NO profile, which means
-- no role and no organisation: getSessionProfile() returns null, every
-- requireRole() page redirects to /login, and RLS (auth_org_id() is null)
-- shows them nothing.
--
-- The function is emptied rather than the trigger dropped because the trigger
-- sits on auth.users, which this role does not own. Public sign-up should
-- still be switched off in Supabase (Authentication -> Sign In / Providers).
-- A new admin for an existing organisation is created by hand: create the
-- user in the dashboard, then insert its profiles row.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
