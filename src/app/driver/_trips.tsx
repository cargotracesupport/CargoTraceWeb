"use client";

import Link from "next/link";
import type { Delivery } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import { MapPin, Flag } from "@/components/icons";
import { groupSameRoute, haversineKm, type Pt } from "@/lib/cluster";

const ACTIVE = new Set(["assigned", "en_route"]);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Order a group's stops nearest-first from the shared pickup (simple greedy
// route), so labels A, B, C follow a sensible driving order.
function orderStops(group: Delivery[]): Delivery[] {
  if (group.length <= 1) return group;
  const start: Pt | null =
    group[0].origin_lat != null && group[0].origin_lng != null
      ? { lat: group[0].origin_lat, lng: group[0].origin_lng }
      : null;
  if (!start) return group;
  const rest = group.filter((d) => d.dest_lat != null && d.dest_lng != null);
  const noPts = group.filter((d) => d.dest_lat == null || d.dest_lng == null);
  const ordered: Delivery[] = [];
  let cur = start;
  while (rest.length) {
    let bi = 0;
    let bd = Infinity;
    rest.forEach((d, i) => {
      const dist = haversineKm(cur, {
        lat: d.dest_lat as number,
        lng: d.dest_lng as number,
      });
      if (dist < bd) {
        bd = dist;
        bi = i;
      }
    });
    const next = rest.splice(bi, 1)[0];
    ordered.push(next);
    cur = { lat: next.dest_lat as number, lng: next.dest_lng as number };
  }
  return [...ordered, ...noPts];
}

export default function DriverTrips({ deliveries }: { deliveries: Delivery[] }) {
  const active = deliveries.filter((d) => ACTIVE.has(d.status));
  const doneList = deliveries.filter(
    (d) => d.status === "delivered" || d.status === "cancelled",
  );

  const withPts = active
    .filter(
      (d) =>
        d.origin_lat != null &&
        d.origin_lng != null &&
        d.dest_lat != null &&
        d.dest_lng != null,
    )
    .map((d) => ({
      delivery: d,
      origin: { lat: d.origin_lat as number, lng: d.origin_lng as number },
      dest: { lat: d.dest_lat as number, lng: d.dest_lng as number },
    }));
  const grouped = groupSameRoute(withPts).map((g) =>
    orderStops(g.map((x) => x.delivery)),
  );
  const singles = active
    .filter((d) => d.origin_lat == null || d.dest_lat == null)
    .map((d) => [d]);
  const trips = [...grouped, ...singles];

  return (
    <>
      {trips.length === 0 && doneList.length === 0 ? (
        <div className="ct-card flex flex-col items-center gap-2 px-5 py-12 text-center">
          <p className="text-sm text-muted2">No deliveries assigned yet.</p>
        </div>
      ) : null}

      {trips.map((trip, ti) =>
        trip.length > 1 ? (
          <MultiStopTrip key={trip[0].id} stops={trip} index={ti} />
        ) : (
          <SingleCard key={trip[0].id} d={trip[0]} />
        ),
      )}

      {doneList.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted2">Completed</h2>
          {doneList.map((d) => (
            <SingleCard key={d.id} d={d} muted />
          ))}
        </div>
      ) : null}
    </>
  );
}

function MultiStopTrip({ stops, index }: { stops: Delivery[]; index: number }) {
  const anyMoving = stops.some((s) => s.status === "en_route");
  return (
    <div className="ct-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Trip {index + 1}</h2>
          <span className="ct-pill bg-primary/10 text-primary">
            {stops.length} stops
          </span>
        </div>
        {anyMoving ? (
          <span className="ct-pill bg-green/10 text-green">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
            In progress
          </span>
        ) : (
          <span className="ct-pill bg-amber/10 text-amber">Not started</span>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-xs">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate text-muted2">
          Pickup: {stops[0].origin_label ?? "—"}
        </span>
      </div>

      <ul className="divide-y divide-border">
        {stops.map((d, i) => (
          <li key={d.id}>
            <Link
              href={`/driver/deliveries/${d.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-s2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {LETTERS[i] ?? "•"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Flag className="h-3.5 w-3.5 shrink-0 text-green" />
                  <span className="truncate text-sm font-medium">
                    {d.dest_label ?? "Drop-off"}
                  </span>
                </div>
                <p className="truncate text-xs text-muted">
                  {d.reference ?? ""}
                  {d.customer_name ? ` · ${d.customer_name}` : ""}
                </p>
              </div>
              <DeliveryStatusBadge status={d.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SingleCard({ d, muted }: { d: Delivery; muted?: boolean }) {
  return (
    <Link
      href={`/driver/deliveries/${d.id}`}
      className={`ct-card block p-4 transition-colors hover:border-primary/60 ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium">{d.reference}</p>
          <p className="truncate text-sm text-muted2">{d.goods}</p>
        </div>
        <DeliveryStatusBadge status={d.status} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="truncate text-text">{d.origin_label}</span>
        <span className="text-muted">→</span>
        <span className="truncate text-green">{d.dest_label}</span>
      </div>
      {d.customer_name ? (
        <p className="mt-2 text-xs text-muted">Customer: {d.customer_name}</p>
      ) : null}
    </Link>
  );
}
