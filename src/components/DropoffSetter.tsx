"use client";

import { useState } from "react";
import LocationPicker, { type LatLng } from "@/components/LocationPicker";
import Spinner from "@/components/Spinner";
import { MapPin } from "@/components/icons";

/**
 * Customer sets their own drop-off location. Step 1: confirm the mobile number
 * the delivery was booked with (the "login"). Step 2: drop a pin on the map.
 * Posts to /api/deliveries/[token]/dropoff (the only path that sets the drop-off).
 */
export default function DropoffSetter({
  token,
  origin,
}: {
  token: string;
  origin: LatLng | null;
}) {
  const [phone, setPhone] = useState("");
  const [verified, setVerified] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(extra: Record<string, unknown>) {
    const res = await fetch(`/api/deliveries/${token}/dropoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, ...extra }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
    return j;
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await call({});
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!point) {
      setError("Tap the map to set your drop-off location.");
      return;
    }
    setBusy(true);
    try {
      await call({ lat: point.lat, lng: point.lng, label: label.trim() || undefined });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  if (!verified) {
    return (
      <section className="ct-card p-5">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">
          Set your drop-off location
        </h2>
        <p className="mt-1 text-sm text-muted2">
          Confirm the mobile number this delivery was booked with to continue.
        </p>
        <form onSubmit={verify} className="mt-4 flex flex-col gap-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            type="tel"
            autoFocus
            placeholder="Your mobile number"
            className="ct-input"
          />
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red/40 bg-red/10 px-3 py-2 text-xs font-medium text-red"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="ct-btn-primary w-full !py-3"
          >
            {busy ? (
              <>
                <Spinner /> Checking…
              </>
            ) : (
              "Continue"
            )}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="ct-card p-5">
      <h2 className="text-lg font-bold tracking-tight">
        Where should we drop it off?
      </h2>
      <p className="mt-1 text-sm text-muted2">
        Tap the map to set your exact drop-off point (or search an address), then
        confirm.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <div>
          <label className="ct-label" htmlFor="dropoff_label">
            Address / landmark (optional)
          </label>
          <input
            id="dropoff_label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. 24 Rizal Ave, Gate 2"
            className="ct-input"
          />
        </div>
        <LocationPicker
          origin={origin}
          dest={point}
          mode="dest"
          onPick={(_w, p) => {
            setPoint({ lat: p.lat, lng: p.lng });
            if (p.label) setLabel(p.label);
          }}
        />
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red/40 bg-red/10 px-3 py-2 text-xs font-medium text-red"
          >
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || !point}
          className="ct-btn-primary w-full !py-3"
        >
          {busy ? (
            <>
              <Spinner /> Saving…
            </>
          ) : (
            "Confirm drop-off location"
          )}
        </button>
      </form>
    </section>
  );
}
