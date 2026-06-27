import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AgentMap, { type DeliveryRow } from "./_map";

export default async function AgentMapPage() {
  const session = await requireRole("agent");
  const supabase = createClient();

  // RLS scopes deliveries to the agent's own (deliveries_agent_select).
  // The joined driver + vehicle are visible to the agent via their respective
  // profiles/vehicles policies (they own them). FK names are disambiguated
  // because the deliveries table has two FKs into profiles (driver + agent).
  // Include 'awaiting_dropoff' — a driver may already be assigned and reporting
  // GPS while the customer is setting the destination.
  const { data: active } = await supabase
    .from("deliveries")
    .select(
      "*, driver:profiles!deliveries_driver_id_fkey(full_name), vehicle:vehicles(name, plate)",
    )
    .in("status", ["awaiting_dropoff", "assigned", "en_route"])
    .order("created_at", { ascending: false });

  const initial = (active ?? []) as DeliveryRow[];
  return <AgentMap initial={initial} agentId={session.profile.id} />;
}
