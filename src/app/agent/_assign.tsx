"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Delivery } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import Spinner from "@/components/Spinner";
import Link from "next/link";
import { Avatar, MapPin, Flag, Package, Check, Search, Truck, Plus } from "@/components/icons";
import { groupSameRoute } from "@/lib/cluster";

export type DriverOption = {
  id: string;
  full_name: string | null;
  vehicle_id: string | null;
};
export type VehicleOption = { id: string; plate: string | null; name: string | null };

const DONE = new Set(["delivered", "cancelled"]);
// A delivery can still be (re)assigned only while pending or assigned.
const ASSIGNABLE = new Set(["pending", "assigned"]);

export default function AssignConsole({
  initialDeliveries,
  drivers,
  vehicles,
  agentId,
  mode = "all",
}: {
  initialDeliveries: Delivery[];
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  agentId: string;
  mode?: "all" | "unassigned";
}) {
  const unassignedOnly = mode === "unassigned";
  const [rows, setRows] = useState<Delivery[]>(initialDeliveries);
  const [query, setQuery] = useState("");

  const driverName = useCallback(
    (id: string | null) =>
      id ? (drivers.find((d) => d.id === id)?.full_name ?? "Driver") : null,
    [drivers],
  );

  const vehicleLabel = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const v = vehicles.find((x) => x.id === id);
      return v ? (v.plate ?? v.name ?? "Vehicle") : null;
    },
    [vehicles],
  );

  // Keep the board live: merge in inserts/updates/deletes from other actors
  // (admin creating deliveries, drivers starting trips, position-driven status).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("agent-deliveries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== (payload.old as Delivery).id);
            }
            const next = payload.new as Delivery;
            // Defense-in-depth: never show another agent's delivery, even if a
            // realtime event somehow slipped through (DB misconfig regression).
            if (next.agent_id && next.agent_id !== agentId) return prev;
            const i = prev.findIndex((r) => r.id === next.id);
            if (i === -1) return [next, ...prev];
            const copy = prev.slice();
            copy[i] = next;
            return copy;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId]);

  const counts = useMemo(() => {
    let unassigned = 0,
      assigned = 0,
      enRoute = 0,
      completed = 0;
    for (const r of rows) {
      if (r.status === "delivered" || r.status === "cancelled") completed++;
      else if (r.status === "en_route") enRoute++;
      else if (r.driver_id) assigned++;
      else unassigned++;
    }
    return { unassigned, assigned, enRoute, completed };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.reference, r.goods, r.dest_label, r.origin_label, r.customer_name]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  // New flow: no driver until the customer sets a drop-off.
  //  • awaiting_dropoff → waiting on the customer (not assignable yet)
  //  • pending w/ drop-off + no driver → READY to assign (grouped by route)
  const waitingDropoff = filtered.filter(
    (r) => r.status === "awaiting_dropoff",
  );
  const ready = filtered.filter(
    (r) =>
      !r.driver_id &&
      r.status === "pending" &&
      r.dest_lat != null &&
      r.dest_lng != null,
  );
  const active = filtered.filter(
    (r) => r.driver_id && !DONE.has(r.status),
  );
  const done = filtered.filter((r) => DONE.has(r.status));

  // Cluster the ready deliveries into same-route groups (proximity-based).
  // Deliveries missing a pickup coordinate can't be clustered → own group.
  const routeGroups = useMemo(() => {
    const withPts = ready
      .filter((r) => r.origin_lat != null && r.origin_lng != null)
      .map((r) => ({
        delivery: r,
        origin: { lat: r.origin_lat as number, lng: r.origin_lng as number },
        dest: { lat: r.dest_lat as number, lng: r.dest_lng as number },
      }));
    const grouped = groupSameRoute(withPts).map((g) => g.map((x) => x.delivery));
    const singles = ready
      .filter((r) => r.origin_lat == null || r.origin_lng == null)
      .map((r) => [r]);
    return [...grouped, ...singles];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ready.map((r) => [r.id, r.origin_lat, r.dest_lat]))]);

  const patchRow = useCallback((row: Delivery) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
  }, []);

  // Driver availability: which active delivery each driver is on (if any).
  const busyByDriver = useMemo(() => {
    const m = new Map<
      string,
      { status: string; reference: string | null; deliveryId: string }
    >();
    for (const r of rows) {
      if (!r.driver_id) continue;
      if (r.status !== "en_route" && r.status !== "assigned") continue;
      m.set(r.driver_id, {
        status: r.status,
        reference: r.reference,
        deliveryId: r.id,
      });
    }
    return m;
  }, [rows]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {unassignedOnly ? "Unassigned orders" : "Dispatch board"}
          </h1>
          <p className="text-sm text-muted2">
            {unassignedOnly
              ? "Orders waiting for a driver. Assign a driver and vehicle to each."
              : "Assign each delivery to a driver. Updates appear live as drivers move."}
          </p>
        </div>
        <Link href="/agent/deliveries/new" className="ct-btn-primary">
          <Plus className="h-4 w-4" /> New delivery
        </Link>
      </div>

      {/* Stat tiles */}
      {!unassignedOnly && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Unassigned" value={counts.unassigned} tone="amber" />
          <Stat label="Assigned" value={counts.assigned} tone="blue" />
          <Stat label="En route" value={counts.enRoute} tone="green" />
          <Stat label="Completed" value={counts.completed} tone="muted" />
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reference, goods, destination, customer…"
          className="ct-input pl-9"
        />
      </div>

      {unassignedOnly ? (
        <>
          <ReadyToAssign
            groups={routeGroups}
            drivers={drivers}
            busyByDriver={busyByDriver}
            onAssigned={patchRow}
          />
          <WaitingForDropoff deliveries={waitingDropoff} />
          {routeGroups.length === 0 && waitingDropoff.length === 0 ? (
            <Section title="Needs a driver" count={0} empty="Nothing waiting to assign — every drop-off is set and assigned.">
              {null}
            </Section>
          ) : null}
        </>
      ) : rows.length === 0 ? (
        <div className="ct-card flex flex-col items-center gap-2 px-5 py-16 text-center">
          <Package className="h-6 w-6 text-muted2" />
          <p className="text-sm text-muted2">
            No deliveries yet. They&rsquo;ll show up here once an admin creates them.
          </p>
        </div>
      ) : (
        <>
          <ReadyToAssign
            groups={routeGroups}
            drivers={drivers}
            busyByDriver={busyByDriver}
            onAssigned={patchRow}
          />
          <WaitingForDropoff deliveries={waitingDropoff} />
          <Section
            title="Assigned & en route"
            count={active.length}
            empty="No deliveries are out with a driver right now."
          >
            {active.map((d) => (
              <DeliveryRow
                key={d.id}
                delivery={d}
                drivers={drivers}
                vehicles={vehicles}
                driverName={driverName}
                vehicleLabel={vehicleLabel}
                busyByDriver={busyByDriver}
                onAssigned={patchRow}
              />
            ))}
          </Section>

          {done.length > 0 && (
            <Section title="Completed" count={done.length}>
              {done.map((d) => (
                <DeliveryRow
                  key={d.id}
                  delivery={d}
                  drivers={drivers}
                  vehicles={vehicles}
                  driverName={driverName}
                  vehicleLabel={vehicleLabel}
                  busyByDriver={busyByDriver}
                  onAssigned={patchRow}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/* ── Ready to assign: same-route groups + one-tap batch assign ──────────── */

function ReadyToAssign({
  groups,
  drivers,
  busyByDriver,
  onAssigned,
}: {
  groups: Delivery[][];
  drivers: DriverOption[];
  busyByDriver: Map<
    string,
    { status: string; reference: string | null; deliveryId: string }
  >;
  onAssigned: (row: Delivery) => void;
}) {
  const total = groups.reduce((n, g) => n + g.length, 0);
  if (total === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">
          Ready to assign{" "}
          <span className="ct-pill bg-amber/10 text-amber">{total}</span>
        </h2>
        <span className="text-xs text-muted2">
          {groups.length} route group{groups.length > 1 ? "s" : ""}
        </span>
      </div>
      <p className="px-1 text-xs text-muted2">
        Drop-off is set — grouped by route. Put same-route deliveries on one
        driver.
      </p>
      {groups.map((g, i) => (
        <RouteGroupCard
          key={g[0].id + ":" + i}
          group={g}
          drivers={drivers}
          busyByDriver={busyByDriver}
          onAssigned={onAssigned}
        />
      ))}
    </section>
  );
}

function RouteGroupCard({
  group,
  drivers,
  busyByDriver,
  onAssigned,
}: {
  group: Delivery[];
  drivers: DriverOption[];
  busyByDriver: Map<
    string,
    { status: string; reference: string | null; deliveryId: string }
  >;
  onAssigned: (row: Delivery) => void;
}) {
  const [driverId, setDriverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const driver = drivers.find((d) => d.id === driverId);

  async function assignAll() {
    if (!driverId) {
      setError("Pick a driver for this route.");
      return;
    }
    setBusy(true);
    setError(null);
    setDoneCount(0);
    const supabase = createClient();
    const vehicleId = driver?.vehicle_id ?? null;
    const errs: string[] = [];
    let ok = 0;
    for (const d of group) {
      const { data, error: err } = await supabase.rpc(
        "assign_delivery_to_driver",
        { p_delivery_id: d.id, p_driver_id: driverId, p_vehicle_id: vehicleId },
      );
      if (err) errs.push(`${d.reference ?? "delivery"}: ${err.message}`);
      else {
        ok++;
        setDoneCount(ok);
        if (data) onAssigned(data as Delivery);
      }
    }
    setBusy(false);
    if (errs.length) setError(errs.join(" · "));
  }

  return (
    <div className="ct-card flex flex-col gap-3 p-4">
      <ul className="flex flex-col gap-1.5">
        {group.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="shrink-0 font-mono font-medium text-primary">
              {d.reference ?? "—"}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1 text-muted2">
              <Flag className="h-3 w-3 shrink-0 text-accent" />
              <span className="truncate">{d.dest_label ?? "Drop-off"}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="ct-input min-w-[160px] flex-1"
          aria-label="Assign route to driver"
        >
          <option value="">— Assign to driver —</option>
          {drivers.map((d) => {
            const b = busyByDriver.get(d.id);
            const suffix = b
              ? b.status === "en_route"
                ? ` — On the road · ${b.reference ?? "trip"}`
                : ` — On ${b.reference ?? "trip"}`
              : " — Available";
            return (
              <option key={d.id} value={d.id}>
                {(d.full_name ?? "Driver") + suffix}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          disabled={busy || !driverId}
          onClick={assignAll}
          className="ct-btn-primary disabled:opacity-60"
        >
          {busy ? (
            <>
              <Spinner /> Assigning {doneCount}/{group.length}…
            </>
          ) : (
            `Assign ${group.length} to driver`
          )}
        </button>
      </div>
      {error ? <p className="text-xs text-red">{error}</p> : null}
    </div>
  );
}

/* ── Waiting for the customer to set their drop-off ─────────────────────── */

function WaitingForDropoff({ deliveries }: { deliveries: Delivery[] }) {
  if (deliveries.length === 0) return null;
  return (
    <Section title="Waiting for drop-off" count={deliveries.length}>
      {deliveries.map((d) => (
        <div
          key={d.id}
          className="ct-card flex items-start justify-between gap-3 p-4"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium text-primary">
                {d.reference ?? "—"}
              </span>
              <DeliveryStatusBadge status={d.status} />
            </div>
            <p className="mt-1 truncate text-sm text-text">
              {d.goods ?? "Delivery"}
            </p>
            <p className="mt-1 text-xs text-muted2">
              {d.customer_name ?? "Customer"} · waiting for them to set the
              drop-off before you can assign a driver.
            </p>
          </div>
        </div>
      ))}
    </Section>
  );
}

/* ── A single delivery row with its assignment control ─────────────────── */

function DeliveryRow({
  delivery,
  drivers,
  vehicles,
  driverName,
  vehicleLabel,
  busyByDriver,
  onAssigned,
}: {
  delivery: Delivery;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  driverName: (id: string | null) => string | null;
  vehicleLabel: (id: string | null) => string | null;
  busyByDriver: Map<
    string,
    { status: string; reference: string | null; deliveryId: string }
  >;
  onAssigned: (row: Delivery) => void;
}) {
  const [selected, setSelected] = useState<string>(delivery.driver_id ?? "");
  const [vehicle, setVehicle] = useState<string>(delivery.vehicle_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the pickers in sync if the row changes underneath us (realtime).
  useEffect(() => {
    setSelected(delivery.driver_id ?? "");
    setVehicle(delivery.vehicle_id ?? "");
  }, [delivery.driver_id, delivery.vehicle_id]);

  const canAssign = ASSIGNABLE.has(delivery.status);
  const dirty =
    selected !== (delivery.driver_id ?? "") ||
    vehicle !== (delivery.vehicle_id ?? "");

  async function assign() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc(
        "assign_delivery_to_driver",
        {
          p_delivery_id: delivery.id,
          p_driver_id: selected || null,
          p_vehicle_id: vehicle || null,
        },
      );
      if (err) throw new Error(err.message);
      if (data) onAssigned(data as Delivery);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign.");
      setSelected(delivery.driver_id ?? ""); // revert pickers on failure
      setVehicle(delivery.vehicle_id ?? "");
    } finally {
      setBusy(false);
    }
  }

  const currentDriver = driverName(delivery.driver_id);
  const currentVehicle = vehicleLabel(delivery.vehicle_id);

  return (
    <div className="ct-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-primary">
              {delivery.reference ?? "—"}
            </span>
            <DeliveryStatusBadge status={delivery.status} />
          </div>
          <p className="mt-1 truncate text-sm text-text">
            {delivery.goods ?? "Delivery"}
          </p>
          <div className="mt-2 flex flex-col gap-1 text-xs text-muted2 sm:flex-row sm:items-center sm:gap-3">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">{delivery.origin_label ?? "—"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5 text-accent" />
              <span className="truncate">{delivery.dest_label ?? "—"}</span>
            </span>
          </div>
          {delivery.customer_name ? (
            <p className="mt-1 text-xs text-muted">For {delivery.customer_name}</p>
          ) : null}
        </div>

        {/* Current driver + vehicle */}
        <div className="flex flex-col items-end gap-1">
          {currentDriver ? (
            <div className="flex items-center gap-2">
              <Avatar name={currentDriver} size={26} />
              <span className="text-sm font-medium">{currentDriver}</span>
            </div>
          ) : (
            <span className="ct-pill bg-amber/10 text-amber">Unassigned</span>
          )}
          {currentVehicle ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted2">
              <Truck className="h-3.5 w-3.5" /> {currentVehicle}
            </span>
          ) : null}
        </div>
      </div>

      {/* Assignment control */}
      {canAssign ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={`drv-${delivery.id}`}>
            Driver
          </label>
          <select
            id={`drv-${delivery.id}`}
            value={selected}
            onChange={(e) => {
              const v = e.target.value;
              setSelected(v);
              // Auto-fill the driver's assigned vehicle (still overridable).
              const drv = drivers.find((d) => d.id === v);
              setVehicle(v ? (drv?.vehicle_id ?? "") : "");
            }}
            disabled={busy}
            className="ct-input sm:flex-1"
          >
            <option value="">— Unassigned —</option>
            {drivers.map((d) => {
              const b = busyByDriver.get(d.id);
              // Don't mark them as busy if this is the same delivery.
              const isMe = b?.deliveryId === delivery.id;
              const busyNow = b && !isMe;
              const suffix = busyNow
                ? b.status === "en_route"
                  ? ` — On the road · ${b.reference ?? "active trip"}`
                  : ` — On ${b.reference ?? "active trip"}`
                : " — Available";
              return (
                <option key={d.id} value={d.id}>
                  {(d.full_name ?? "Driver") + suffix}
                </option>
              );
            })}
          </select>

          <label className="sr-only" htmlFor={`veh-${delivery.id}`}>
            Vehicle number
          </label>
          {/* Read-only: the vehicle comes from the chosen driver. */}
          <select
            id={`veh-${delivery.id}`}
            value={vehicle}
            onChange={() => {}}
            disabled
            title="Vehicle is set from the driver — edit it on the driver"
            className="ct-input cursor-not-allowed sm:flex-1"
          >
            <option value="">— vehicle from driver —</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate ?? v.name ?? "Vehicle"}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={assign}
            disabled={busy || !dirty}
            className="ct-btn-primary"
          >
            {busy ? (
              <>
                <Spinner /> Saving…
              </>
            ) : delivery.driver_id ? (
              "Reassign"
            ) : (
              "Assign"
            )}
          </button>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted2">
          <Check className="h-3.5 w-3.5 text-green" />
          {delivery.status === "en_route"
            ? "On the road — locked to its driver."
            : "Completed."}
        </p>
      )}

      {error ? (
        <p className="mt-2 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ── Small presentational helpers ──────────────────────────────────────── */

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="ct-pill bg-s3 text-muted2">{count}</span>
      </div>
      {count === 0 ? (
        empty ? (
          <p className="px-1 text-sm text-muted2">{empty}</p>
        ) : null
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}

const TONE: Record<string, string> = {
  amber: "text-amber",
  blue: "text-blue",
  green: "text-green",
  muted: "text-muted2",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONE | string;
}) {
  return (
    <div className="ct-stat">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
        {label}
      </span>
      <span className={`font-mono text-2xl font-bold ${TONE[tone] ?? "text-text"}`}>
        {value}
      </span>
    </div>
  );
}
