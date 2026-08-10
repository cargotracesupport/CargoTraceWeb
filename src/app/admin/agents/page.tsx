import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emailsByIds } from "@/lib/emails";
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
  // see and edit each agent's email.
  const emails = await emailsByIds(agents.map((a) => a.id));

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
