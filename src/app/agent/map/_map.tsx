"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Delivery } from "@/lib/types";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import {
  Truck,
  ArrowLeft,
  MapPin,
  Flag,
} from "@/components/icons";
import { useNow } from "@/components/useNow";
import { presenceOf, fixAgeLabel, isLiveFix } from "@/lib/presence";
import PositionCard from "@/components/PositionCard";
import { useSelectedRoute } from "@/components/useSelectedRoute";
import OfflineSummary from "@/components/OfflineSummary";
import { formatVehicleSpecs } from "@/lib/vehicle";

export type DeliveryRow = Delivery & {
  driver?: { full_name: string | null } | null;
  vehicle?: {
    name: string | null;
    plate: string | null;
    length_m: number | null;
    width_m: number | null;
    capacity_kg: number | null;
  } | null;
};

// Awaiting drop-off is a "live" state for the agent too — a driver may already
// be assigned and reporting GPS while the customer sets the destination.
const ACTIVE: Delivery["status"][] = [
  "awaiting_dropoff",
  "pending",
  "assigned",
  "en_route",
];

// One marker per delivery for each known location (truck = last GPS,
// origin = pickup, dest = drop-off). Mirrors the admin dashboard pattern.
function markersFor(list: DeliveryRow[], now: number): MapMarker[] {
  const out: MapMarker[] = [];
  for (const d of list) {
    if (d.last_lat != null && d.last_lng != null) {
      out.push({
        id: `${d.id}-truck`,
        lat: d.last_lat,
        lng: d.last_lng,
        // A stale fix keeps its spot on the map but is drawn grey and says
        // how old it is, so it never reads as a live position.
        label: isLiveFix(d.last_position_at, now)
          ? (d.reference ?? "Driver")
          : `${d.reference ?? "Driver"} · last seen ${fixAgeLabel(d.last_position_at, now)}`,
        kind: "truck",
        state: presenceOf(d, now),
      });
    }
    if (d.origin_lat != null && d.origin_lng != null) {
      out.push({
        id: `${d.id}-origin`,
        lat: d.origin_lat,
        lng: d.origin_lng,
        label: d.origin_label ?? "Pickup",
        kind: "origin",
      });
    }
    if (d.dest_lat != null && d.dest_lng != null) {
      out.push({
        id: `${d.id}-dest`,
        lat: d.dest_lat,
        lng: d.dest_lng,
        label: d.dest_label ?? "Drop-off",
        kind: "dest",
      });
    }
  }
  return out;
}

