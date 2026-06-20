"use client";

import { useEffect, useRef, useState } from "react";
import { Locate } from "@/components/icons";

type Status = "off" | "starting" | "sharing" | "denied" | "error";

export default function ShareLocationButton({
  deliveryId,
}: {
  deliveryId: string;
}) {
  const [status, setStatus] = useState<Status>("off");
  const [message, setMessage] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const watchIdRef = useRef<number | null>(null);

  function stop() {
    if (watchIdRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }

  // Clean up the watch when the component unmounts (screen closed).
  useEffect(() => {
    return () => stop();
  }, []);

  async function send(pos: GeolocationPosition) {
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
          heading: pos.coords.heading,
          recordedAt: new Date(pos.timestamp).toISOString(),
        }),
      });
      if (!res.ok) {
        setStatus("error");
        setMessage("Server rejected the location update.");
        return;
      }
      setStatus("sharing");
      setMessage(null);
      setLastSentAt(new Date());
    } catch {
      setStatus("error");
      setMessage("Network error sending location.");
    }
  }

  function start() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("error");
      setMessage("Geolocation is not available on this device.");
      return;
    }
    setStatus("starting");
    setMessage(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => void send(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setMessage("Location permission denied. Enable it in your browser settings.");
        } else {
          setStatus("error");
          setMessage(err.message || "Could not get your location.");
        }
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function toggle() {
    if (status === "off" || status === "denied" || status === "error") {
      start();
    } else {
      stop();
      setStatus("off");
      setMessage(null);
    }
  }

  const active = status === "starting" || status === "sharing";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggle}
        className={
          active
            ? "ct-btn w-full justify-center border border-green/60 bg-green/15 py-3 text-base text-green"
            : "ct-btn-ghost w-full justify-center py-3 text-base"
        }
        aria-pressed={active}
      >
        <span className="flex items-center gap-2">
          <Locate
            className={
              active ? "h-4 w-4 animate-pulse text-green" : "h-4 w-4 text-muted2"
            }
          />
          {active ? "Sharing live location" : "Share my live location"}
        </span>
      </button>

      <p className="text-center text-xs">
        {status === "sharing" && lastSentAt ? (
          <span className="text-muted2">
            Last sent{" "}
            <span className="font-mono">{lastSentAt.toLocaleTimeString()}</span>
          </span>
        ) : status === "starting" ? (
          <span className="text-muted2">Acquiring GPS…</span>
        ) : message ? (
          <span className="text-red">{message}</span>
        ) : (
          <span className="text-muted">Off — location is not being shared.</span>
        )}
      </p>
    </div>
  );
}
