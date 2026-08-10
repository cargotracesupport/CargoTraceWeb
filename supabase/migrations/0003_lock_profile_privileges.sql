-- ============================================================
-- 0003: prevent self privilege escalation.
-- The profiles_update_self policy lets a user update their own row, but it has
-- no WITH CHECK — so a user could flip their own role (driver/agent -> admin)
-- or move themselves to another org. Lock role + org_id for self-service
-- updates. Server-side provisioning (creating drivers/agents) runs under the
-- service role, which has no auth.uid(), so it is unaffected.
-- ============================================================
create or replace function public.prevent_self_privilege_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if new.role is distinct from old.role
       or new.org_id is distinct from old.org_id then
      raise exception 'you cannot change your own role or organization';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_privileged_columns on public.profiles;
create trigger profiles_lock_privileged_columns
  before update on public.profiles
  for each row execute function public.prevent_self_privilege_change();
