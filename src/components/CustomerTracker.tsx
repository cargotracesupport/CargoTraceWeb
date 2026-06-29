"use client";

import { useEffect, useRef, useState } from "react";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import DropoffSetter from "@/components/DropoffSetter";
import { BrandMark, Wordmark, Check, MapPin, Flag, Truck, Phone, Avatar } from "@/components/icons";
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
  driver?: { full_name: string | null; phone: string | null } | null;
  vehicle?: { plate: string | null; name: string | null } | null;
}

// Customers can't use Supabase realtime (anon, RLS-gated), so we poll. Keep it
// snappy so the driver's live position feels real-time.
const POLL_MS = 3000;

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
  // Popup shown when the driver/vehicle handling this delivery changes.
  const [changeNotice, setChangeNotice] = useState<{
    driver: string | null;
    vehicle: string | null;
  } | null>(null);

  const vehicleOf = (d: PublicDelivery) =>
    d.vehicle?.plate ?? d.vehicle?.name ?? null;
  // Track the last-seen driver/vehicle so we can spot a mid-trip change. Seeded
  // from the initial load so the first paint never fires a notice.
  const seenRef = useRef<{ driver: string | null; vehicle: string | null }>({
    driver: initial.driver?.full_name ?? null,
    vehicle: vehicleOf(initial),
  });

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/deliveries/${token}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { delivery?: PublicDelivery };
        if (!active || !json.delivery) return;
        const d = json.delivery;

        // Notify only when an already-known driver/vehicle actually changes
        // (not on first assignment, where the previous value was null).
        const newDriver = d.driver?.full_name ?? null;
        const newVehicle = vehicleOf(d);
        const prev = seenRef.current;
        const vehicleChanged =
          !!newVehicle && !!prev.vehicle && newVehicle !== prev.vehicle;
        const driverChanged =
          !!newDriver && !!prev.driver && newDriver !== prev.driver;
        if (vehicleChanged || driverChanged) {
          setChangeNotice({ driver: newDriver, vehicle: newVehicle });
        }
        seenRef.current = { driver: newDriver, vehicle: newVehicle };

        setDelivery(d);
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
  const needsDropoff =
    !isDelivered &&
    status !== "cancelled" &&
    delivery.dest_lat == null &&
    delivery.dest_lng == null;
  const originPoint =
    delivery.origin_lat != null && delivery.origin_lng != null
      ? { lat: delivery.origin_lat, lng: delivery.origin_lng }
      : null;

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

  const roadFrom: [number, number] | undefined =
    delivery.origin_lat != null && delivery.origin_lng != null
      ? [delivery.origin_lng, delivery.origin_lat]
      : undefined;
  const roadTo: [number, number] | undefined =
    delivery.dest_lat != null && delivery.dest_lng != null
      ? [delivery.dest_lng, delivery.dest_lat]
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
    <main className="min-h-dvh text-text flex flex-col">
      {/* ── Gradient hero ─────────────────────────────────────── */}
      <header className="relative overflow-hidden px-4 pb-16 pt-5 text-white">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ backgroundImage: "var(--grad-primary)" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 88% -10%, rgba(255,255,255,.55), transparent 45%)",
          }}
        />

        <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <BrandMark className="h-8 w-8" />
            </span>
            <Wordmark className="text-lg text-white [&_.text-gradient]:!bg-none [&_.text-gradient]:!text-white" />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="border-white/25 bg-white/10 text-white hover:bg-white/20" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
              {status.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* ETA / status headline */}
        <div className="mx-auto mt-8 w-full max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-white/70">
            {needsDropoff
              ? "Action needed"
              : isDelivered
                ? "Delivery complete"
                : hasPosition
                  ? "Arriving in"
                  : "Preparing your delivery"}
          </p>
          {needsDropoff ? (
            <div className="mt-1 text-2xl font-bold tracking-tight">
              Set your drop-off location
            </div>
          ) : isDelivered ? (
            <div className="mt-1 flex items-center gap-2 text-4xl font-extrabold tracking-tight">
              <Check className="h-8 w-8" strokeWidth={3} /> Delivered
            </div>
          ) : hasPosition ? (
            <div className="mt-1 flex items-end gap-3">
              <span className="font-mono text-5xl font-bold leading-none">
                {formatEta(etaMin)}
              </span>
              <span className="pb-1 text-sm text-white/75">
                updated {fmtTime(delivery.last_position_at) || "—"}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-2xl font-bold tracking-tight">
              On its way soon
            </div>
          )}
          <p className="mt-2 text-sm text-white/80">
            {delivery.goods}
            {delivery.customer_name ? <> · for {delivery.customer_name}</> : null}
          </p>
        </div>
      </header>

      {/* ── Content (overlaps hero) ───────────────────────────── */}
      <div className="mx-auto -mt-10 flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-6">
        {needsDropoff ? (
          <DropoffSetter token={token} origin={originPoint} />
        ) : (
        <>
        {/* Route + reference */}
        <section className="ct-card p-5" style={{ boxShadow: "var(--ct-shadow-pop)" }}>
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
              Tracking number
            </div>
            <div className="font-mono text-sm font-medium text-primary">
              {delivery.reference}
            </div>
          </div>

          <div className="mt-4 space-y-0">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="my-1 h-6 w-px border-l border-dashed border-border2" />
              </div>
              <div className="pt-1">
                <div className="text-[11px] uppercase tracking-wide text-muted2">
                  From
                </div>
                <div className="text-sm font-medium">{delivery.origin_label}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Flag className="h-4 w-4" />
              </span>
              <div className="pt-1">
                <div className="text-[11px] uppercase tracking-wide text-muted2">
                  To
                </div>
                <div className="text-sm font-medium">{delivery.dest_label}</div>
              </div>
            </div>
          </div>

          {!hasPosition && !isDelivered && (
            <p className="mt-4 rounded-xl bg-s2 px-3 py-2 text-xs text-muted2">
              This page updates automatically the moment your delivery starts
              moving.
            </p>
          )}
        </section>

        {/* Driver card — surfaced once the customer has set drop-off */}
        {delivery.driver?.full_name ? (
          <section className="ct-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
              Your driver
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={delivery.driver.full_name} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text">
                  {delivery.driver.full_name}
                </div>
                {delivery.vehicle?.plate || delivery.vehicle?.name ? (
                  <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-muted2">
                    <Truck className="h-3.5 w-3.5" />
                    {delivery.vehicle.plate ?? delivery.vehicle.name}
                  </div>
                ) : null}
              </div>
              {delivery.driver.phone ? (
                <a
                  href={`tel:${delivery.driver.phone}`}
                  className="ct-btn-primary shrink-0 !py-2"
                  aria-label={`Call ${delivery.driver.full_name}`}
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
              ) : null}
            </div>
            {delivery.driver.phone ? (
              <a
                href={`tel:${delivery.driver.phone}`}
                className="mt-2 block font-mono text-xs text-muted2 hover:text-primary"
              >
                {delivery.driver.phone}
              </a>
            ) : null}
            {hasPosition ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-green">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green" />
                </span>
                On the way · updated {fmtTime(delivery.last_position_at) || "—"}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted2">
                Waiting for the driver to start the trip…
              </p>
            )}
          </section>
        ) : null}

        {/* Live map */}
        <section className="ct-card overflow-hidden p-0">
          <div className="h-[52vh] min-h-[320px] w-full">
            {markers.length > 0 ? (
              <LiveMap
                markers={markers}
                roadFrom={roadFrom}
                roadTo={roadTo}
                fit
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted2">
                Map will appear once locations are available.
              </div>
            )}
          </div>
        </section>
        </>
        )}

        <p className="pb-2 text-center text-xs text-muted2">
          Live tracking by <Wordmark className="font-semibold" />
        </p>
      </div>

      {/* Driver / vehicle change popup */}
      {changeNotice ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setChangeNotice(null)}
        >
          <div
            className="ct-card w-full max-w-sm p-5"
            style={{ boxShadow: "var(--ct-shadow-pop)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber/10 text-amber">
              <Truck className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold">Your delivery was updated</h3>
            <p className="mt-1 text-sm text-muted2">
              A different driver or vehicle is now handling your delivery.
            </p>
            <div className="mt-4 rounded-xl border border-border bg-s2 p-3 text-sm">
              {changeNotice.driver ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted2">Driver</span>
                  <span className="font-medium">{changeNotice.driver}</span>
                </div>
              ) : null}
              {changeNotice.vehicle ? (
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <span className="text-muted2">Vehicle</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Truck className="h-3.5 w-3.5" />
                    {changeNotice.vehicle}
                  </span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setChangeNotice(null)}
              className="ct-btn-primary mt-4 w-full justify-center"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
