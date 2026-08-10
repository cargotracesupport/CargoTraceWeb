import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Vehicle, Device } from "@/lib/types";
import NewDeliveryForm from "./_form";

export default async function NewDeliveryPage() {
  const session = await requireRole("admin");
  const supabase = createClient();

  const [driversRes, vehiclesRes, devicesRes, agentsRes, activeRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "driver")
        .order("full_name", { ascending: true }),
      supabase.from("vehicles").select("*").order("name", { ascending: true }),
      supabase.from("devices").select("*").order("label", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "agent")
        .order("full_name", { ascending: true }),
      supabase
        .from("deliveries")
        .select("id, driver_id, status, reference")
        .in("status", ["assigned", "en_route"]),
    ]);

  const drivers = (driversRes.data ?? []) as Profile[];
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const devices = (devicesRes.data ?? []) as Device[];
  const agents = (agentsRes.data ?? []) as { id: string; full_name: string | null }[];
  const activeAssignments = (activeRes.data ?? []) as {
    id: string;
    driver_id: string | null;
    status: string;
    reference: string | null;
  }[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">New delivery</h1>
          <p className="text-sm text-muted2">
            Create a delivery and (optionally) assign a driver, vehicle, device.
          </p>
        </div>
        <Link href="/admin/deliveries" className="ct-btn-ghost">
          Cancel
        </Link>
      </div>

      <NewDeliveryForm
        orgId={session.profile.org_id}
        drivers={drivers}
        vehicles={vehicles}
        devices={devices}
        agents={agents}
        activeAssignments={activeAssignments}
      />
    </div>
  );
}
