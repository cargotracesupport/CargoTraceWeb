// Server-side only: writes staff profiles with the service-role client.
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type StaffProfile = {
  org_id: string;
  role: "driver" | "agent";
  full_name: string;
  phone: string | null;
  vehicle_id?: string | null;
  agent_id?: string | null;
};

/**
 * Create (or overwrite) the profile of a login that /api/drivers or
 * /api/agents just created. Returns an error message, or null on success.
 *
 * Since migration 0028 the auth.users trigger no longer creates a profile, so
 * the route writes it here. Before 0028 the trigger made a throwaway "My
 * Company" organisation with an admin profile; the upsert overwrites that
 * profile and the old organisation is deleted, so this works on either side
 * of the migration.
 */
export async function writeStaffProfile(
  admin: Admin,
  userId: string,
  profile: StaffProfile,
): Promise<string | null> {
  const { data: before } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, ...profile }, { onConflict: "id" });
  if (error) return error.message;

  // Drop the throwaway organisation, but only when nobody else belongs to it
  // (deleting an organisation cascades to its data).
  if (before?.org_id && before.org_id !== profile.org_id) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", before.org_id);
    if (count === 0) {
      await admin.from("organizations").delete().eq("id", before.org_id);
    }
  }
  return null;
}
