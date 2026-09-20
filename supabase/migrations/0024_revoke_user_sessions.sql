-- ============================================================
-- 0024: revoke a user's sessions from application code.
--
-- Changing a user's password/email via the GoTrue admin API does NOT revoke
-- their existing refresh tokens, and this project has no session expiry, so a
-- driver whose password was changed (or who has left) keeps a working mobile
-- app indefinitely. The usual fix — a trigger on auth.users — is impossible
-- here because the auth schema is locked ("permission denied for schema auth"),
-- and auth-js's admin.signOut() needs the user's JWT (which the server doesn't
-- have), while service_role has no DML on the auth schema.
--
-- postgres DOES have DELETE on auth.sessions / auth.refresh_tokens, so this
-- SECURITY DEFINER function (owned by postgres) does the revoke and is callable
-- by the service-role client via RPC. The app calls it right after a successful
-- credential change. Returns the number of session rows removed.
-- ============================================================
create or replace function public.revoke_user_sessions(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sessions integer;
begin
  -- refresh_tokens.user_id is text; sessions.user_id is uuid.
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_sessions = row_count;
  return v_sessions;
end;
$$;

-- Only the service-role client (server-side) may call this. Callers must
-- authorize the target user themselves before calling.
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
