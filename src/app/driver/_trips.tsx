"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Delivery, DeliveryStatus } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import Spinner from "@/components/Spinner";
import { MapPin, Flag, Locate, Check, Clock, Navigation } from "@/components/icons";
import { groupSameRoute, haversineKm, type Pt } from "@/lib/cluster";
import { groupByRoad, type RouteItem } from "@/lib/routeGroup";
import { roadRouteDetailed } from "@/lib/route";
import { formatEta, formatKm } from "@/lib/eta";

const ACTIVE = new Set(["assigned", "en_route"]);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Google Maps directions deep link: origin (null = the device's current
 * location) through each "lat,lng" point in order, driving mode.
 */
function googleDirUrl(
  origin: string | null,
  pts: string[],
): string | null {
  if (pts.length === 0) return null;
  const p = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    destination: pts[pts.length - 1],
  });
  const way = pts.slice(0, -1);
  if (way.length) p.set("waypoints", way.join("|"));
  if (origin) p.set("origin", origin);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

// Once the driver has come within this distance of the pickup, the trip stops
// routing through it (they've collected the goods).
const PICKUP_REACHED_KM = 0.3;
const pickupReachedKey = (tripKey: string) => `ct_pickup_reached:${tripKey}`;

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

type GpsState = "off" | "starting" | "on" | "denied" | "error";

