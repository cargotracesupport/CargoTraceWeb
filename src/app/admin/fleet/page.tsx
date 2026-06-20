import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Vehicle, Device } from "@/lib/types";
import Fleet from "./_fleet";

export default async function FleetPage() {
  const session = await requireRole("admin");
  const supabase = createClient();

  const [driversRes, vehiclesRes, devicesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "driver")
      .order("full_name", { ascending: true }),
    supabase.from("vehicles").select("*").order("name", { ascending: true }),
    supabase.from("devices").select("*").order("label", { ascending: true }),
  ]);

  const drivers = (driversRes.data ?? []) as Profile[];
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const devices = (devicesRes.data ?? []) as Device[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Fleet</h1>
        <p className="text-sm text-muted2">
          Manage drivers, vehicles and GPS devices for your organization.
        </p>
      </div>

      <Fleet
        orgId={session.profile.org_id}
        drivers={drivers}
        vehicles={vehicles}
        devices={devices}
      />
    </div>
  );
}
