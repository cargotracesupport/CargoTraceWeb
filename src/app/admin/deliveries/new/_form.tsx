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
  /** Name of the driver chosen on create, if any. */
  driverName: string | null;
}

/** A saved drop-off address for a customer (customer_addresses row). */
type SavedAddress = {
  id: string;
  lat: number;
  lng: number;
  label: string | null;
  nickname: string | null;
};

// All saved addresses for a customer (newest first). Empty array when none.
async function fetchAddresses(c: Customer): Promise<SavedAddress[]> {
  const supabase = createClient();
  // Soft-fail if the table is missing/unreadable — the create flow simply
  // shows "send link" as the only option, matching pre-address-book behaviour.
  try {
    const { data, error } = await supabase
      .from("customer_addresses")
      .select("id, lat, lng, label, nickname")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []) as SavedAddress[];
  } catch {
    return [];
  }
}

/** Human name for a saved address: nickname first, else auto label, else coords. */
function addressName(a: SavedAddress): string {
  return (
    a.nickname ||
    a.label ||
    `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`
  );
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

  // Drop-off choice for this delivery: either the id of one of the customer's
  // saved addresses (skip the link), or the empty string to send them the link
  // so they can set a fresh one. Defaults to the newest saved address when the
  // customer has any; otherwise to "send link".
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [pickedAddressId, setPickedAddressId] = useState<string>("");
  const dropoffReq = useRef(0); // drop stale lookups if the agent picks again quickly

  // Picked a saved customer → fill their details and load all their saved
  // addresses; blank → one-off (unlinked), link mode.
  function applyCustomer(c: Customer | null) {
    const req = ++dropoffReq.current;
    if (c) {
      setCustomerId(c.id);
      setCustomerName(c.name ?? "");
      setCustomerPhone(c.phone ?? "");
      setCustomerEmail(c.email ?? "");
      fetchAddresses(c).then((list) => {
        if (req !== dropoffReq.current) return; // a newer pick superseded this
        setSavedAddresses(list);
        setPickedAddressId(list[0]?.id ?? ""); // newest by default, else send link
      });
    } else {
      setCustomerId("");
      setSavedAddresses([]);
      setPickedAddressId("");
    }
  }
  // Derived: what the agent chose for THIS delivery.
  const pickedAddress = pickedAddressId
    ? savedAddresses.find((a) => a.id === pickedAddressId) ?? null
    : null;
  const sendLink = !pickedAddress; // no address picked → send link
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

    // A driver may be chosen before the drop-off exists (pre-assigned: the
    // delivery stays "awaiting drop-off" and goes to the driver once the
    // customer sets it). But the status can't move forward without one, so a
    // delivery can't be "assigned/en route/delivered" with no drop-off.
    const hasDropoffCoords = dLat != null && dLng != null;
    const movingForward =
      editing && ["assigned", "en_route", "delivered"].includes(status);
    if (movingForward && !hasDropoffCoords) {
      setError(
        "Set the drop-off location first — a delivery can't be assigned, en route or delivered without one.",
      );
      return;
    }
    // Sanity: if agent selected a saved address, it must exist in the loaded set.
    if (!editing && pickedAddressId && !pickedAddress) {
      setError("Selected address not found - please pick again.");
      return;
    }

    // On create the starred fields are required. (Map fields and the customer
    // picker aren't plain <input>s, so the browser's `required` can't cover
    // them — validate here.) Reference is auto-generated, the drop-off is set
    // by the customer or a saved address, and email and driver are optional.
    if (!editing) {
      let missing: string | null = null;
      if (!goods.trim()) missing = "Goods is required.";
      else if (!originLabel.trim()) missing = "Pickup label is required.";
      else if (oLat == null || oLng == null)
        missing = "Set the pickup location on the map (latitude and longitude).";
      else if (!customerName.trim()) missing = "Customer name is required.";
      else if (!customerPhone.trim())
        missing = "Customer mobile number is required.";
      if (missing) {
        setError(missing);
        return;
      }
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
      // Keep driver, drop-off and status coherent for a not-yet-started
      // delivery: no drop-off means "awaiting drop-off" (a driver may be
      // pre-assigned and gets the trip once the customer sets it); a drop-off
      // with a driver means "assigned"; a drop-off without one means "pending".
      // Without this a driver could be set while status stayed "pending", and
      // the driver app (which only shows assigned/en_route) would never see the
      // trip — it looked unassigned until you edited it a second time.
      const notStarted =
        status === "awaiting_dropoff" ||
        status === "pending" ||
        (status === "assigned" && !driverId);
      const effStatus: DeliveryStatus = notStarted
        ? !hasDropoffCoords
          ? "awaiting_dropoff"
          : driverId
            ? "assigned"
            : "pending"
        : status;
      // The admin sets the status explicitly. Keep the lifecycle timestamps
      // COHERENT with the chosen status — clear ones that no longer apply so a
      // delivery can't be e.g. "en_route" while still carrying a delivered_at.
      const patch: Record<string, unknown> = { ...fields, status: effStatus };
      if (effStatus === "delivered") {
        patch.assigned_at = keep(delivery.assigned_at);
        patch.started_at = keep(delivery.started_at);
        patch.delivered_at = keep(delivery.delivered_at);
      } else if (effStatus === "en_route") {
        patch.assigned_at = keep(delivery.assigned_at);
        patch.started_at = keep(delivery.started_at);
        patch.delivered_at = null;
      } else if (effStatus === "assigned") {
        patch.assigned_at = keep(delivery.assigned_at);
        patch.started_at = null;
        patch.delivered_at = null;
      } else if (effStatus === "cancelled") {
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
    // A saved drop-off picked = the delivery doesn't wait on the customer: it
    // is created 'assigned' with a driver, or 'pending' (ready to assign)
    // without one. Otherwise it waits for the customer to set the drop-off
    // from their link; a driver chosen now is pre-assigned and the drop-off
    // endpoint moves it to 'assigned' once the customer sets it.
    const saved = pickedAddress; // agent picked one -> seed the delivery with it
    const savedLabel = saved ? saved.nickname || saved.label : null;
    const createStatus: DeliveryStatus = !saved
      ? "awaiting_dropoff"
      : driverId
        ? "assigned"
        : "pending";
    const { data, error: err } = await supabase
      .from("deliveries")
      .insert({
        org_id: orgId,
        ...fields,
        // Reference is auto-generated by the DB (CT-1000, CT-1001…). Send null
        // so the set_delivery_reference trigger assigns the next number.
        reference: null,
        dest_label: savedLabel,
        dest_lat: saved?.lat ?? null,
        dest_lng: saved?.lng ?? null,
        status: createStatus,
        assigned_at: driverId ? new Date().toISOString() : null,
      })
      .select("tracking_token, reference")
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
      reference: (data.reference as string | null) ?? reference.trim(),
      sendLink,
      driverName: driverId
        ? (drivers.find((d) => d.id === driverId)?.full_name ?? "the driver")
        : null,
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
              ? created.driverName
                ? `Send the customer their link so they can set the drop-off location. ${created.driverName} gets the trip as soon as they do.`
                : "Send the customer their link so they can set the drop-off location."
              : created.driverName
                ? `Created with the customer's saved drop-off and assigned to ${created.driverName}. No link needed.`
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
        ) : null}

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

  // Whether the delivery will have a drop-off: on edit the coordinates, on
  // create a picked saved address. Without one a chosen driver is pre-assigned.
  const hasDropoff = editing
    ? parsePoint(destLat, destLng) != null
    : pickedAddress != null;

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
            {editing ? (
              <input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. CT-1042"
                className="ct-input font-mono"
              />
            ) : (
              <>
                <input
                  id="reference"
                  value="Auto-generated"
                  readOnly
                  disabled
                  className="ct-input font-mono cursor-not-allowed opacity-70"
                />
                <p className="mt-1 text-xs text-muted">
                  Assigned automatically on create (CT-1000, CT-1001…).
                </p>
              </>
            )}
          </div>
          <div>
            <label className="ct-label" htmlFor="goods">
              Goods{!editing ? <span className="text-red"> *</span> : null}
            </label>
            <input
              id="goods"
              required={!editing}
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
            Label{!editing ? <span className="text-red"> *</span> : null}
          </label>
          <input
            id="origin_label"
            required={!editing}
            value={originLabel}
            onChange={(e) => setOriginLabel(e.target.value)}
            placeholder="e.g. Manila Warehouse"
            className="ct-input"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="ct-label" htmlFor="origin_lat">
              Latitude{!editing ? <span className="text-red"> *</span> : null}
            </label>
            <input
              id="origin_lat"
              required={!editing}
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
              Longitude{!editing ? <span className="text-red"> *</span> : null}
            </label>
            <input
              id="origin_lng"
              required={!editing}
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
              Name{!editing ? <span className="text-red"> *</span> : null}
            </label>
            <input
              id="customer_name"
              required={!editing}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jane Dela Cruz"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="customer_phone">
              Mobile number<span className="text-red"> *</span>
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
              Email <span className="font-normal text-muted">(optional)</span>
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

      {/* On create: pick one of the customer's saved drop-offs, or send them the
          link so they set a fresh one. New / one-off customers only see the link. */}
      {!editing ? (
        <fieldset className="ct-card flex flex-col gap-3 p-5">
          <legend className="px-1 text-sm font-semibold">Drop-off</legend>
          {savedAddresses.length > 0 ? (
            <>
              <p className="text-xs text-muted2">
                {savedAddresses.length === 1
                  ? "This customer has 1 saved address — deliver to it, or send them the link for a new one."
                  : `This customer has ${savedAddresses.length} saved addresses — pick one, or send them the link for a new one.`}
              </p>
              <div className="flex flex-col gap-2">
                {savedAddresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm ${
                      pickedAddressId === a.id
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-s2"
                    }`}
                  >
                    <input
                      type="radio"
                      name="dropoff_choice"
                      className="mt-0.5 h-4 w-4"
                      checked={pickedAddressId === a.id}
                      onChange={() => setPickedAddressId(a.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-text">
                        {addressName(a)}
                      </span>
                      {a.nickname && a.label ? (
                        <span className="mt-0.5 block truncate text-xs text-muted2">
                          {a.label}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm ${
                    pickedAddressId === ""
                      ? "border-primary/60 bg-primary/5"
                      : "border-border bg-s2"
                  }`}
                >
                  <input
                    type="radio"
                    name="dropoff_choice"
                    className="mt-0.5 h-4 w-4"
                    checked={pickedAddressId === ""}
                    onChange={() => setPickedAddressId("")}
                  />
                  <span>
                    <span className="block font-medium text-text">
                      Send the customer a tracking link (new address)
                    </span>
                    <span className="mt-0.5 block text-xs text-muted2">
                      They set the drop-off from the link, and we save it to
                      their addresses for next time.
                    </span>
                  </span>
                </label>
              </div>
            </>
          ) : (
            <p className="rounded-lg bg-s2 px-3 py-3 text-sm text-muted2">
              {customerId
                ? "This customer has no saved addresses yet — a tracking link will be sent so they can set their drop-off. It’ll be saved for next time."
                : "New / one-off customer — a tracking link will be sent so they can set their drop-off."}
            </p>
          )}
          <p className="rounded-lg bg-s2 px-3 py-2 text-xs text-muted2">
            {sendLink
              ? "The delivery waits for the customer to set their drop-off. A driver chosen below gets it as soon as they do."
              : "The delivery uses the selected saved address, so a driver chosen below gets it right away."}
          </p>
        </fieldset>
      ) : null}

      {/* Assignment — optional on create and editable later. A driver chosen
          before the drop-off exists is pre-assigned: they get the trip as soon
          as the customer sets it. */}
      <fieldset className="ct-card flex flex-col gap-4 p-5">
        <legend className="px-1 text-sm font-semibold">
          Assignment
          {!editing ? (
            <span className="font-normal text-muted"> (optional)</span>
          ) : null}
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="ct-label" htmlFor="driver">
              Driver
            </label>
            <select
              id="driver"
              value={driverId}
              onChange={(e) => {
                const v = e.target.value;
                setDriverId(v);
                // Auto-fill the driver's assigned vehicle (same as agent board).
                const drv = drivers.find((d) => d.id === v);
                setVehicleId(v ? (drv?.vehicle_id ?? "") : "");
                // Keep the Status field coherent so the driver actually receives
                // the trip: picking a driver on a not-yet-started delivery with a
                // drop-off marks it assigned; clearing it drops back to pending.
                // Without a drop-off it stays awaiting drop-off (pre-assigned).
                // Still overridable.
                setStatus((s) =>
                  v
                    ? (s === "pending" || s === "awaiting_dropoff") && hasDropoff
                      ? "assigned"
                      : s
                    : s === "assigned"
                      ? hasDropoff
                        ? "pending"
                        : "awaiting_dropoff"
                      : s,
                );
              }}
              className="ct-input"
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
              {!driverId
                ? editing
                  ? "Available drivers are free for a new trip; busy drivers are currently assigned or on the road."
                  : "Leave unassigned to pick a driver later from the dispatch board."
                : hasDropoff
                  ? "The driver gets this trip right away."
                  : "Pre-assigned — the driver gets this trip as soon as the customer sets the drop-off."}
            </p>
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
              <option value="">Unassigned</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.plate ? ` · ${v.plate}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Auto-filled from the driver; change it here if needed.
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
