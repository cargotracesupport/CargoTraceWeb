import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import DriverTrip from "./_trip";

export default async function DriverDeliveryPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("driver");

  const supabase = createClient();
  const { data } = await supabase
    .from("deliveries")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/driver" className="text-sm text-muted2 hover:text-green">
          ← Back to deliveries
        </Link>
        <div className="ct-card py-12 text-center text-sm text-muted2">
          Delivery not found.
        </div>
      </div>
    );
  }

  const delivery = data as Delivery;

  const origin =
    delivery.origin_lat != null && delivery.origin_lng != null
      ? {
          lat: delivery.origin_lat,
          lng: delivery.origin_lng,
          label: delivery.origin_label,
        }
      : null;
  const dest =
    delivery.dest_lat != null && delivery.dest_lng != null
      ? { lat: delivery.dest_lat, lng: delivery.dest_lng, label: delivery.dest_label }
      : null;
  const initialPos =
    delivery.last_lat != null && delivery.last_lng != null
      ? { lat: delivery.last_lat, lng: delivery.last_lng }
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/driver" className="text-sm text-muted2 hover:text-green">
        ← Back to deliveries
      </Link>

      <div className="ct-card flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium">{delivery.reference}</p>
            <p className="text-sm text-muted2">{delivery.goods}</p>
          </div>
          <DeliveryStatusBadge status={delivery.status} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-s2 p-3">
            <p className="ct-label">Origin</p>
            <p className="text-sm text-text">{delivery.origin_label}</p>
            {delivery.origin_lat != null && delivery.origin_lng != null ? (
              <p className="mt-1 font-mono text-xs text-muted">
                {delivery.origin_lat.toFixed(5)}, {delivery.origin_lng.toFixed(5)}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-border bg-s2 p-3">
            <p className="ct-label">Destination</p>
            <p className="text-sm text-green">{delivery.dest_label}</p>
            {delivery.dest_lat != null && delivery.dest_lng != null ? (
              <p className="mt-1 font-mono text-xs text-muted">
                {delivery.dest_lat.toFixed(5)}, {delivery.dest_lng.toFixed(5)}
              </p>
            ) : null}
          </div>
        </div>

        {delivery.customer_name || delivery.customer_phone ? (
          <div className="rounded-lg border border-border bg-s2 p-3">
            <p className="ct-label">Customer</p>
            <p className="text-sm text-text">{delivery.customer_name ?? "—"}</p>
            {delivery.customer_phone ? (
              <a
                href={`tel:${delivery.customer_phone}`}
                className="mt-1 inline-block font-mono text-sm text-green hover:underline"
              >
                {delivery.customer_phone}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <DriverTrip
        deliveryId={delivery.id}
        status={delivery.status}
        origin={origin}
        dest={dest}
        initialPos={initialPos}
      />
    </div>
  );
}
