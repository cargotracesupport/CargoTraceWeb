import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emailsByIds } from "@/lib/emails";
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
  // Login emails for THIS agent's own drivers (the RLS query above already
  // scoped the list), so they can edit them too.
  const emails = await emailsByIds(drivers.map((d) => d.id));

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
        <DriversManager drivers={drivers} vehicles={vehicles} emails={emails} />
        <VehiclesManager
          orgId={session.profile.org_id}
          agentId={session.profile.id}
          vehicles={vehicles}
        />
      </div>
    </div>
  );
}
