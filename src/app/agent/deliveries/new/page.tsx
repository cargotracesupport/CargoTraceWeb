import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Vehicle, Device } from "@/lib/types";
import NewDeliveryForm from "../../../admin/deliveries/new/_form";

export default async function AgentNewDeliveryPage() {
  const session = await requireRole("agent");
  const supabase = createClient();

  // RLS scopes drivers to this agent's own; vehicles/devices are org-shared.
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">New delivery</h1>
          <p className="text-sm text-muted2">
            Create a delivery for your customer, then assign one of your drivers.
          </p>
        </div>
        <Link href="/agent" className="ct-btn-ghost">
          Cancel
        </Link>
      </div>

      <NewDeliveryForm
        orgId={session.profile.org_id}
        drivers={drivers}
        vehicles={vehicles}
        devices={devices}
        ownerAgentId={session.profile.id}
        backHref="/agent"
      />
    </div>
  );
}
