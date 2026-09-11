import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ProfileView from "@/components/ProfileView";

export default async function DriverProfilePage() {
  const session = await requireRole("driver");
  const supabase = createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", session.profile.org_id)
    .maybeSingle();

  return (
    <ProfileView
      initial={{
        userId: session.userId,
        fullName: session.profile.full_name,
        phone: session.profile.phone,
        email: session.email,
        role: session.profile.role,
        orgName: org?.name ?? null,
        createdAt: session.profile.created_at,
      }}
    />
  );
}