export default function AgentMap({
  initial,
  agentId,
}: {
  initial: DeliveryRow[];
  agentId: string;
}) {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = useNow();

  // Realtime: keep the map and list in sync with delivery changes. RLS limits
  // events to this agent's deliveries — the channel name is unique to this page
  // so it doesn't collide with the dispatch board's subscription.
  useEffect(() => {
    const supabase = createClient();
    let alive = true;

    // Realtime has no catch-up: changes made while the socket was down (laptop
    // asleep, tab in the background, network blip) are simply lost, and the
    // trucks would then look stale while actually moving. Re-read the active
    // rows (same select as the page) whenever the channel (re)connects or the
    // tab becomes visible again.
    async function resync() {
      const { data } = await supabase
        .from("deliveries")
        .select(
          "*, driver:profiles!deliveries_driver_id_fkey(full_name), vehicle:vehicles(name, plate, length_m, width_m, capacity_kg)",
        )
        .in("status", ACTIVE)
        .order("created_at", { ascending: false });
      if (alive && data) setDeliveries(data as unknown as DeliveryRow[]);
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisible);

    const channel = supabase
      .channel("agent-map-deliveries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        (payload) => {
          setDeliveries((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as Partial<Delivery>).id;
              return prev.filter((d) => d.id !== oldId);
            }
            const row = payload.new as DeliveryRow;
            // Defense-in-depth: even if realtime ever delivers a row we don't own
            // (DB regression / misconfig), drop it before it touches the UI.
            if (row.agent_id && row.agent_id !== agentId) return prev;
            const isActive = ACTIVE.includes(row.status);
            if (!isActive) return prev.filter((d) => d.id !== row.id);
            const exists = prev.some((d) => d.id === row.id);
            // Preserve the joined driver/vehicle from the initial server fetch —
            // raw postgres_changes events don't include the join shape.
            if (exists) {
              return prev.map((d) =>
                d.id === row.id
                  ? {
                      ...row,
                      driver: row.driver ?? d.driver,
                      vehicle: row.vehicle ?? d.vehicle,
                    }
                  : d,
              );
            }
            return [row, ...prev];
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") resync();
      });
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [agentId]);

  const selected = selectedId
    ? (deliveries.find((d) => d.id === selectedId) ?? null)
    : null;

  // Selected → show only that delivery's pins + by-road route. Otherwise show
  // the whole active fleet for this agent.
  const markers = useMemo(
    () => markersFor(selected ? [selected] : deliveries, now),
    [deliveries, selected, now],
  );

  // Draw the route for the selected delivery; if none is selected but there's a
  // single active delivery, default to it so the overview shows the road too
  // (not just disconnected pins).
  const routeFor = selected ?? (deliveries.length === 1 ? deliveries[0] : null);
  const { route, roadFrom, roadTo } = useSelectedRoute(routeFor);

  // Fly to the driver's live position when available; fall back to origin/dest.
  const focus = !selected
    ? undefined
    : selected.last_lat != null && selected.last_lng != null
      ? { lng: selected.last_lng, lat: selected.last_lat, zoom: 13 }
      : selected.origin_lat != null && selected.origin_lng != null
        ? { lng: selected.origin_lng, lat: selected.origin_lat, zoom: 12 }
        : selected.dest_lat != null && selected.dest_lng != null
          ? { lng: selected.dest_lng, lat: selected.dest_lat, zoom: 12 }
          : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Live map</h1>
        <p className="text-sm text-muted2">
          Your active deliveries and where each driver is right now.
        </p>
      </div>

      <OfflineSummary deliveries={deliveries} now={now} onSelect={setSelectedId} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="ct-card relative overflow-hidden">
          <div className="h-[60vh] w-full lg:h-[calc(100vh-16rem)]">
            <LiveMap
              markers={markers}
              route={route}
              roadFrom={roadFrom}
              roadTo={roadTo}
              focus={focus}
              focusKey={selectedId ?? undefined}
              fit
            />
          </div>
          {/* Status legend overlay */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1] rounded-md border border-border2 bg-s1/90 px-3 py-2 backdrop-blur">
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[1.5px] text-muted2">
              Status
            </div>
            {(
              [
                ["Moving", "bg-green"],
                ["Idle", "bg-amber"],
                ["Stale (no fix for 3+ min)", "bg-muted"],
              ] as const
            ).map(([label, dot]) => (
              <div
                key={label}
                className="mb-1 flex items-center gap-2 text-[11px] text-muted2 last:mb-0"
              >
                <span
                  className={`h-2 w-2 rounded-full border-[1.5px] border-white ${dot}`}
                />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="ct-card flex max-h-[60vh] flex-col overflow-hidden lg:max-h-[calc(100vh-16rem)]">
          {selected ? (
            <DeliveryDetail
              d={selected}
              now={now}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Active deliveries</h2>
                <span className="ct-pill bg-green/10 text-green">
                  {deliveries.length}
                </span>
              </div>
              {deliveries.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted2">
                  No active deliveries right now.
                </div>
              ) : (
                <ul className="flex-1 divide-y divide-border overflow-y-auto">
                  {deliveries.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(d.id)}
                        className="w-full px-4 py-3 text-left transition-colors hover:bg-s2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm font-medium">
                              {d.reference ?? "—"}
                            </p>
                            <p className="truncate text-xs text-muted2">
                              {d.goods}
                            </p>
                            {d.driver?.full_name ? (
                              <p className="truncate text-[11px] text-muted">
                                {d.driver.full_name}
                                {d.vehicle?.plate || d.vehicle?.name ? (
                                  <>
                                    {" · "}
                                    <span className="font-mono">
                                      {d.vehicle.plate ?? d.vehicle.name}
                                    </span>
                                  </>
                                ) : null}
                              </p>
                            ) : null}
                          </div>
                          <DeliveryStatusBadge status={d.status} />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                          <span className="truncate">
                            {d.customer_name ?? "No customer"}
                          </span>
                          <span
                            className={`shrink-0 font-mono ${
                              isLiveFix(d.last_position_at, now)
                                ? "text-green"
                                : d.last_position_at
                                  ? "text-amber"
                                  : ""
                            }`}
                          >
                            {d.last_position_at
                              ? isLiveFix(d.last_position_at, now)
                                ? fixAgeLabel(d.last_position_at, now)
                                : `last seen ${fixAgeLabel(d.last_position_at, now)}`
                              : "no location yet"}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryDetail({
  d,
  now,
  onBack,
}: {
  d: DeliveryRow;
  now: number;
  onBack: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted2 transition-colors hover:text-green"
        >
          <ArrowLeft className="h-4 w-4" /> Active deliveries
        </button>
        <DeliveryStatusBadge status={d.status} />
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div>
          <p className="font-mono text-lg font-medium">{d.reference ?? "—"}</p>
          <p className="text-sm text-muted2">{d.goods}</p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-s2 p-3">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
            <div>
              <div className="text-[11px] text-muted2">From</div>
              <div className="text-sm">{d.origin_label ?? "—"}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Flag className="mt-0.5 h-4 w-4 shrink-0 text-green" />
            <div>
              <div className="text-[11px] text-muted2">To</div>
              <div className="text-sm text-green">{d.dest_label ?? "—"}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-s2 p-3">
            <div className="ct-label">Customer</div>
            <div className="text-sm">{d.customer_name ?? "—"}</div>
            {d.customer_phone ? (
              <a
                href={`tel:${d.customer_phone}`}
                className="mt-1 inline-block font-mono text-xs text-green hover:underline"
              >
                {d.customer_phone}
              </a>
            ) : null}
          </div>
          <div className="rounded-lg border border-border bg-s2 p-3">
            <div className="ct-label">Driver &amp; vehicle</div>
            <div className="text-sm">
              {d.driver?.full_name ?? (
                <span className="text-muted">Unassigned</span>
              )}
            </div>
            {d.vehicle?.plate || d.vehicle?.name ? (
              <div className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted2">
                <Truck className="h-3.5 w-3.5" />
                {d.vehicle.plate ?? d.vehicle.name}
              </div>
            ) : null}
            {formatVehicleSpecs(d.vehicle) ? (
              <div className="mt-0.5 text-[11px] font-medium text-primary">
                {formatVehicleSpecs(d.vehicle)}
              </div>
            ) : null}
          </div>
        </div>

        <PositionCard d={d} now={now} />

        <a
          href={`/track/${d.tracking_token}`}
          target="_blank"
          rel="noreferrer"
          className="ct-btn-ghost justify-center"
        >
          <MapPin className="h-4 w-4" /> Open customer tracking
        </a>
      </div>
    </>
  );
}
