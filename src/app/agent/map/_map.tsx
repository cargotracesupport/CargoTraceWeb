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
import { estimateEtaMinutes, formatEta } from "@/lib/eta";

export type DeliveryRow = Delivery & {
  driver?: { full_name: string | null } | null;
  vehicle?: { name: string | null; plate: string | null } | null;
};

// Awaiting drop-off is a "live" state for the agent too — a driver may already
// be assigned and reporting GPS while the customer sets the destination.
const ACTIVE: Delivery["status"][] = [
  "awaiting_dropoff",
  "assigned",
  "en_route",
];

function timeAgo(iso: string | null): string {
  if (!iso) return "no signal";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// One marker per delivery for each known location (truck = last GPS,
// origin = pickup, dest = drop-off). Mirrors the admin dashboard pattern.
function markersFor(list: DeliveryRow[]): MapMarker[] {
  const out: MapMarker[] = [];
  for (const d of list) {
    if (d.last_lat != null && d.last_lng != null) {
      out.push({
        id: `${d.id}-truck`,
        lat: d.last_lat,
        lng: d.last_lng,
        label: d.reference ?? "Driver",
        kind: "truck",
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

  // Realtime: keep the map and list in sync with delivery changes. RLS limits
  // events to this agent's deliveries — the channel name is unique to this page
  // so it doesn't collide with the dispatch board's subscription.
  useEffect(() => {
    const supabase = createClient();
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId]);

  const selected = selectedId
    ? (deliveries.find((d) => d.id === selectedId) ?? null)
    : null;

  // Selected → show only that delivery's pins + by-road route. Otherwise show
  // the whole active fleet for this agent.
  const markers = useMemo(
    () => markersFor(selected ? [selected] : deliveries),
    [deliveries, selected],
  );

  const roadFrom: [number, number] | undefined =
    selected && selected.origin_lat != null && selected.origin_lng != null
      ? [selected.origin_lng, selected.origin_lat]
      : undefined;
  const roadTo: [number, number] | undefined =
    selected && selected.dest_lat != null && selected.dest_lng != null
      ? [selected.dest_lng, selected.dest_lat]
      : undefined;

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="ct-card relative overflow-hidden">
          <div className="h-[60vh] w-full lg:h-[calc(100vh-16rem)]">
            <LiveMap
              markers={markers}
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
                ["Offline", "bg-muted"],
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
                            className={`shrink-0 font-mono ${d.last_position_at ? "text-green" : ""}`}
                          >
                            {timeAgo(d.last_position_at)}
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

function StatRow({
  label,
  value,
  color = "text-text",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted2">{label}</span>
      <span className={`font-mono text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}

function DeliveryDetail({ d, onBack }: { d: DeliveryRow; onBack: () => void }) {
  const hasPos = d.last_lat != null && d.last_lng != null;
  const eta =
    hasPos && d.dest_lat != null && d.dest_lng != null
      ? estimateEtaMinutes(
          { lat: d.last_lat as number, lng: d.last_lng as number },
          { lat: d.dest_lat, lng: d.dest_lng },
          d.last_speed,
        )
      : null;

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
          </div>
        </div>

        {hasPos ? (
          <div className="rounded-lg border border-border bg-s2 px-3">
            <div className="flex items-center justify-between border-b border-border/50 py-2.5">
              <span className="ct-label mb-0">Live position</span>
              <span className="ct-pill bg-green/10 text-green">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
                GPS lock
              </span>
            </div>
            <StatRow
              label="Coordinates"
              value={`${(d.last_lat as number).toFixed(4)}°, ${(d.last_lng as number).toFixed(4)}°`}
              color="text-blue"
            />
            {d.last_speed != null ? (
              <StatRow
                label="Speed"
                value={`${Math.round(d.last_speed)} km/h`}
                color="text-green"
              />
            ) : null}
            <StatRow label="ETA" value={formatEta(eta)} color="text-green" />
            <StatRow label="Updated" value={timeAgo(d.last_position_at)} />
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-s2 p-3 text-sm text-muted2">
            Awaiting GPS signal from the driver…
          </div>
        )}

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
