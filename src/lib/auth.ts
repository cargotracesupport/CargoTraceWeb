import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

/** Returns the signed-in user + their profile, or null if not authenticated. */
export async function getSessionProfile(): Promise<{
  userId: string;
  email: string | null;
  profile: Profile;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return { userId: user.id, email: user.email ?? null, profile: profile as Profile };
}

/** Guard for a page/layout: require auth + (optionally) a specific role. Redirects otherwise. */
export async function requireRole(role?: Role) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (role && session.profile.role !== role) {
    redirect(session.profile.role === "admin" ? "/admin" : "/driver");
  }
  return session;
}

/** Where to send a user after login, based on role. */
export function homePathForRole(role: Role): string {
  return role === "admin" ? "/admin" : "/driver";
}
