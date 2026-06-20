"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type LngLat = { lat: number; lng: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function bearing(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Drives a delivery from its origin to its destination by posting interpolated
 * GPS pings to /api/track — a stand-in for real hardware. No device or driver needed.
 */
export default function SimulateButton({
  deliveryId,
  origin,
  dest,
}: {
  deliveryId: string;
  origin: LngLat | null;
  dest: LngLat | null;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef(false);

  if (!origin || !dest) {
    return (
      <span
        className="text-xs text-muted"
        title="Add origin & destination coordinates to simulate"
      >
        —
      </span>
    );
  }

  async function run() {
    setError(null);
    setRunning(true);
    setProgress(0);
    cancel.current = false;

    const STEPS = 40;
    const INTERVAL = 1500;
    const heading = bearing(origin!, dest!);

    try {
      for (let i = 1; i <= STEPS; i++) {
        if (cancel.current) break;
        const t = i / STEPS;
        const lat = lerp(origin!.lat, dest!.lat, t);
        const lng = lerp(origin!.lng, dest!.lng, t);
        await fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryId, lat, lng, speed: 40, heading }),
        });
        setProgress(Math.round(t * 100));
        if (i < STEPS) await sleep(INTERVAL);
      }

      if (!cancel.current) {
        // Arrived — mark delivered so the full lifecycle is visible.
        const supabase = createClient();
        await supabase
          .from("deliveries")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .eq("id", deliveryId);
        router.refresh();
      }
    } catch {
      setError("Simulation failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {running ? (
        <>
          <span className="font-mono text-xs text-green">{progress}%</span>
          <button
            onClick={() => {
              cancel.current = true;
            }}
            className="ct-btn-ghost px-2 py-1 text-xs"
          >
            Stop
          </button>
        </>
      ) : (
        <button
          onClick={run}
          className="ct-btn-ghost px-2 py-1 text-xs"
          title="Drive this delivery A→B with simulated GPS (no hardware needed)"
        >
          ▶ Simulate
        </button>
      )}
      {error && <span className="text-xs text-red">{error}</span>}
    </div>
  );
}
