"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Vehicle, Device } from "@/lib/types";
import LocationPicker, { type LatLng } from "@/components/LocationPicker";
import Spinner from "@/components/Spinner";

interface Created {
  token: string;
}

function trackUrl(token: string): string {
  const base =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string" &&
    process.env.NEXT_PUBLIC_APP_URL.length > 0
      ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
      : typeof window !== "undefined"
        ? window.location.origin
        : "";
  return `${base}/track/${token}`;
}

/** Parse a finite number from a form field, or null when blank. NaN -> NaN (invalid). */
function toNum(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  return Number(t);
}

/** Parse a valid, in-range lat/lng pair from two fields, or null. Drives the map pins. */
function parsePoint(latStr: string, lngStr: string): LatLng | null {
  if (latStr.trim() === "" || lngStr.trim() === "") return null;
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export default function NewDeliveryForm({
  orgId,
  drivers,
  vehicles,
  devices,
}: {
  orgId: string;
  drivers: Profile[];
  vehicles: Vehicle[];
  devices: Device[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [reference, setReference] = useState("");
  const [goods, setGoods] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const [originLat, setOriginLat] = useState("");
  const [originLng, setOriginLng] = useState("");
  const [destLabel, setDestLabel] = useState("");
  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [deviceId, setDeviceId] = useState("");

  /** When the user pastes "lat,lng" into the lat box, split it across both fields. */
  function handleLatPaste(
    value: string,
    setLat: (v: string) => void,
    setLng: (v: string) => void,
  ) {
    const parts = value.split(",");
    if (parts.length === 2) {
      setLat(parts[0].trim());
      setLng(parts[1].trim());
    } else {
      setLat(value);
    }
  }

  /** Map picker chose a point for pickup/drop-off — fill the coordinate (and label) fields. */
  function handlePick(
    which: "origin" | "dest",
    p: { lat: number; lng: number; label?: string },
  ) {
    const lat = p.lat.toFixed(6);
    const lng = p.lng.toFixed(6);
    if (which === "origin") {
      setOriginLat(lat);
      setOriginLng(lng);
      if (p.label) setOriginLabel(p.label);
    } else {
      setDestLat(lat);
      setDestLng(lng);
      if (p.label) setDestLabel(p.label);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const oLat = toNum(originLat);
    const oLng = toNum(originLng);
    const dLat = toNum(destLat);
    const dLng = toNum(destLng);

    // Validate any provided coordinate is a finite number IN RANGE
    // (latitude -90..90, longitude -180..180). Out-of-range values would crash the map.
    const checks: Array<[string, number | null, number]> = [
      ["Origin latitude", oLat, 90],
      ["Origin longitude", oLng, 180],
      ["Destination latitude", dLat, 90],
      ["Destination longitude", dLng, 180],
    ];
    for (const [label, n, max] of checks) {
      if (n == null) continue;
      if (!Number.isFinite(n)) {
        setError(`${label} must be a valid number (e.g. ${max === 90 ? "14.5995" : "120.9842"}).`);
        return;
      }
      if (n < -max || n > max) {
        setError(`${label} must be between -${max} and ${max}.`);
        return;
      }
    }

    setBusy(true);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("deliveries")
      .insert({
        org_id: orgId,
        reference: reference.trim() || null,
        goods: goods.trim() || null,
        origin_label: originLabel.trim() || null,
        origin_lat: oLat,
        origin_lng: oLng,
        dest_label: destLabel.trim() || null,
        dest_lat: dLat,
        dest_lng: dLng,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_email: customerEmail.trim() || null,
        driver_id: driverId || null,
        vehicle_id: vehicleId || null,
        device_id: deviceId || null,
        status: driverId ? "assigned" : "pending",
        assigned_at: driverId ? new Date().toISOString() : null,
      })
      .select("tracking_token")
      .single();

    setBusy(false);

    if (err) {
      setError(err.message);
      return;
    }
    if (!data) {
      setError("Delivery created, but could not read back the tracking link.");
      return;
    }
    setCreated({ token: data.tracking_token as string });
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(trackUrl(created.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the link is still visible to copy manually.
    }
  }

  // Success state — show the shareable tracking link.
  if (created) {
    const url = trackUrl(created.token);
    return (
      <div className="ct-card flex flex-col gap-4 p-6 text-center">
        <div>
          <div className="text-2xl font-semibold text-green">Delivery created</div>
          <p className="mt-1 text-sm text-muted2">
            Share this tracking link with the customer — no login required.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="ct-input font-mono text-xs"
          />
          <button
            type="button"
            onClick={copyLink}
            className="ct-btn-primary shrink-0"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </div>

        <div className="flex justify-center gap-2">
          <Link href="/admin/deliveries" className="ct-btn-ghost">
            Back to deliveries
          </Link>
          <Link
            href={`/track/${created.token}`}
            target="_blank"
            className="ct-btn-ghost"
          >
            Open tracker
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Shipment */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">Shipment</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="ct-label" htmlFor="reference">
              Reference
            </label>
            <input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. CT-1042"
              className="ct-input font-mono"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="goods">
              Goods
            </label>
            <input
              id="goods"
              value={goods}
              onChange={(e) => setGoods(e.target.value)}
              placeholder="e.g. 2 pallets, electronics"
              className="ct-input"
            />
          </div>
        </div>
      </fieldset>

      {/* Pick on map */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">
          Pick locations on the map
        </legend>
        <LocationPicker
          origin={parsePoint(originLat, originLng)}
          dest={parsePoint(destLat, destLng)}
          onPick={handlePick}
        />
      </fieldset>

      {/* Origin */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">Origin (pickup)</legend>
        <div>
          <label className="ct-label" htmlFor="origin_label">
            Label
          </label>
          <input
            id="origin_label"
            value={originLabel}
            onChange={(e) => setOriginLabel(e.target.value)}
            placeholder="e.g. Manila Warehouse"
            className="ct-input"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="ct-label" htmlFor="origin_lat">
              Latitude
            </label>
            <input
              id="origin_lat"
              inputMode="decimal"
              value={originLat}
              onChange={(e) =>
                handleLatPaste(e.target.value, setOriginLat, setOriginLng)
              }
              placeholder="14.5995"
              className="ct-input font-mono"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="origin_lng">
              Longitude
            </label>
            <input
              id="origin_lng"
              inputMode="decimal"
              value={originLng}
              onChange={(e) => setOriginLng(e.target.value)}
              placeholder="120.9842"
              className="ct-input font-mono"
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          Tip: paste{" "}
          <span className="font-mono text-muted2">lat,lng</span> into the latitude
          box to fill both.
        </p>
      </fieldset>

      {/* Destination */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">
          Destination (drop-off)
        </legend>
        <div>
          <label className="ct-label" htmlFor="dest_label">
            Label
          </label>
          <input
            id="dest_label"
            value={destLabel}
            onChange={(e) => setDestLabel(e.target.value)}
            placeholder="e.g. 24 Rizal Ave, Quezon City"
            className="ct-input"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="ct-label" htmlFor="dest_lat">
              Latitude
            </label>
            <input
              id="dest_lat"
              inputMode="decimal"
              value={destLat}
              onChange={(e) =>
                handleLatPaste(e.target.value, setDestLat, setDestLng)
              }
              placeholder="14.6760"
              className="ct-input font-mono"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="dest_lng">
              Longitude
            </label>
            <input
              id="dest_lng"
              inputMode="decimal"
              value={destLng}
              onChange={(e) => setDestLng(e.target.value)}
              placeholder="121.0437"
              className="ct-input font-mono"
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          Tip: paste{" "}
          <span className="font-mono text-muted2">lat,lng</span> into the latitude
          box to fill both.
        </p>
      </fieldset>

      {/* Customer */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">Customer (receiver)</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="ct-label" htmlFor="customer_name">
              Name
            </label>
            <input
              id="customer_name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jane Dela Cruz"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="customer_phone">
              Phone
            </label>
            <input
              id="customer_phone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+63…"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="customer_email">
              Email
            </label>
            <input
              id="customer_email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="jane@example.com"
              className="ct-input"
            />
          </div>
        </div>
      </fieldset>

      {/* Assignment */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">Assignment</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="ct-label" htmlFor="driver">
              Driver
            </label>
            <select
              id="driver"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="ct-input"
            >
              <option value="">Unassigned</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name ?? d.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ct-label" htmlFor="vehicle">
              Vehicle
            </label>
            <select
              id="vehicle"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="ct-input"
            >
              <option value="">None</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.plate ? ` · ${v.plate}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ct-label" htmlFor="device">
              Device
            </label>
            <select
              id="device"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="ct-input"
            >
              <option value="">None</option>
              {devices.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.label ?? dev.hardware_id}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted">
          Assigning a driver sets the status to{" "}
          <span className="text-blue">Assigned</span>; otherwise it stays{" "}
          <span className="text-muted2">Pending</span>.
        </p>
      </fieldset>

      {error ? (
        <p className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Link href="/admin/deliveries" className="ct-btn-ghost">
          Cancel
        </Link>
        <button type="submit" disabled={busy} className="ct-btn-primary">
          {busy ? (
            <>
              <Spinner /> Creating…
            </>
          ) : (
            "Create delivery"
          )}
        </button>
      </div>
    </form>
  );
}
