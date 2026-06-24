"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Delivery } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import Spinner from "@/components/Spinner";
import { Avatar, MapPin, Flag, Package, Check, Search } from "@/components/icons";

export type DriverOption = { id: string; full_name: string | null };

const DONE = new Set(["delivered", "cancelled"]);
// A delivery can still be (re)assigned only while pending or assigned.
const ASSIGNABLE = new Set(["pending", "assigned"]);

export default function AssignConsole({
  initialDeliveries,
  drivers,
}: {
  initialDeliveries: Delivery[];
  drivers: DriverOption[];
}) {
  const [rows, setRows] = useState<Delivery[]>(initialDeliveries);
  const [query, setQuery] = useState("");

  const driverName = useCallback(
    (id: string | null) =>
      id ? (drivers.find((d) => d.id === id)?.full_name ?? "Driver") : null,
    [drivers],
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
  }, []);

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

  const needsDriver = filtered.filter(
    (r) => !r.driver_id && !DONE.has(r.status),
  );
  const active = filtered.filter(
    (r) => r.driver_id && !DONE.has(r.status),
  );
  const done = filtered.filter((r) => DONE.has(r.status));

  const patchRow = useCallback((row: Delivery) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Dispatch board</h1>
        <p className="text-sm text-muted2">
          Assign each delivery to a driver. Updates appear live as drivers move.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Unassigned" value={counts.unassigned} tone="amber" />
        <Stat label="Assigned" value={counts.assigned} tone="blue" />
        <Stat label="En route" value={counts.enRoute} tone="green" />
        <Stat label="Completed" value={counts.completed} tone="muted" />
      </div>

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

      {rows.length === 0 ? (
        <div className="ct-card flex flex-col items-center gap-2 px-5 py-16 text-center">
          <Package className="h-6 w-6 text-muted2" />
          <p className="text-sm text-muted2">
            No deliveries yet. They&rsquo;ll show up here once an admin creates them.
          </p>
        </div>
      ) : (
        <>
          <Section
            title="Needs a driver"
            count={needsDriver.length}
            empty="Nothing waiting — every active delivery has a driver."
          >
            {needsDriver.map((d) => (
              <DeliveryRow
                key={d.id}
                delivery={d}
                drivers={drivers}
                driverName={driverName}
                onAssigned={patchRow}
              />
            ))}
          </Section>

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
                driverName={driverName}
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
                  driverName={driverName}
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

/* ── A single delivery row with its assignment control ─────────────────── */

function DeliveryRow({
  delivery,
  drivers,
  driverName,
  onAssigned,
}: {
  delivery: Delivery;
  drivers: DriverOption[];
  driverName: (id: string | null) => string | null;
  onAssigned: (row: Delivery) => void;
}) {
  const [selected, setSelected] = useState<string>(delivery.driver_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the picker in sync if the row changes underneath us (realtime).
  useEffect(() => {
    setSelected(delivery.driver_id ?? "");
  }, [delivery.driver_id]);

  const canAssign = ASSIGNABLE.has(delivery.status);
  const dirty = selected !== (delivery.driver_id ?? "");

  async function assign() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc(
        "assign_delivery_to_driver",
        { p_delivery_id: delivery.id, p_driver_id: selected || null },
      );
      if (err) throw new Error(err.message);
      if (data) onAssigned(data as Delivery);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign.");
      setSelected(delivery.driver_id ?? ""); // revert picker on failure
    } finally {
      setBusy(false);
    }
  }

  const currentDriver = driverName(delivery.driver_id);

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

        {/* Current driver chip */}
        <div className="flex items-center gap-2">
          {currentDriver ? (
            <>
              <Avatar name={currentDriver} size={26} />
              <span className="text-sm font-medium">{currentDriver}</span>
            </>
          ) : (
            <span className="ct-pill bg-amber/10 text-amber">Unassigned</span>
          )}
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
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
            className="ct-input sm:max-w-xs"
          >
            <option value="">— Unassigned —</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name ?? "Driver"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={assign}
            disabled={busy || !dirty}
            className="ct-btn-primary sm:ml-auto"
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
