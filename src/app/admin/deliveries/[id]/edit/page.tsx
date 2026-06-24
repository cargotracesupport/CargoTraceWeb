import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Vehicle, Device, Delivery } from "@/lib/types";
import NewDeliveryForm from "../../new/_form";

export default async function EditDeliveryPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireRole("admin");
  const supabase = createClient();

  const [deliveryRes, driversRes, vehiclesRes, devicesRes] = await Promise.all([
    supabase.from("deliveries").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "driver")
      .order("full_name", { ascending: true }),
    supabase.from("vehicles").select("*").order("name", { ascending: true }),
    supabase.from("devices").select("*").order("label", { ascending: true }),
  ]);

  const delivery = deliveryRes.data as Delivery | null;
  if (!delivery) notFound();

  const drivers = (driversRes.data ?? []) as Profile[];
  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const devices = (devicesRes.data ?? []) as Device[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Edit delivery
          </h1>
          <p className="text-sm text-muted2">
            {delivery.reference ?? "Delivery"} — update details, route or
            assignment.
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
        delivery={delivery}
      />
    </div>
  );
}