function MultiStopTrip({ stops, index }: { stops: Delivery[]; index: number }) {
  const router = useRouter();
  const pickup = stops[0];

  // Local status overrides so the card reacts instantly to start/deliver taps
  // (the server refresh below persists them).
  const [override, setOverride] = useState<Record<string, DeliveryStatus>>({});
  const st = useCallback(
    (d: Delivery): DeliveryStatus => override[d.id] ?? d.status,
    [override],
  );

  const assignedIds = stops.filter((d) => st(d) === "assigned").map((d) => d.id);
  const anyEnRoute = stops.some((d) => st(d) === "en_route");
  const allDone = stops.every(
    (d) => st(d) === "delivered" || st(d) === "cancelled",
  );
  const notStarted = stops.every((d) => st(d) === "assigned");

  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gps, setGps] = useState<GpsState>("off");

  // Has the driver collected the goods yet? Auto-detected the first time a GPS
  // fix lands near the pickup; remembered per trip so a reload doesn't send the
  // route back through the pickup.
  const tripKey = stops
    .map((s) => s.id)
    .sort()
    .join(",");
  const pickupPt =
    pickup.origin_lat != null && pickup.origin_lng != null
      ? { lat: pickup.origin_lat, lng: pickup.origin_lng }
      : null;
  const [pickupReached, setPickupReached] = useState(false);
  const serverPickedUp = stops.some((s) => s.picked_up_at != null);
  useEffect(() => {
    // Server-side stamp (set by the GPS ingest) wins — it survives device
    // changes; localStorage covers the moments before the stamp lands.
    if (serverPickedUp) {
      setPickupReached(true);
      return;
    }
    try {
      if (localStorage.getItem(pickupReachedKey(tripKey)))
        setPickupReached(true);
    } catch {
      /* storage unavailable — detection still works within the session */
    }
  }, [tripKey, serverPickedUp]);
  const markPickupReached = useCallback(() => {
    setPickupReached(true);
    try {
      localStorage.setItem(pickupReachedKey(tripKey), "1");
    } catch {
      /* ignore */
    }
  }, [tripKey]);
  const pickupPtRef = useRef(pickupPt);
  pickupPtRef.current = pickupPt;

  const [confirm, setConfirm] = useState<null | "start" | string>(null); // string = stop id to deliver
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  // The delivery id we attach GPS pings to; /api/track fans the fix out to all
  // of this driver's en-route stops, so any en-route id works.
  const enRouteIdRef = useRef<string | null>(null);
  enRouteIdRef.current = stops.find((d) => st(d) === "en_route")?.id ?? null;

  const stopGps = useCallback(() => {
    if (watchRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
  }, []);

  const sendPing = useCallback(async (p: GeolocationPosition) => {
    const deliveryId = enRouteIdRef.current;
    if (!deliveryId) return;
    try {
      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryId,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          speed: p.coords.speed != null ? p.coords.speed * 3.6 : null,
          heading: p.coords.heading,
          recordedAt: new Date(p.timestamp).toISOString(),
        }),
      });
    } catch {
      /* transient network error — next fix retries */
    }
  }, []);

  const startGps = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGps("error");
      return;
    }
    if (watchRef.current != null) return;
    setGps("starting");
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setGps("on");
        const at = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(at);
        // Arriving at the pickup flips the route from "via pickup" to
        // "straight to the stops".
        const pk = pickupPtRef.current;
        if (pk && haversineKm(at, pk) <= PICKUP_REACHED_KM)
          markPickupReached();
        void sendPing(p);
      },
      (err) => setGps(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [sendPing, markPickupReached]);

  // GPS runs while any stop on the trip is en route; stops when all are done.
  useEffect(() => {
    if (anyEnRoute) startGps();
    else stopGps();
    return () => stopGps();
  }, [anyEnRoute, startGps, stopGps]);

  async function startTrip() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("deliveries")
      .update({ status: "en_route", started_at: new Date().toISOString() })
      .in("id", assignedIds)
      .eq("status", "assigned");
    setBusy(false);
    setConfirm(null);
    if (err) {
      setError("Could not start the trip. Please try again.");
      return;
    }
    setOverride((prev) => {
      const next = { ...prev };
      for (const id of assignedIds) next[id] = "en_route";
      return next;
    });
    startGps();
    router.refresh();
  }

  async function deliverStop(id: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("deliveries")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(false);
    setConfirm(null);
    if (err) {
      setError("Could not mark this stop delivered. Please try again.");
      return;
    }
    setOverride((prev) => ({ ...prev, [id]: "delivered" }));
    router.refresh();
  }

  // Map markers: pickup + each drop-off lettered A/B/C, plus the live truck.
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
  const liveStored = stops
    .filter((s) => s.last_lat != null && s.last_lng != null)
    .sort((a, b) =>
      (b.last_position_at ?? "").localeCompare(a.last_position_at ?? ""),
    )[0];
  const live =
    pos ??
    (liveStored?.last_lat != null && liveStored?.last_lng != null
      ? { lat: liveStored.last_lat, lng: liveStored.last_lng }
      : null);
  if (anyEnRoute && live) {
    markers.push({ id: "you", lng: live.lng, lat: live.lat, label: "You", kind: "truck" });
  }

  // Route + per-stop driving ETAs. Before the trip starts: pickup → A → B ….
  // Once en route with a live fix: current position → remaining stops, so the
  // times read "from where I am now". Live recompute is throttled by rounding
  // the position to ~1 km so every GPS tick doesn't re-hit OSRM.
  const remaining = stops.filter(
    (d) =>
      st(d) !== "delivered" &&
      st(d) !== "cancelled" &&
      d.dest_lat != null &&
      d.dest_lng != null,
  );
  const fromLive = anyEnRoute && live != null;
  // Haven't collected the goods yet → the route runs current position →
  // PICKUP → A → B, so directions and times include getting to the pickup.
  const viaPickup = fromLive && !pickupReached && pickupPt != null;
  const routeStops = fromLive
    ? remaining
    : stops.filter((d) => d.dest_lat != null && d.dest_lng != null);
  const liveKey = fromLive
    ? `${live.lat.toFixed(2)},${live.lng.toFixed(2)}`
    : "";
  const routeSig =
    routeStops.map((s) => s.id).join(",") +
    "|" +
    liveKey +
    (viaPickup ? "|viaP" : "");
  const [route, setRoute] = useState<Array<[number, number]> | undefined>(
    undefined,
  );
  const [etas, setEtas] = useState<Record<string, { sec: number; m: number }>>(
    {},
  );
  const [pickupEta, setPickupEta] = useState<{ sec: number; m: number } | null>(
    null,
  );
  const [total, setTotal] = useState<{ sec: number; m: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const start = fromLive
      ? { lng: live.lng, lat: live.lat }
      : pickupPt
        ? { lng: pickupPt.lng, lat: pickupPt.lat }
        : null;
    if (!start || routeStops.length === 0) {
      setRoute(undefined);
      setEtas({});
      setPickupEta(null);
      setTotal(null);
      return;
    }
    const pts: Array<[number, number]> = [[start.lng, start.lat]];
    if (viaPickup) pts.push([pickupPt!.lng, pickupPt!.lat]);
    routeStops.forEach((d) =>
      pts.push([d.dest_lng as number, d.dest_lat as number]),
    );
    roadRouteDetailed(pts).then((r) => {
      if (cancelled) return;
      if (!r) {
        // Routing down — still draw straight segments, just without ETAs.
        setRoute(pts);
        setEtas({});
        setPickupEta(null);
        setTotal(null);
        return;
      }
      setRoute(r.coords);
      const bySt: Record<string, { sec: number; m: number }> = {};
      let sec = 0;
      let m = 0;
      // With viaPickup, leg 0 is current → pickup; stops start at leg 1.
      const offset = viaPickup ? 1 : 0;
      r.legs.forEach((leg, i) => {
        sec += leg.durationSec;
        m += leg.distanceM;
        if (viaPickup && i === 0) {
          setPickupEta({ sec, m });
          return;
        }
        const stop = routeStops[i - offset];
        if (stop) bySt[stop.id] = { sec, m };
      });
      if (!viaPickup) setPickupEta(null);
      setEtas(bySt);
      setTotal({ sec, m });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSig]);

  // Google Maps: not started → preview pickup → all stops. Started → navigate
  // from the current location, still via the pickup until it's been reached.
  const navPts = [
    ...(viaPickup ? [`${pickupPt!.lat},${pickupPt!.lng}`] : []),
    ...routeStops.map((d) => `${d.dest_lat},${d.dest_lng}`),
  ];
  const navUrl = googleDirUrl(
    anyEnRoute ? null : pickupPt ? `${pickupPt.lat},${pickupPt.lng}` : null,
    navPts,
  );

  const headPill = allDone
    ? { cls: "bg-s3 text-muted2", label: "Completed" }
    : anyEnRoute
      ? { cls: "bg-green/10 text-green", label: "In progress", dot: true }
      : { cls: "bg-amber/10 text-amber", label: "Not started" };

  return (
    <div className="ct-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Trip {index + 1}</h2>
          <span className="ct-pill bg-primary/10 text-primary">
            {stops.length} stops
          </span>
        </div>
        <span className={`ct-pill ${headPill.cls}`}>
          {headPill.dot ? (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
          ) : null}
          {headPill.label}
        </span>
      </div>

      {/* Whole-trip map: pickup + lettered stops in road order (flat overview) */}
      {markers.length > 1 ? (
        <div className="relative h-[220px] w-full border-b border-border">
          <LiveMap
            markers={markers}
            route={route}
            className="h-full w-full"
            pitch={0}
            fit
          />
          {gps === "on" ? (
            <div className="pointer-events-none absolute right-3 top-3 z-[1] inline-flex items-center gap-1.5 rounded-full border border-border2 bg-s1/90 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
              <span className="text-green">Live GPS</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-b border-border/60 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-muted2">
            Pickup: {pickup.origin_label ?? "—"}
          </span>
        </div>
        {pickupEta ? (
          <p className="mt-1 flex items-center gap-1 pl-[22px] text-[11px] font-medium text-blue">
            <Clock className="h-3 w-3 shrink-0" />~
            {formatEta(Math.round(pickupEta.sec / 60))} ·{" "}
            {formatKm(pickupEta.m)}
            <span className="font-normal text-muted2">
              to pickup, from your location
            </span>
          </p>
        ) : null}
      </div>

      {/* Route summary + open the same route in Google Maps for navigation */}
      {total || navUrl ? (
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-xs">
          {total ? (
            <>
              <Clock className="h-3.5 w-3.5 shrink-0 text-blue" />
              <span className="text-muted2">
                ~{formatEta(Math.round(total.sec / 60))} · {formatKm(total.m)}
                {fromLive ? " remaining" : " total drive"}
              </span>
            </>
          ) : null}
          {navUrl ? (
            <a
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ct-btn-ghost ml-auto shrink-0 px-2.5 py-1 text-xs"
              title="Opens Google Maps for turn-by-turn navigation. Keep this tab open — your live location keeps sharing with the customer and dispatcher."
            >
              <Navigation className="h-3.5 w-3.5" /> Google Maps
            </a>
          ) : null}
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {stops.map((d, i) => {
          const status = st(d);
          return (
            <li key={d.id} className="flex items-center gap-2 px-4 py-3">
              <Link
                href={`/driver/deliveries/${d.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:opacity-80"
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
                  {etas[d.id] &&
                  status !== "delivered" &&
                  status !== "cancelled" ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-blue">
                      <Clock className="h-3 w-3 shrink-0" />~
                      {formatEta(Math.round(etas[d.id].sec / 60))} ·{" "}
                      {formatKm(etas[d.id].m)}
                      <span className="font-normal text-muted2">
                        {fromLive ? "from your location" : "from pickup"}
                      </span>
                    </p>
                  ) : null}
                </div>
              </Link>
              {status === "en_route" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm(d.id)}
                  className="ct-btn-primary shrink-0 px-2.5 py-1.5 text-xs disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" /> Mark as delivered
                </button>
              ) : (
                <DeliveryStatusBadge status={status} />
              )}
            </li>
          );
        })}
      </ul>

      {/* Trip-level action: start every stop at once */}
      {notStarted ? (
        <div className="border-t border-border p-3">
          <button
            type="button"
            disabled={busy || assignedIds.length === 0}
            onClick={() => setConfirm("start")}
            className="ct-btn-primary w-full py-3 text-base disabled:opacity-60"
          >
            <Locate className="h-4 w-4" /> Start trip ({stops.length} stops)
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            Starts all stops and shares your live location until every stop is
            delivered.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="border-t border-border px-4 py-2 text-center text-sm text-red">
          {error}
        </p>
      ) : null}

      {/* Confirm dialog — trip start or per-stop delivery */}
      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setConfirm(null)}
        >
          <div
            className="ct-card w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green/15 text-green">
                {confirm === "start" ? (
                  <Locate className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </span>
              <h3 className="text-base font-semibold">
                {confirm === "start"
                  ? `Start this trip (${stops.length} stops)?`
                  : "Mark this stop delivered?"}
              </h3>
            </div>
            <p className="text-sm text-muted2">
              {confirm === "start"
                ? "All stops start together and your phone’s live location is shared with customers and the dispatcher until every stop is delivered. Your browser may ask for location permission."
                : "This completes the stop. The trip keeps sharing your location until the remaining stops are delivered."}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="ct-btn-ghost flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  confirm === "start" ? startTrip() : deliverStop(confirm)
                }
                className="ct-btn-primary flex-1 justify-center disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : confirm === "start" ? (
                  "Start trip"
                ) : (
                  "Mark delivered"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
