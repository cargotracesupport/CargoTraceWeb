"use client";

import { useEffect, useState } from "react";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import { BrandMark, Wordmark, Check, MapPin, Flag } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import { estimateEtaMinutes, formatEta } from "@/lib/eta";
import type { DeliveryStatus } from "@/lib/types";

// Mirrors the GET /api/deliveries/{token} contract — the public delivery shape.
export interface PublicDelivery {
  reference: string;
  goods: string;
  status: string;
  origin_label: string;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_label: string;
  dest_lat: number | null;
  dest_lng: number | null;
  customer_name: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_speed: number | null;
  last_position_at: string | null;
  delivered_at: string | null;
}

const POLL_MS = 5000;

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CustomerTracker({
  token,
  initial,
}: {
  token: string;
  initial: PublicDelivery;
}) {
  const [delivery, setDelivery] = useState<PublicDelivery>(initial);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/deliveries/${token}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { delivery?: PublicDelivery };
        if (active && json.delivery) setDelivery(json.delivery);
      } catch {
        // transient network error — keep showing the last known state
      }
    }

    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [token]);

  const status = delivery.status as DeliveryStatus;
  const isDelivered = status === "delivered";

  const hasPosition = delivery.last_lat != null && delivery.last_lng != null;

  const markers: MapMarker[] = [];
  if (delivery.origin_lat != null && delivery.origin_lng != null) {
    markers.push({
      id: "origin",
      lat: delivery.origin_lat,
      lng: delivery.origin_lng,
      label: delivery.origin_label,
      kind: "origin",
    });
  }
  if (delivery.dest_lat != null && delivery.dest_lng != null) {
    markers.push({
      id: "dest",
      lat: delivery.dest_lat,
      lng: delivery.dest_lng,
      label: delivery.dest_label,
      kind: "dest",
    });
  }
  if (hasPosition) {
    markers.push({
      id: "truck",
      lat: delivery.last_lat as number,
      lng: delivery.last_lng as number,
      label: "Your delivery",
      kind: "truck",
    });
  }

  const route: Array<[number, number]> | undefined =
    delivery.origin_lat != null &&
    delivery.origin_lng != null &&
    delivery.dest_lat != null &&
    delivery.dest_lng != null
      ? [
          [delivery.origin_lng, delivery.origin_lat],
          [delivery.dest_lng, delivery.dest_lat],
        ]
      : undefined;

  const etaMin =
    !isDelivered && hasPosition
      ? estimateEtaMinutes(
          { lat: delivery.last_lat as number, lng: delivery.last_lng as number },
          delivery.dest_lat != null && delivery.dest_lng != null
            ? { lat: delivery.dest_lat, lng: delivery.dest_lng }
            : null,
          delivery.last_speed,
        )
      : null;

  return (
    <main className="min-h-dvh bg-bg text-text flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandMark className="h-7 w-7" />
          <Wordmark className="text-lg" />
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <DeliveryStatusBadge status={status} />
        </div>
      </header>

      <div className="flex-1 flex flex-col gap-4 p-4 max-w-2xl w-full mx-auto">
        {/* Delivery summary */}
        <section className="ct-card p-4">
          <div className="text-muted2 text-xs uppercase tracking-wide">
            Tracking
          </div>
          <div className="font-mono text-lg mt-0.5">{delivery.reference}</div>
          <div className="text-text mt-2">{delivery.goods}</div>
          {delivery.customer_name && (
            <div className="text-muted2 text-sm mt-1">
              For {delivery.customer_name}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
              <div>
                <div className="text-muted2 text-xs">From</div>
                <div>{delivery.origin_label}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Flag className="mt-0.5 h-4 w-4 shrink-0 text-green" />
              <div>
                <div className="text-muted2 text-xs">To</div>
                <div>{delivery.dest_label}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Status / ETA banner */}
        {isDelivered ? (
          <section className="ct-card p-5 text-center border-green/40 bg-green/5">
            <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-green">
              <Check className="h-6 w-6" /> Delivered
            </div>
            <p className="text-muted2 mt-1">
              Your delivery has arrived
              {delivery.delivered_at ? (
                <> on {fmtTime(delivery.delivered_at)}</>
              ) : null}
              .
            </p>
          </section>
        ) : hasPosition ? (
          <section className="ct-card p-5 flex items-center justify-between">
            <div>
              <div className="text-muted2 text-xs uppercase tracking-wide">
                Estimated arrival
              </div>
              <div className="text-3xl font-semibold text-green mt-1">
                {formatEta(etaMin)}
              </div>
            </div>
            <div className="text-right text-xs text-muted2">
              <div>Updated</div>
              <div className="font-mono text-text">
                {fmtTime(delivery.last_position_at) || "—"}
              </div>
            </div>
          </section>
        ) : (
          <section className="ct-card p-5 text-center">
            <div className="text-lg font-medium">
              Waiting for the driver to start…
            </div>
            <p className="text-muted2 mt-1 text-sm">
              This page updates automatically once your delivery is on the move.
            </p>
          </section>
        )}

        {/* Live map */}
        <section className="ct-card overflow-hidden p-0">
          <div className="h-[55vh] min-h-[320px] w-full">
            {markers.length > 0 ? (
              <LiveMap
                markers={markers}
                route={route}
                fit
                className="h-full w-full"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted2 text-sm">
                Map will appear once locations are available.
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-muted2 text-xs pb-2">
          Live tracking by Cargo<span className="text-green">Trace</span>
        </p>
      </div>
    </main>
  );
}
