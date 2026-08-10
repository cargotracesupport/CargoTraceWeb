import { redirect } from "next/navigation";
import { getSessionProfile, homePathForRole } from "@/lib/auth";
import LoginForm from "./_form";

// Always check the session fresh (and don't cache the page) so that pressing
// Back after signing in redirects to the console instead of showing the form.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSessionProfile();
  if (session) redirect(homePathForRole(session.profile.role));
  return <LoginForm />;
}
