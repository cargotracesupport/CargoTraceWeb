"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  Vehicle,
  Device,
  Delivery,
  DeliveryStatus,
  Customer,
} from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";
import LocationPicker, { type LatLng } from "@/components/LocationPicker";
import CustomerPicker from "@/components/CustomerPicker";
import Spinner from "@/components/Spinner";
import { whatsappUrl } from "@/lib/share";

// Statuses an admin can set by hand when editing a delivery.
const EDITABLE_STATUSES: DeliveryStatus[] = [
  "awaiting_dropoff",
  "pending",
  "assigned",
  "en_route",
  "delivered",
  "cancelled",
];

interface Created {
  token: string;
  phone: string;
  name: string;
  reference: string;
  /** Whether the agent chose to send the customer the drop-off link. */
  sendLink: boolean;
}

/** A customer's most recent drop-off, reused for repeat deliveries. */
type SavedDropoff = { lat: number; lng: number; label: string | null };
type SavedRow = {
  dest_lat: number | null;
  dest_lng: number | null;
  dest_label: string | null;
};

// The most recent drop-off this customer set on a past delivery — linked by
// customer_id, falling back to phone for deliveries created before the customer
// master existed. Null when they've never set one.
async function fetchLastDropoff(c: Customer): Promise<SavedDropoff | null> {
  const supabase = createClient();
  const pick = (d: SavedRow | null): SavedDropoff | null =>
    d && d.dest_lat != null && d.dest_lng != null
      ? { lat: d.dest_lat, lng: d.dest_lng, label: d.dest_label }
      : null;
  const byId = await supabase
    .from("deliveries")
    .select("dest_lat, dest_lng, dest_label")
    .eq("customer_id", c.id)
    .not("dest_lat", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fromId = pick(byId.data as SavedRow | null);
  if (fromId || !c.phone) return fromId;
  const byPhone = await supabase
    .from("deliveries")
    .select("dest_lat, dest_lng, dest_label")
    .eq("customer_phone", c.phone)
    .not("dest_lat", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return pick(byPhone.data as SavedRow | null);
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

export type AgentOption = { id: string; full_name: string | null };
/**
 * Lightweight active-delivery row used to mark a driver as busy in the picker.
 * Pass `assigned`/`en_route` rows from the org for the admin form.
 */
export type ActiveAssignment = {
  id: string;
  driver_id: string | null;
  status: string;
  reference: string | null;
};

export default function NewDeliveryForm({
  orgId,
  drivers,
  vehicles,
  devices,
  delivery,
  agents,
  ownerAgentId,
  backHref = "/admin/deliveries",
  activeAssignments,
  customers,
  currentUserId,
}: {
  orgId: string;
  drivers: Profile[];
  vehicles: Vehicle[];
  devices: Device[];
  delivery?: Delivery;
  // Admin context: list of agents to assign ownership to (shows a picker).
  agents?: AgentOption[];
  // Agent context: this agent owns the delivery (no picker).
  ownerAgentId?: string;
  // Where Cancel / "Back to deliveries" go (agent vs admin).
  backHref?: string;
  // Rows used to mark drivers as busy in the picker.
  activeAssignments?: ActiveAssignment[];
  // Customer master (RLS-scoped) for the "saved customer" picker.
  customers?: Customer[];
  // Current user id — used as created_by when adding a customer inline.
  currentUserId?: string;
}) {
  const router = useRouter();
  const editing = !!delivery;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state (prefilled when editing)
  const [reference, setReference] = useState(delivery?.reference ?? "");
  const [goods, setGoods] = useState(delivery?.goods ?? "");
  const [originLabel, setOriginLabel] = useState(delivery?.origin_label ?? "");
  const [originLat, setOriginLat] = useState(
    delivery?.origin_lat?.toString() ?? "",
  );
  const [originLng, setOriginLng] = useState(
    delivery?.origin_lng?.toString() ?? "",
  );
  const [destLabel, setDestLabel] = useState(delivery?.dest_label ?? "");
  const [destLat, setDestLat] = useState(delivery?.dest_lat?.toString() ?? "");
  const [destLng, setDestLng] = useState(delivery?.dest_lng?.toString() ?? "");
  const [customerId, setCustomerId] = useState(delivery?.customer_id ?? "");
  const [customerName, setCustomerName] = useState(
    delivery?.customer_name ?? "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    delivery?.customer_phone ?? "",
  );
  const [customerEmail, setCustomerEmail] = useState(
    delivery?.customer_email ?? "",
  );

  // "Send the customer a tracking link so they set the drop-off." Checked by
  // default (a new customer must tell us where to deliver). Picking a saved
  // customer who already set a drop-off on a past delivery unticks it and
  // reuses that drop-off, so the delivery is ready to assign with no link.
  const [sendLink, setSendLink] = useState(true);
  const [lastDropoff, setLastDropoff] = useState<SavedDropoff | null>(null);
  const dropoffReq = useRef(0); // drop stale lookups if the agent picks again quickly

  // Picked a saved customer → fill their details and look up their last
  // drop-off; blank → one-off (unlinked), link on by default.
  function applyCustomer(c: Customer | null) {
    const req = ++dropoffReq.current;
    if (c) {
      setCustomerId(c.id);
      setCustomerName(c.name ?? "");
      setCustomerPhone(c.phone ?? "");
      setCustomerEmail(c.email ?? "");
      fetchLastDropoff(c).then((d) => {
        if (req !== dropoffReq.current) return; // a newer pick superseded this
        setLastDropoff(d);
        setSendLink(!d); // known drop-off → reuse it and skip the link
      });
    } else {
      setCustomerId("");
      setLastDropoff(null);
      setSendLink(true);
    }
  }
  const [driverId, setDriverId] = useState(delivery?.driver_id ?? "");
  const [vehicleId, setVehicleId] = useState(delivery?.vehicle_id ?? "");
  const [deviceId, setDeviceId] = useState(delivery?.device_id ?? "");
  // Admin-only, edit-only: set the status by hand.
  const [status, setStatus] = useState<DeliveryStatus>(
    delivery?.status ?? "awaiting_dropoff",
  );

  // For the driver picker: { driver_id -> the active delivery they're on }.
  // Only en_route / assigned count as busy; the delivery being edited is excluded.
  const busyByDriver = useMemo(() => {
    const m = new Map<
      string,
      { status: string; reference: string | null; deliveryId: string }
    >();
    for (const a of activeAssignments ?? []) {
      if (!a.driver_id) continue;
      if (a.status !== "en_route" && a.status !== "assigned") continue;
      m.set(a.driver_id, {
        status: a.status,
        reference: a.reference,
        deliveryId: a.id,
      });
    }
    return m;
  }, [activeAssignments]);
  // Owning agent: fixed in agent context, picked by admin otherwise.
  const [agentId, setAgentId] = useState(
    ownerAgentId ?? delivery?.agent_id ?? "",
  );

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

    // A driver can only be assigned once the delivery has a drop-off (the
    // customer normally sets it). Also block moving the status forward without
    // one, so a delivery can't be "assigned/en route/delivered" with no drop-off.
    const hasDropoffCoords = dLat != null && dLng != null;
    const movingForward =
      editing && ["assigned", "en_route", "delivered"].includes(status);
    if ((driverId || movingForward) && !hasDropoffCoords) {
      setError(
        "Set the drop-off location first — a driver can only be assigned once the delivery has a drop-off.",
      );
      return;
    }
    // Skipping the link means reusing a saved drop-off — so there must be one.
    if (!editing && !sendLink && !lastDropoff) {
      setError(
        "This customer has no saved drop-off yet — tick “Send the customer a tracking link” so they can set it.",
      );
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const fields = {
      reference: reference.trim() || null,
      goods: goods.trim() || null,
      origin_label: originLabel.trim() || null,
      origin_lat: oLat,
      origin_lng: oLng,
      dest_label: destLabel.trim() || null,
      dest_lat: dLat,
      dest_lng: dLng,
      customer_id: customerId || null,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      customer_email: customerEmail.trim() || null,
      driver_id: driverId || null,
      vehicle_id: vehicleId || null,
      device_id: deviceId || null,
      agent_id: agentId || null,
    };

    // ── Edit: update in place, then back to the list ──────────────
    if (editing && delivery) {
      const now = new Date().toISOString();
      const keep = (v: string | null) => v ?? now; // preserve original, else stamp now
      // The admin sets the status explicitly. Keep the lifecycle timestamps
      // COHERENT with the chosen status — clear ones that no longer apply so a
      // delivery can't be e.g. "en_route" while still carrying a delivered_at.
      const patch: Record<string, unknown> = { ...fields, status };
      if (status === "delivered") {
        patch.assigned_at = keep(delivery.assigned_at);
        patch.started_at = keep(delivery.started_at);
        patch.delivered_at = keep(delivery.delivered_at);
      } else if (status === "en_route") {
        patch.assigned_at = keep(delivery.assigned_at);
        patch.started_at = keep(delivery.started_at);
        patch.delivered_at = null;
      } else if (status === "assigned") {
        patch.assigned_at = keep(delivery.assigned_at);
        patch.started_at = null;
        patch.delivered_at = null;
      } else if (status === "cancelled") {
        // Terminal — keep any assigned/started history, but it's not delivered.
        patch.delivered_at = null;
      } else {
        // awaiting_dropoff / pending — not started yet.
        patch.assigned_at = driverId ? keep(delivery.assigned_at) : null;
        patch.started_at = null;
        patch.delivered_at = null;
      }
      const { error: err } = await supabase
        .from("deliveries")
        .update(patch)
        .eq("id", delivery.id);
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      router.push(backHref);
      router.refresh();
      return;
    }

    // ── Create ────────────────────────────────────────────────────
    // Unticked "send link" = reuse the customer's saved drop-off, so the
    // delivery is created 'pending' (ready to assign) instead of waiting on
    // the customer. Ticked = leave it for them to set from their link.
    const saved = !sendLink ? lastDropoff : null; // reuse only when the link is skipped
    const { data, error: err } = await supabase
      .from("deliveries")
      .insert({
        org_id: orgId,
        ...fields,
        dest_label: saved?.label ?? null,
        dest_lat: saved?.lat ?? null,
        dest_lng: saved?.lng ?? null,
        status: saved ? "pending" : "awaiting_dropoff",
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
    setCreated({
      token: data.tracking_token as string,
      phone: customerPhone.trim(),
      name: customerName.trim(),
      reference: reference.trim(),
      sendLink,
    });
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

  // Success state — send the drop-off link to the customer on WhatsApp.
  if (created) {
    const url = trackUrl(created.token);
    const greet = `Hi${created.name ? " " + created.name : ""}, your delivery ${created.reference || ""}`.trim();
    // Link needed → ask them to set the drop-off; reused drop-off → just a tracker.
    const msg = created.sendLink
      ? `${greet} is booked. Please open this link and set your drop-off location: ${url}`
      : `${greet} is booked to your usual drop-off. Track it here: ${url}`;
    const wa = whatsappUrl(created.phone, msg);
    return (
      <div className="ct-card flex flex-col gap-4 p-6 text-center">
        <div>
          <div className="text-2xl font-semibold text-green">Delivery created</div>
          <p className="mt-1 text-sm text-muted2">
            {created.sendLink
              ? "Send the customer their link so they can set the drop-off location."
              : "Created with the customer's saved drop-off — it's ready to assign a driver. No link needed."}
          </p>
        </div>

        {created.sendLink ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="ct-btn-primary w-full !py-3"
            style={{ backgroundImage: "none", backgroundColor: "#25D366" }}
          >
            Send on WhatsApp ({created.phone})
          </a>
        ) : (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="ct-btn-ghost w-full justify-center"
          >
            Send tracking link on WhatsApp (optional)
          </a>
        )}

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
            className="ct-btn-ghost shrink-0"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </div>

        <div className="flex justify-center gap-2">
          <Link href={backHref} className="ct-btn-ghost">
            Back to deliveries
          </Link>
          <Link
            href={`/track/${created.token}`}
            target="_blank"
            rel="noreferrer"
            className="ct-btn-ghost"
          >
            Open tracker
          </Link>
        </div>
      </div>
    );
  }

  // Once a delivery has started (or finished), its details are frozen — the DB
  // enforces this too. Show a locked view instead of the editable form.
  const started =
    editing &&
    !!delivery &&
    ["en_route", "delivered", "cancelled"].includes(delivery.status);
  if (started && delivery) {
    return (
      <div className="ct-card flex flex-col gap-3 p-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-primary">
            {delivery.reference ?? "—"}
          </span>
          <span className="ct-pill bg-s3 text-muted2">
            {delivery.status.replace("_", " ")}
          </span>
        </div>
        <h2 className="text-base font-semibold">
          This delivery has already started
        </h2>
        <p className="text-sm text-muted2">
          Details are locked once a driver starts the trip — you can no longer
          change the pickup, drop-off, customer, or assignment. You can still
          track it live.
        </p>
        <div className="flex gap-2">
          <Link href={backHref} className="ct-btn-ghost">
            Back
          </Link>
          <Link
            href={`/track/${delivery.tracking_token}`}
            target="_blank"
            rel="noreferrer"
            className="ct-btn-ghost"
          >
            Track live
          </Link>
        </div>
      </div>
    );
  }

  // A driver can only be assigned once a drop-off exists — gate the picker on it.
  const hasDropoff = parsePoint(destLat, destLng) != null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Owning agent (admin chooses who handles this delivery) */}
      {agents ? (
        <fieldset className="ct-card flex flex-col gap-3 p-5">
          <legend className="px-1 text-sm font-semibold">Owning agent</legend>
          <div>
            <label className="ct-label" htmlFor="owner_agent">
              Assign this delivery to an agent
            </label>
            <select
              id="owner_agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="ct-input"
            >
              <option value="">— None (admin only) —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name ?? "Agent"}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              The chosen agent will see this delivery in their dispatch board and
              assign it to one of their drivers.
            </p>
          </div>
        </fieldset>
      ) : null}

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

      {/* Map: pickup only on create (customer sets drop-off); both when editing */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">
          {editing ? "Locations on the map" : "Pickup location on the map"}
        </legend>
        <LocationPicker
          origin={parsePoint(originLat, originLng)}
          dest={editing ? parsePoint(destLat, destLng) : null}
          onPick={handlePick}
          mode={editing ? "both" : "origin"}
        />
        {editing ? (
          <p className="rounded-lg bg-s2 px-3 py-2 text-xs text-muted2">
            Tap the map to set the{" "}
            <span className="font-medium text-blue">pickup</span> and{" "}
            <span className="font-medium text-green">drop-off</span> pins, or type
            coordinates below.
          </p>
        ) : (
          <p className="rounded-lg bg-s2 px-3 py-2 text-xs text-muted2">
            The <span className="font-medium text-text">drop-off location</span> is
            set by the customer from the link they receive — it can&rsquo;t be
            entered here.
          </p>
        )}
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

      {/* Destination (drop-off) — editable by admin when editing */}
      {editing ? (
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
              placeholder="e.g. Customer doorstep"
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
                placeholder="14.5995"
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
                placeholder="120.9842"
                className="ct-input font-mono"
              />
            </div>
          </div>
        </fieldset>
      ) : null}

      {/* Customer */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">Customer (receiver)</legend>
        {customers && currentUserId ? (
          <CustomerPicker
            customers={customers}
            value={customerId}
            onPick={applyCustomer}
            orgId={orgId}
            currentUserId={currentUserId}
          />
        ) : null}
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
              Mobile number *
            </label>
            <input
              id="customer_phone"
              type="tel"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+91 90000 00000"
              className="ct-input"
            />
            <p className="mt-1 text-xs text-muted">
              The drop-off link is sent here, and the customer logs in with this
              number.
            </p>
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

      {/* Assignment — edit-only. New deliveries get their driver AFTER the
          customer sets the drop-off, assigned from the dispatch board. */}
      {editing ? (
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
              disabled={!hasDropoff}
              title={
                hasDropoff
                  ? "Assign a driver"
                  : "Set the drop-off location first — a driver can only be assigned once the delivery has a drop-off."
              }
              onChange={(e) => {
                const v = e.target.value;
                setDriverId(v);
                // Auto-fill the driver's assigned vehicle (same as agent board).
                const drv = drivers.find((d) => d.id === v);
                setVehicleId(v ? (drv?.vehicle_id ?? "") : "");
              }}
              className={`ct-input ${hasDropoff ? "" : "cursor-not-allowed opacity-60"}`}
            >
              <option value="">Unassigned</option>
              {drivers.map((d) => {
                const b = busyByDriver.get(d.id);
                const isMe = delivery && b?.deliveryId === delivery.id;
                const busy = b && !isMe;
                const suffix = busy
                  ? b.status === "en_route"
                    ? ` — On the road · ${b.reference ?? "active trip"}`
                    : ` — On ${b.reference ?? "active trip"}`
                  : " — Available";
                return (
                  <option key={d.id} value={d.id}>
                    {(d.full_name ?? d.id) + suffix}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-xs text-muted">
              {hasDropoff
                ? "Available drivers are free for a new trip; busy drivers are currently assigned or on the road."
                : "Set the drop-off location above first — a driver can only be assigned once the delivery has a drop-off."}
            </p>
          </div>
          <div>
            <label className="ct-label" htmlFor="vehicle">
              Vehicle
            </label>
            <select
              id="vehicle"
              value={vehicleId}
              onChange={editing ? (e) => setVehicleId(e.target.value) : () => {}}
              disabled={!editing}
              title={
                editing
                  ? "Vehicle for this delivery"
                  : "Vehicle is set from the driver — edit it on the driver"
              }
              className={`ct-input ${editing ? "" : "cursor-not-allowed"}`}
            >
              <option value="">
                {editing ? "Unassigned" : "— vehicle from driver —"}
              </option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.plate ? ` · ${v.plate}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              {editing
                ? "Auto-filled from the driver; change it here if needed."
                : "Set from the chosen driver. To change it, edit the driver."}
            </p>
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
      </fieldset>
      ) : null}

      {/* On create: send the drop-off link, or reuse the customer's saved drop-off. */}
      {!editing ? (
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-s2 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={sendLink}
              onChange={(e) => setSendLink(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium text-text">
                Send the customer a tracking link to set their drop-off
              </span>
              <span className="mt-0.5 block text-xs text-muted2">
                {lastDropoff
                  ? `Unticked: reuse their saved drop-off (${lastDropoff.label ?? "saved location"}) and skip the link — the delivery is ready to assign immediately.`
                  : "New customers need the link to tell us where to deliver."}
              </span>
            </span>
          </label>
          <p className="rounded-lg bg-s2 px-3 py-2 text-xs text-muted2">
            {sendLink
              ? "No driver is chosen now. Once the customer sets their drop-off, this delivery becomes ready to assign on the dispatch board."
              : "The delivery will be created ready to assign on the dispatch board, using the customer's saved drop-off."}
          </p>
        </div>
      ) : null}

      {/* Status — admin sets it directly when editing */}
      {editing ? (
        <fieldset className="ct-card flex flex-col gap-3 p-5">
          <legend className="px-1 text-sm font-semibold">Status</legend>
          <div>
            <label className="ct-label" htmlFor="status">
              Delivery status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as DeliveryStatus)}
              className="ct-input"
            >
              {EDITABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Set the status manually. Lifecycle timestamps are filled in
              automatically when you move it forward.
            </p>
          </div>
        </fieldset>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Link href={backHref} className="ct-btn-ghost">
          Cancel
        </Link>
        <button type="submit" disabled={busy} className="ct-btn-primary">
          {busy ? (
            <>
              <Spinner /> {editing ? "Saving…" : "Creating…"}
            </>
          ) : editing ? (
            "Save changes"
          ) : (
            "Create delivery"
          )}
        </button>
      </div>
    </form>
  );
}
