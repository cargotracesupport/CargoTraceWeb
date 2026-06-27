-- ============================================================
-- 0010: extend the self-privilege lock to ownership columns.
-- 0003 blocked a user from changing their own role / org_id, but profiles_update_self
-- still has no WITH CHECK, so a user could change their own agent_id (re-parent
-- themselves to a different agent) or vehicle_id (claim any vehicle). Lock those
-- two columns for self-service updates as well. Server-side provisioning runs
-- under the service role (auth.uid() is null), so it is unaffected.
-- ============================================================
create or replace function public.prevent_self_privilege_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if new.role is distinct from old.role
       or new.org_id is distinct from old.org_id
       or new.agent_id is distinct from old.agent_id
       or new.vehicle_id is distinct from old.vehicle_id then
      raise exception 'you cannot change your own role, organization, owning agent, or vehicle';
    end if;
  end if;
  return new;
end;
$$;

-- This is a trigger function — it must never be callable as a REST RPC. The
-- trigger fires via the trigger system regardless of EXECUTE grants, so revoking
-- here removes the /rest/v1/rpc surface without affecting the trigger.
revoke execute on function public.prevent_self_privilege_change() from public, anon, authenticated;
