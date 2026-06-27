"use client";

import { useEffect, useState } from "react";
import { Truck } from "@/components/icons";

// Per-driver key so two drivers on one device don't clash, and so confirmation
// persists across browser restarts (matching the remembered login). Stores the
// plate the driver last confirmed — the gate only reappears when it differs from
// the currently assigned vehicle, i.e. when their vehicle number actually changed.
const keyFor = (driverId: string) => `ct_vehicle_ok:${driverId}`;
// Forgiving compare: ignore spaces + case ("mh12ab1234" == "MH 12 AB 1234").
const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/**
 * Vehicle gate: a driver confirms their assigned vehicle number before they can
 * see deliveries. The confirmation is remembered, so a returning driver is NOT
 * re-prompted — the popup only appears the first time, or when their assigned
 * vehicle number has changed since they last confirmed.
 */
export default function VehicleGate({
  plate,
  driverId,
}: {
  plate: string | null;
  driverId: string;
}) {
  // Default to "blocked" so an unverified driver never sees deliveries first;
  // the effect lifts the gate if this vehicle was already confirmed.
  const [verified, setVerified] = useState(false);
  const [changed, setChanged] = useState(false); // popup is due to a vehicle change
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plate) {
      setVerified(true);
      return;
    }
    try {
      const stored = localStorage.getItem(keyFor(driverId));
      if (stored === plate) {
        setVerified(true); // already confirmed THIS vehicle — no popup
      } else if (stored) {
        setChanged(true); // confirmed a different vehicle before → it changed
      }
    } catch {
      /* storage unavailable — keep the gate up */
    }
  }, [plate, driverId]);

  if (!plate || verified) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (norm(value) === norm(plate!)) {
      try {
        localStorage.setItem(keyFor(driverId), plate!);
      } catch {
        /* ignore */
      }
      setVerified(true);
    } else {
      setError(
        "That doesn't match your assigned vehicle. Check the number and try again.",
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/95 p-4 backdrop-blur-md">
      <div
        className="ct-card w-full max-w-sm p-6"
        style={{ boxShadow: "var(--ct-shadow-pop)" }}
      >
        <div
          className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${
            changed ? "bg-amber/10 text-amber" : "bg-primary/10 text-primary"
          }`}
        >
          <Truck className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">
          {changed ? "Your vehicle has changed" : "Confirm your vehicle"}
        </h2>
        <p className="mt-1 text-sm text-muted2">
          {changed
            ? "Your assigned vehicle was updated. Enter the new vehicle number to keep going."
            : "Enter your assigned vehicle number to start your shift and view your deliveries."}
        </p>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            required
            autoFocus
            placeholder="e.g. MH 12 AB 1234"
            className="ct-input font-mono uppercase"
            aria-label="Vehicle number"
          />
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red/40 bg-red/10 px-3 py-2 text-xs font-medium text-red"
            >
              {error}
            </p>
          ) : null}
          <button type="submit" className="ct-btn-primary w-full !py-3">
            Continue
          </button>
        </form>

        <form action="/api/auth/signout" method="post" className="mt-3 text-center">
          <button
            type="submit"
            onClick={() => {
              // Disowning the vehicle — forget the confirmation so the next login
              // re-prompts.
              try {
                localStorage.removeItem(keyFor(driverId));
              } catch {
                /* ignore */
              }
            }}
            className="text-xs text-muted2 hover:text-text"
          >
            Not your vehicle? Log out
          </button>
        </form>
      </div>
    </div>
  );
}
