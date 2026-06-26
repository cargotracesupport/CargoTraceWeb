import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import Dashboard, { type DeliveryRow } from "./_dashboard";

export default async function AdminDashboardPage() {
  const supabase = createClient();

  // Active deliveries for the live map + list.
  const { data: active } = await supabase
    .from("deliveries")
    .select(
      "*, driver:profiles!deliveries_driver_id_fkey(full_name), vehicle:vehicles(name, plate), agent:profiles!deliveries_agent_id_fkey(full_name)",
    )
    .in("status", ["assigned", "en_route"])
    .order("created_at", { ascending: false });

  // All deliveries (status + delivered_at only) for simple counts.
  const { data: all } = await supabase
    .from("deliveries")
    .select("status,delivered_at");

  const activeDeliveries = (active ?? []) as DeliveryRow[];
  const rows = (all ?? []) as Pick<Delivery, "status" | "delivered_at">[];

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

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const counts = {
    enRoute: rows.filter((r) => r.status === "en_route").length,
    assigned: rows.filter((r) => r.status === "assigned").length,
    deliveredToday: rows.filter(
      (r) =>
        r.status === "delivered" &&
        r.delivered_at != null &&
        new Date(r.delivered_at) >= startOfToday,
    ).length,
    total: rows.length,
    drivers: driversC.count ?? 0,
    vehicles: vehiclesC.count ?? 0,
    agents: agentsC.count ?? 0,
  };

  return <Dashboard initial={activeDeliveries} counts={counts} />;
}
