import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import DriverActions from "./_actions";
import { estimateEtaMinutes, formatEta } from "@/lib/eta";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function Stat({
  label,
  value,
  color = "text-text",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2.5 last:border-0">
      <span className="text-xs text-muted2">{label}</span>
      <span className={`font-mono text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}

export default async function DriverDeliveryPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireRole("driver");

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

  const markers: MapMarker[] = [];
  if (delivery.origin_lat != null && delivery.origin_lng != null) {
    markers.push({
      id: "origin",
      lat: delivery.origin_lat,
      lng: delivery.origin_lng,
      label: delivery.origin_label ?? undefined,
      kind: "origin",
    });
  }
  if (delivery.dest_lat != null && delivery.dest_lng != null) {
    markers.push({
      id: "dest",
      lat: delivery.dest_lat,
      lng: delivery.dest_lng,
      label: delivery.dest_label ?? undefined,
      kind: "dest",
    });
  }
  if (delivery.last_lat != null && delivery.last_lng != null) {
    markers.push({
      id: "truck",
      lat: delivery.last_lat,
      lng: delivery.last_lng,
      label: "You",
      kind: "truck",
    });
  }

  const roadFrom: [number, number] | undefined =
    delivery.origin_lat != null && delivery.origin_lng != null
      ? [delivery.origin_lng, delivery.origin_lat]
      : undefined;
  const roadTo: [number, number] | undefined =
    delivery.dest_lat != null && delivery.dest_lng != null
      ? [delivery.dest_lng, delivery.dest_lat]
      : undefined;

  const liveEta =
    delivery.last_lat != null &&
    delivery.last_lng != null &&
    delivery.dest_lat != null &&
    delivery.dest_lng != null
      ? estimateEtaMinutes(
          { lat: delivery.last_lat, lng: delivery.last_lng },
          { lat: delivery.dest_lat, lng: delivery.dest_lng },
          delivery.last_speed,
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/driver" className="text-sm text-muted2 hover:text-green">
        ← Back to deliveries
      </Link>

      <div className="ct-card flex flex-col gap-3">
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

      <div className="ct-card !p-0 overflow-hidden">
        <div className="h-[300px] w-full sm:h-[360px]">
          {markers.length > 0 ? (
            <LiveMap
              markers={markers}
              roadFrom={roadFrom}
              roadTo={roadTo}
              className="h-full w-full"
              fit
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted2">
              No coordinates to display yet.
            </div>
          )}
        </div>
      </div>

      {delivery.last_lat != null && delivery.last_lng != null ? (
        <div className="ct-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Live position</h2>
            <span className="ct-pill bg-green/10 text-green">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
              GPS lock
            </span>
          </div>
          <div className="px-4">
            <Stat
              label="Coordinates"
              value={`${delivery.last_lat.toFixed(4)}°, ${delivery.last_lng.toFixed(4)}°`}
              color="text-blue"
            />
            {delivery.last_speed != null ? (
              <Stat
                label="Speed"
                value={`${Math.round(delivery.last_speed)} km/h`}
                color="text-green"
              />
            ) : null}
            <Stat label="ETA" value={formatEta(liveEta)} color="text-green" />
            <Stat label="Updated" value={timeAgo(delivery.last_position_at)} />
          </div>
        </div>
      ) : null}

      <DriverActions
        deliveryId={delivery.id}
        status={delivery.status}
        driverId={session.userId}
      />
    </div>
  );
}
