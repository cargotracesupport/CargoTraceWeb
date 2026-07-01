import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Vehicle, Device, Delivery } from "@/lib/types";
import NewDeliveryForm from "../../../../admin/deliveries/new/_form";

export default async function AgentEditDeliveryPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireRole("agent");
  const supabase = createClient();

  // RLS scopes deliveries/drivers/vehicles to this agent's own. If the delivery
  // isn't theirs, maybeSingle() returns null -> notFound.
  const [deliveryRes, driversRes, vehiclesRes, devicesRes, activeRes] =
    await Promise.all([
      supabase.from("deliveries").select("*").eq("id", params.id).maybeSingle(),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "driver")
        .order("full_name", { ascending: true }),
      supabase.from("vehicles").select("*").order("name", { ascending: true }),
      supabase.from("devices").select("*").order("label", { ascending: true }),
      supabase
        .from("deliveries")
        .select("id, driver_id, status, reference")
        .in("status", ["assigned", "en_route"]),
    ]);

  const delivery = deliveryRes.data as Delivery | null;
  if (!delivery) notFound();

  const drivers = (driversRes.data ?? []) as Profile[];
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const devices = (devicesRes.data ?? []) as Device[];
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
          <h1 className="text-lg font-semibold tracking-tight">Edit delivery</h1>
          <p className="text-sm text-muted2">
            {delivery.reference ?? "Delivery"} — update details or assignment
            until the trip starts.
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
        delivery={delivery}
        ownerAgentId={session.profile.id}
        backHref="/agent"
        activeAssignments={activeAssignments}
      />
    </div>
  );
}
