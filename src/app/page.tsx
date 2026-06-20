import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { homePathForRole } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  redirect(homePathForRole(session.profile.role));
}
