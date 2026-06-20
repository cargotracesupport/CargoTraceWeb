"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Delivery } from "@/lib/types";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";

interface Counts {
  enRoute: number;
  assigned: number;
  deliveredToday: number;
  total: number;
}

const ACTIVE: Delivery["status"][] = ["assigned", "en_route"];

function timeAgo(iso: string | null): string {
  if (!iso) return "no signal";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Dashboard({
  initial,
  counts,
}: {
  initial: Delivery[];
  counts: Counts;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>(initial);

  // Live updates via postgres_changes on `deliveries`. RLS scopes the stream to
  // this admin's org. Markers + list move as positions/statuses change.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-dashboard-deliveries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        (payload) => {
          setDeliveries((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as Partial<Delivery>).id;
              return prev.filter((d) => d.id !== oldId);
            }

            const row = payload.new as Delivery;
            const isActive = ACTIVE.includes(row.status);
            const exists = prev.some((d) => d.id === row.id);

            if (!isActive) {
              // Left the active set (e.g. delivered / cancelled).
              return prev.filter((d) => d.id !== row.id);
            }
            if (exists) {
              return prev.map((d) => (d.id === row.id ? row : d));
            }
            return [row, ...prev];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markers: MapMarker[] = useMemo(
    () =>
      deliveries
        .filter((d) => d.last_lat != null && d.last_lng != null)
        .map((d) => ({
          id: d.id,
          lat: d.last_lat as number,
          lng: d.last_lng as number,
          label: d.reference ?? d.goods ?? "Delivery",
          kind: "truck" as const,
        })),
    [deliveries],
  );

  const tiles = [
    { label: "En route", value: counts.enRoute, accent: "text-green" },
    { label: "Assigned", value: counts.assigned, accent: "text-blue" },
    { label: "Delivered today", value: counts.deliveredToday, accent: "text-green" },
    { label: "Total", value: counts.total, accent: "text-text" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="ct-card p-4">
            <p className="ct-label mb-0">{t.label}</p>
            <p className={`mt-2 font-mono text-3xl font-semibold ${t.accent}`}>
              {t.value}
            </p>
          </div>
        ))}
      </div>

      {/* Map + active list */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="ct-card overflow-hidden">
          <div className="h-[60vh] w-full lg:h-[calc(100vh-16rem)]">
            <LiveMap markers={markers} fit />
          </div>
        </div>

        <div className="ct-card flex max-h-[60vh] flex-col overflow-hidden lg:max-h-[calc(100vh-16rem)]">
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
                <li key={d.id} className="px-4 py-3 transition-colors hover:bg-s2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium">
                        {d.reference ?? "—"}
                      </p>
                      <p className="truncate text-xs text-muted2">{d.goods}</p>
                    </div>
                    <DeliveryStatusBadge status={d.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                    <span className="truncate">
                      {d.customer_name ?? "No customer"}
                    </span>
                    <span className="shrink-0 font-mono">
                      {timeAgo(d.last_position_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
