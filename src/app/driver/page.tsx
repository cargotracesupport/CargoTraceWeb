import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import DriverTrips from "./_trips";

export default async function DriverHomePage() {
  const supabase = createClient();
  // RLS scopes this to the signed-in driver's own deliveries.
  const { data } = await supabase
    .from("deliveries")
    .select("*")
    .order("created_at", { ascending: false });

  const deliveries = (data ?? []) as Delivery[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">My deliveries</h1>
        <p className="text-sm text-muted2">
          Same-route deliveries are grouped into one trip. Tap a stop to view it.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <DriverTrips deliveries={deliveries} />
      </div>
    </div>
  );
}
