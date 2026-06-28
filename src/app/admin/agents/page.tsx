import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import AgentsManager from "./_agents";

export default async function AgentsPage() {
  await requireRole("admin");
  const supabase = createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "agent")
    .order("full_name", { ascending: true });

  const agents = (data ?? []) as Profile[];

  // Login emails live in auth.users, not profiles — fetch them so the admin can
  // see and edit each agent's email. Uses the service-role client (admin-only page).
  const admin = createAdminClient();
  const emailPairs = await Promise.all(
    agents.map(async (a) => {
      const { data: u } = await admin.auth.admin.getUserById(a.id);
      return [a.id, u.user?.email ?? ""] as const;
    }),
  );
  const emails = Object.fromEntries(emailPairs) as Record<string, string>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted2">
          Dispatchers who assign deliveries to your drivers. They sign in and
          land on the dispatch board.
        </p>
      </div>

      <AgentsManager agents={agents} emails={emails} />
    </div>
  );
}
