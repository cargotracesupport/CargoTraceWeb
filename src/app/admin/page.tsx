import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import Dashboard from "./_dashboard";

export default async function AdminDashboardPage() {
  const supabase = createClient();

  // Active deliveries for the live map + list.
  const { data: active } = await supabase
    .from("deliveries")
    .select("*")
    .in("status", ["assigned", "en_route"])
    .order("created_at", { ascending: false });

  // All deliveries (status + delivered_at only) for simple counts.
  const { data: all } = await supabase
    .from("deliveries")
    .select("status,delivered_at");

  const activeDeliveries = (active ?? []) as Delivery[];
  const rows = (all ?? []) as Pick<Delivery, "status" | "delivered_at">[];

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
  };

  return <Dashboard initial={activeDeliveries} counts={counts} />;
}
