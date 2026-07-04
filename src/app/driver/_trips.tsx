"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Delivery } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import { MapPin, Flag } from "@/components/icons";
import { groupSameRoute, haversineKm, type Pt } from "@/lib/cluster";
import { groupByRoad, type RouteItem } from "@/lib/routeGroup";
import { roadRouteThrough } from "@/lib/route";

const ACTIVE = new Set(["assigned", "en_route"]);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Order a group's stops nearest-first from the shared pickup (simple greedy
// route), so labels A, B, C follow a sensible driving order. Used as a fallback
// when road routing is unavailable.
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

  // Regroup only when the active set actually changes.
  const activeSig = useMemo(
    () =>
      JSON.stringify(
        active.map((d) => [
          d.id,
          d.status,
          d.origin_lat,
          d.origin_lng,
          d.dest_lat,
          d.dest_lng,
        ]),
      ),
    [active],
  );

  const withPts = useMemo(
    () =>
      active.filter(
        (d) =>
          d.origin_lat != null &&
          d.origin_lng != null &&
          d.dest_lat != null &&
          d.dest_lng != null,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSig],
  );
  const singles = useMemo(
    () =>
      active
        .filter((d) => d.origin_lat == null || d.dest_lat == null)
        .map((d) => [d]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSig],
  );

  // Instant straight-line grouping — shown immediately and used as a fallback
  // whenever road routing is unavailable.
  const fallbackGroups = useMemo(() => {
    const items = withPts.map((d) => ({
      delivery: d,
      origin: { lat: d.origin_lat as number, lng: d.origin_lng as number },
      dest: { lat: d.dest_lat as number, lng: d.dest_lng as number },
    }));
    return groupSameRoute(items).map((g) =>
      orderStops(g.map((x) => x.delivery)),
    );
  }, [withPts]);

  // Accurate grouping by real driving detour (OSRM) — matches the dispatch
  // board, so a driver's assigned same-route stops appear as one trip.
  const [roadGroups, setRoadGroups] = useState<Delivery[][] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (withPts.length < 2) {
      setRoadGroups(null);
      return;
    }
    const items: RouteItem<Delivery>[] = withPts.map((d) => ({
      id: d.id,
      origin: { lat: d.origin_lat as number, lng: d.origin_lng as number },
      dest: { lat: d.dest_lat as number, lng: d.dest_lng as number },
      ref: d,
    }));
    groupByRoad(items)
      .then((groups) => {
        if (cancelled) return;
        setRoadGroups(groups ? groups.map((g) => g.map((it) => it.ref)) : null);
      })
      .catch(() => {
        if (!cancelled) setRoadGroups(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSig]);

  const grouped = roadGroups ?? fallbackGroups;
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
  const pickup = stops[0];

  // Map markers: pickup + each drop-off lettered A/B/C in visiting order, plus
  // the driver's live position (any en-route stop carries the fanned-out fix).
  const markers: MapMarker[] = [];
  if (pickup.origin_lat != null && pickup.origin_lng != null) {
    markers.push({
      id: "origin",
      lng: pickup.origin_lng,
      lat: pickup.origin_lat,
      label: pickup.origin_label ?? "Pickup",
      kind: "origin",
    });
  }
  stops.forEach((d, i) => {
    if (d.dest_lat != null && d.dest_lng != null) {
      markers.push({
        id: d.id,
        lng: d.dest_lng,
        lat: d.dest_lat,
        label: d.dest_label ?? undefined,
        kind: "dest",
        badge: LETTERS[i] ?? "•",
      });
    }
  });
  const live = stops
    .filter((s) => s.last_lat != null && s.last_lng != null)
    .sort((a, b) =>
      (b.last_position_at ?? "").localeCompare(a.last_position_at ?? ""),
    )[0];
  if (anyMoving && live?.last_lat != null && live?.last_lng != null) {
    markers.push({
      id: "you",
      lng: live.last_lng,
      lat: live.last_lat,
      label: "You",
      kind: "truck",
    });
  }

  // Stitched by-road path pickup → A → B → …
  const stopKey = stops.map((s) => s.id).join(",");
  const [route, setRoute] = useState<Array<[number, number]> | undefined>(
    undefined,
  );
  useEffect(() => {
    let cancelled = false;
    const pts: Array<[number, number]> = [];
    if (pickup.origin_lat != null && pickup.origin_lng != null)
      pts.push([pickup.origin_lng, pickup.origin_lat]);
    stops.forEach((d) => {
      if (d.dest_lat != null && d.dest_lng != null)
        pts.push([d.dest_lng, d.dest_lat]);
    });
    if (pts.length < 2) {
      setRoute(undefined);
      return;
    }
    roadRouteThrough(pts).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopKey]);

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

      {/* Whole-trip map: pickup + lettered stops in road order */}
      {markers.length > 1 ? (
        <div className="h-[220px] w-full border-b border-border">
          <LiveMap
            markers={markers}
            route={route}
            className="h-full w-full"
            fit
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-xs">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate text-muted2">
          Pickup: {pickup.origin_label ?? "—"}
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
