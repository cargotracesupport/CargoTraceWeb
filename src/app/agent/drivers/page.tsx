import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Vehicle } from "@/lib/types";
import DriversManager from "./_drivers";
import VehiclesManager from "./_vehicles";

export default async function AgentDriversPage() {
  const session = await requireRole("agent");
  const supabase = createClient();

  const [driversRes, vehiclesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "driver")
      .order("full_name", { ascending: true }),
    supabase.from("vehicles").select("*").order("plate", { ascending: true }),
  ]);

  const drivers = (driversRes.data ?? []) as Profile[];
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Drivers &amp; vehicles
        </h1>
        <p className="text-sm text-muted2">
          Add the drivers and vehicle numbers you assign at dispatch. A driver
          isn&rsquo;t tied to one vehicle — you pick the vehicle per delivery.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DriversManager drivers={drivers} />
        <VehiclesManager orgId={session.profile.org_id} vehicles={vehicles} />
      </div>
    </div>
  );
}
