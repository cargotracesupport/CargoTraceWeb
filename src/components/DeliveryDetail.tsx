import Link from "next/link";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import { formatVehicleSpecs } from "@/lib/vehicle";
import {
  MapPin,
  Flag,
  Phone,
  Truck,
  Clock,
  Package,
  Locate,
  Contact,
} from "@/components/icons";
import type { Delivery } from "@/lib/types";

export interface DeliveryDetailData {
  delivery: Delivery;
  driver: { full_name: string | null; phone: string | null } | null;
  vehicle: {
    name: string | null;
    plate: string | null;
    length_m: number | null;
    width_m: number | null;
    capacity_kg: number | null;
  } | null;
  agent: { full_name: string | null } | null;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function coords(lat: number | null, lng: number | null): string | null {
  return lat != null && lng != null
    ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    : null;
}

/** Read-only, full detail of one delivery — locations, customer, driver, timeline. */
export default function DeliveryDetail({
  data,
  trackHref,
}: {
  data: DeliveryDetailData;
  /** Absolute or relative URL to the public tracker (optional). */
  trackHref?: string;
}) {
  const { delivery: d, driver, vehicle, agent } = data;

  const markers: MapMarker[] = [];
  if (d.origin_lat != null && d.origin_lng != null)
    markers.push({
      id: "origin",
      lat: d.origin_lat,
      lng: d.origin_lng,
      label: d.origin_label ?? "Pickup",
      kind: "origin",
    });
  if (d.dest_lat != null && d.dest_lng != null)
    markers.push({
      id: "dest",
      lat: d.dest_lat,
      lng: d.dest_lng,
      label: d.dest_label ?? "Drop-off",
      kind: "dest",
    });
  if (d.last_lat != null && d.last_lng != null)
    markers.push({
      id: "truck",
      lat: d.last_lat,
      lng: d.last_lng,
      label: "Last position",
      kind: "truck",
    });

  const roadFrom: [number, number] | undefined =
    d.origin_lat != null && d.origin_lng != null
      ? [d.origin_lng, d.origin_lat]
      : undefined;
  const roadTo: [number, number] | undefined =
    d.dest_lat != null && d.dest_lng != null
      ? [d.dest_lng, d.dest_lat]
      : undefined;

  const specs = vehicle
    ? formatVehicleSpecs({
        length_m: vehicle.length_m,
        width_m: vehicle.width_m,
        capacity_kg: vehicle.capacity_kg,
      })
    : null;

  const timeline: Array<{ label: string; at: string | null }> = [
    { label: "Created", at: d.created_at },
    { label: "Driver assigned", at: d.assigned_at },
    { label: "Trip started", at: d.started_at },
    { label: "Pickup confirmed", at: d.picked_up_at },
    {
      label: d.status === "cancelled" ? "Cancelled" : "Delivered",
      at: d.delivered_at,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <section className="ct-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-semibold text-primary">
                {d.reference ?? "—"}
              </span>
              <DeliveryStatusBadge status={d.status} />
            </div>
            {d.goods ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted2">
                <Package className="h-3.5 w-3.5" /> {d.goods}
              </p>
            ) : null}
          </div>
          {trackHref ? (
            <Link
              href={trackHref}
              target="_blank"
              rel="noreferrer"
              className="ct-btn-ghost shrink-0"
            >
              <Locate className="h-4 w-4" /> Open tracker
            </Link>
          ) : null}
        </div>
      </section>

      {/* Map */}
      {markers.length > 0 ? (
        <section className="ct-card overflow-hidden p-0">
          <div className="h-[42vh] min-h-[280px] w-full">
            <LiveMap
              markers={markers}
              roadFrom={roadFrom}
              roadTo={roadTo}
              fit
              className="h-full w-full"
            />
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Locations */}
        <section className="ct-card p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
            Locations
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            <Row
              icon={<MapPin className="h-4 w-4 text-primary" />}
              label="Pickup"
              value={d.origin_label ?? "—"}
              sub={coords(d.origin_lat, d.origin_lng)}
            />
            <Row
              icon={<Flag className="h-4 w-4 text-accent" />}
              label="Drop-off"
              value={d.dest_label ?? "Not set yet"}
              sub={coords(d.dest_lat, d.dest_lng)}
            />
          </div>
        </section>

        {/* Customer */}
        <section className="ct-card p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
            Customer
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            <Row
              icon={<Contact className="h-4 w-4 text-primary" />}
              label="Name"
              value={d.customer_name ?? "—"}
            />
            <Row
              icon={<Phone className="h-4 w-4 text-primary" />}
              label="Phone"
              value={
                d.customer_phone ? (
                  <a
                    href={`tel:${d.customer_phone}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {d.customer_phone}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Row
              icon={<span className="text-sm text-muted2">@</span>}
              label="Email"
              value={d.customer_email ?? "—"}
            />
          </div>
        </section>

        {/* Assignment */}
        <section className="ct-card p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
            Assignment
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            <Row
              icon={<Truck className="h-4 w-4 text-primary" />}
              label="Driver"
              value={driver?.full_name ?? "Unassigned"}
              sub={driver?.phone ?? null}
            />
            <Row
              icon={<Truck className="h-4 w-4 text-muted2" />}
              label="Vehicle"
              value={
                vehicle
                  ? [vehicle.name, vehicle.plate].filter(Boolean).join(" · ") ||
                    "—"
                  : "—"
              }
              sub={specs}
            />
            {agent?.full_name ? (
              <Row
                icon={<span className="text-sm text-muted2">◆</span>}
                label="Agent"
                value={agent.full_name}
              />
            ) : null}
          </div>
        </section>

        {/* Timeline */}
        <section className="ct-card p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
            Timeline
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {timeline.map((t) => (
              <li key={t.label} className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    t.at ? "bg-primary/10 text-primary" : "bg-s2 text-muted"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="text-sm text-text">{t.label}</span>
                  <span className="shrink-0 font-mono text-xs text-muted2">
                    {fmt(t.at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-s2">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted2">
          {label}
        </div>
        <div className="text-sm font-medium text-text">{value}</div>
        {sub ? <div className="mt-0.5 text-xs text-muted2">{sub}</div> : null}
      </div>
    </div>
  );
}
