"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DeliveryStatus } from "@/lib/types";
import LiveMap, { type MapMarker } from "@/components/LiveMap";
import { Locate, Check } from "@/components/icons";

type Place = { lat: number; lng: number; label: string | null };
type Pos = { lat: number; lng: number; speed: number | null; heading: number | null };
type GpsState = "off" | "starting" | "on" | "denied" | "error";

export default function DriverTrip({
  deliveryId,
  status: initialStatus,
  origin,
  dest,
  initialPos,
}: {
  deliveryId: string;
  status: DeliveryStatus;
  origin: Place | null;
  dest: Place | null;
  initialPos: { lat: number; lng: number } | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<DeliveryStatus>(initialStatus);
  const [pos, setPos] = useState<Pos | null>(
    initialPos ? { ...initialPos, speed: null, heading: null } : null,
  );
  const [gps, setGps] = useState<GpsState>("off");
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "start" | "deliver">(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  const stopGps = useCallback(() => {
    if (watchRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
  }, []);

  // Push one GPS fix to the (authenticated, ownership-checked) ingest endpoint.
  const sendPing = useCallback(
    async (p: GeolocationPosition) => {
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
        /* transient network error — keep watching, next fix retries */
      }
    },
    [deliveryId],
  );

  const startGps = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGps("error");
      setGpsMsg("Location is not available on this device.");
      return;
    }
    if (watchRef.current != null) return; // already watching
    setGps("starting");
    setGpsMsg(null);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setGps("on");
        setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          speed: p.coords.speed != null ? p.coords.speed * 3.6 : null,
          heading: p.coords.heading,
        });
        void sendPing(p);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGps("denied");
          setGpsMsg(
            "Location permission denied. Enable it in your browser settings to share your trip.",
          );
        } else {
          setGps("error");
          setGpsMsg(err.message || "Could not get your location.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [sendPing]);

  // GPS is tied to the trip being live: it activates the moment the trip starts
  // and auto-resumes if the driver reopens this screen while en route. No manual
  // "share location" toggle.
  useEffect(() => {
    if (status === "en_route") startGps();
    else stopGps();
    return () => stopGps();
  }, [status, startGps, stopGps]);

  async function confirmStart() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("deliveries")
      .update({ status: "en_route", started_at: new Date().toISOString() })
      .eq("id", deliveryId);
    setBusy(false);
    setConfirmAction(null);
    if (err) {
      setError("Could not start the trip. Please try again.");
      return;
    }
    setStatus("en_route"); // flips the effect above on → GPS starts
    router.refresh();
  }

  async function markDelivered() {
    setBusy(true);
    setError(null);
    stopGps();
    const supabase = createClient();
    const { error: err } = await supabase
      .from("deliveries")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", deliveryId);
    setBusy(false);
    setConfirmAction(null);
    if (err) {
      setError("Could not update the delivery. Please try again.");
      return;
    }
    setStatus("delivered");
    router.refresh();
  }

  const markers: MapMarker[] = [];
  if (origin)
    markers.push({
      id: "origin",
      lat: origin.lat,
      lng: origin.lng,
      label: origin.label ?? "Pickup",
      kind: "origin",
    });
  if (dest)
    markers.push({
      id: "dest",
      lat: dest.lat,
      lng: dest.lng,
      label: dest.label ?? "Drop-off",
      kind: "dest",
    });
  if (pos)
    markers.push({ id: "you", lat: pos.lat, lng: pos.lng, label: "You", kind: "truck" });

  const roadFrom: [number, number] | undefined = origin
    ? [origin.lng, origin.lat]
    : undefined;
  const roadTo: [number, number] | undefined = dest ? [dest.lng, dest.lat] : undefined;

  // Center on the driver once we have a live fix; the constant focusKey means the
  // camera flies there once, then the marker keeps moving without yanking the map.
  const focus =
    pos && status === "en_route"
      ? { lng: pos.lng, lat: pos.lat, zoom: 14 }
      : undefined;
  const focusKey = focus ? "you" : undefined;

  const gpsPill =
    gps === "on"
      ? { dot: "bg-green", text: "text-green", label: "Live GPS" }
      : gps === "starting"
        ? { dot: "bg-amber", text: "text-amber", label: "Locating…" }
        : gps === "denied" || gps === "error"
          ? { dot: "bg-red", text: "text-red", label: "GPS off" }
          : null;

  return (
    <>
      {/* Map */}
      <div className="ct-card relative !p-0 overflow-hidden">
        <div className="h-[300px] w-full sm:h-[360px]">
          {markers.length > 0 ? (
            <LiveMap
              markers={markers}
              roadFrom={roadFrom}
              roadTo={roadTo}
              focus={focus}
              focusKey={focusKey}
              className="h-full w-full"
              fit
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted2">
              No coordinates to display yet.
            </div>
          )}
        </div>
        {gpsPill ? (
          <div className="pointer-events-none absolute right-3 top-3 z-[1] inline-flex items-center gap-1.5 rounded-full border border-border2 bg-s1/90 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
            <span
              className={`h-1.5 w-1.5 rounded-full ${gpsPill.dot} ${gps === "on" ? "animate-pulse" : ""}`}
            />
            <span className={gpsPill.text}>{gpsPill.label}</span>
          </div>
        ) : null}
      </div>

      {/* Live position readout (only while sharing) */}
      {status === "en_route" && pos ? (
        <div className="ct-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Your live position</h2>
            <span className="ct-pill bg-green/10 text-green">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
              Sharing
            </span>
          </div>
          <div className="px-4">
            <div className="flex items-center justify-between border-b border-border/50 py-2.5">
              <span className="text-xs text-muted2">Coordinates</span>
              <span className="font-mono text-sm font-medium text-blue">
                {pos.lat.toFixed(4)}°, {pos.lng.toFixed(4)}°
              </span>
            </div>
            {pos.speed != null ? (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-muted2">Speed</span>
                <span className="font-mono text-sm font-medium text-green">
                  {Math.round(pos.speed)} km/h
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="ct-card flex flex-col gap-3 p-4">
        {status === "assigned" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmAction("start")}
              className="ct-btn-primary w-full py-3 text-base disabled:opacity-60"
            >
              <Locate className="h-4 w-4" /> Start trip
            </button>
            <p className="text-center text-xs text-muted">
              Starting shares your live location with the customer and dispatcher
              until you mark the delivery complete.
            </p>
          </>
        ) : null}

        {status === "en_route" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmAction("deliver")}
              className="ct-btn-primary w-full py-3 text-base disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> Mark delivered
            </button>
            {gps === "denied" || gps === "error" ? (
              <button
                type="button"
                onClick={startGps}
                className="ct-btn-ghost w-full justify-center"
              >
                <Locate className="h-4 w-4" /> Enable location
              </button>
            ) : null}
            {gpsMsg ? (
              <p className="text-center text-xs text-red">{gpsMsg}</p>
            ) : null}
          </>
        ) : null}

        {status === "delivered" ? (
          <p className="text-center text-sm text-green">This delivery is complete.</p>
        ) : null}

        {status === "awaiting_dropoff" ? (
          <div className="flex flex-col items-center gap-1 rounded-xl bg-amber/10 px-3 py-3 text-center">
            <p className="text-sm font-semibold text-amber">
              Waiting for drop-off location
            </p>
            <p className="text-xs text-muted2">
              The customer hasn&rsquo;t set their drop-off yet. You can start the
              trip once they do.
            </p>
          </div>
        ) : null}

        {status === "pending" ? (
          <p className="text-center text-sm text-muted2">
            Waiting to be assigned a vehicle.
          </p>
        ) : null}

        {status === "cancelled" ? (
          <p className="text-center text-sm text-red">This delivery was cancelled.</p>
        ) : null}

        {error ? <p className="text-center text-sm text-red">{error}</p> : null}
      </div>

      {/* Confirm dialog — used for both Start trip and Mark delivered */}
      {confirmAction ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setConfirmAction(null)}
        >
          <div
            className="ct-card w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green/15 text-green">
                {confirmAction === "start" ? (
                  <Locate className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </span>
              <h3 className="text-base font-semibold">
                {confirmAction === "start"
                  ? "Start this delivery?"
                  : "Mark as delivered?"}
              </h3>
            </div>
            <p className="text-sm text-muted2">
              {confirmAction === "start"
                ? "Your phone’s live location will be shared with the customer and dispatcher until you mark the delivery as delivered. Your browser may ask for location permission."
                : "This completes the delivery and stops sharing your location. You can’t undo this."}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmAction(null)}
                className="ct-btn-ghost flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmAction === "start" ? confirmStart : markDelivered}
                className="ct-btn-primary flex-1 justify-center disabled:opacity-60"
              >
                {confirmAction === "start"
                  ? busy
                    ? "Starting…"
                    : "Start trip"
                  : busy
                    ? "Saving…"
                    : "Mark delivered"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
