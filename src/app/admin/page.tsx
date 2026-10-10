import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Dashboard, { type DeliveryRow } from "./_dashboard";

// Midnight today in India (UTC+5:30, no DST), as an ISO timestamp. The server
// runs in UTC, so a plain setHours(0) would roll "today" over at 05:30 IST.
function startOfTodayIST(): string {
  const IST_MS = 330 * 60_000;
  const ist = new Date(Date.now() + IST_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS,
  ).toISOString();
}

export default async function AdminDashboardPage() {
  // The layout checks the role too; checking here as well keeps the page safe
  // on its own (layouts can be skipped during partial rendering).
  const session = await requireRole("admin");
  const supabase = createClient();

  // Active deliveries for the live map + list.
  const { data: active } = await supabase
    .from("deliveries")
    .select(
      "*, driver:profiles!deliveries_driver_id_fkey(full_name), vehicle:vehicles(name, plate, length_m, width_m, capacity_kg), agent:profiles!deliveries_agent_id_fkey(full_name)",
    )
    .in("status", ["awaiting_dropoff", "pending", "assigned", "en_route"])
    .order("created_at", { ascending: false });

  const activeDeliveries = (active ?? []) as DeliveryRow[];

  // Counts are counted by the database (head + count), not by fetching every
  // row: PostgREST returns at most 1000 rows, so counting in JS silently
  // under-reported past that. All org-scoped by RLS; trashed rows excluded.
  const countDeliveries = () =>
    supabase.from("deliveries").select("id", { count: "exact", head: true });
  const [enRouteC, assignedC, deliveredTodayC, totalC] = await Promise.all([
    countDeliveries().eq("status", "en_route"),
    countDeliveries().eq("status", "assigned"),
    countDeliveries()
      .eq("status", "delivered")
      .gte("delivered_at", startOfTodayIST()),
    countDeliveries(),
  ]);

  // Team & fleet counts (org-scoped by RLS).
  const [driversC, vehiclesC, agentsC] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "driver"),
    supabase.from("vehicles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "agent"),
  ]);

  const counts = {
    enRoute: enRouteC.count ?? 0,
    assigned: assignedC.count ?? 0,
    deliveredToday: deliveredTodayC.count ?? 0,
    total: totalC.count ?? 0,
    drivers: driversC.count ?? 0,
    vehicles: vehiclesC.count ?? 0,
    agents: agentsC.count ?? 0,
  };

  return (
    <Dashboard
      initial={activeDeliveries}
      counts={counts}
      orgId={session.profile.org_id}
    />
  );
}
