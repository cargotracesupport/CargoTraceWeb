"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Trash, Package, Truck, Contact, MapPin, Check } from "@/components/icons";

/** One trashed row, as returned by the admin_trash() RPC. */
type TrashItem = {
  kind: "delivery" | "vehicle" | "device" | "customer" | "address";
  id: string;
  title: string | null;
  subtitle: string | null;
  deleted_at: string;
};

const RETENTION_DAYS = 90;

// kind -> table name + label + icon. The table drives restore/purge.
const KIND: Record<
  TrashItem["kind"],
  { table: string; label: string; Icon: (p: { className?: string }) => JSX.Element }
> = {
  delivery: { table: "deliveries", label: "Delivery", Icon: Package },
  vehicle: { table: "vehicles", label: "Vehicle", Icon: Truck },
  device: { table: "devices", label: "Device", Icon: MapPin },
  customer: { table: "customers", label: "Customer", Icon: Contact },
  address: { table: "customer_addresses", label: "Address", Icon: MapPin },
};

function daysLeft(deletedAt: string): number {
  const purge = new Date(deletedAt).getTime() + RETENTION_DAYS * 86400_000;
  return Math.max(0, Math.ceil((purge - Date.now()) / 86400_000));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TrashConsole() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("admin_trash");
    if (err) {
      setError(err.message);
      setItems([]);
      return;
    }
    setItems((data ?? []) as TrashItem[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function restore(it: TrashItem) {
    setBusyId(it.id);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from(KIND[it.kind].table)
      .update({ deleted_at: null })
      .eq("id", it.id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setItems((prev) => (prev ?? []).filter((x) => x.id !== it.id));
  }

  async function purge(it: TrashItem) {
    setBusyId(it.id);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from(KIND[it.kind].table)
      .delete()
      .eq("id", it.id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setPurgeTarget(null);
    setItems((prev) => (prev ?? []).filter((x) => x.id !== it.id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Trash</h1>
        <p className="text-sm text-muted2">
          Deleted items stay here for {RETENTION_DAYS} days, then are removed
          permanently. Restore anything you still need.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <div className="ct-card flex items-center justify-center gap-2 py-16 text-sm text-muted2">
          <Spinner /> Loading trash…
        </div>
      ) : items.length === 0 ? (
        <div className="ct-card flex flex-col items-center gap-2 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-s3 text-muted2">
            <Trash className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium">Trash is empty</p>
          <p className="text-xs text-muted2">
            Deleted deliveries, vehicles, devices, customers and addresses show
            up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const meta = KIND[it.kind];
            const Icon = meta.Icon;
            const left = daysLeft(it.deleted_at);
            const busy = busyId === it.id;
            return (
              <li key={`${it.kind}:${it.id}`} className="ct-card flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ct-pill bg-s3 text-muted2">{meta.label}</span>
                    <span className="truncate text-sm font-medium text-text">
                      {it.title ?? "—"}
                    </span>
                  </div>
                  {it.subtitle ? (
                    <p className="mt-0.5 truncate text-xs text-muted2">
                      {it.subtitle}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-muted">
                    Deleted {fmtDate(it.deleted_at)} ·{" "}
                    {left > 0
                      ? `removed in ${left} day${left === 1 ? "" : "s"}`
                      : "removed soon"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => restore(it)}
                    disabled={busy}
                    className="ct-btn-ghost px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {busy ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurgeTarget(it)}
                    disabled={busy}
                    className="ct-btn-ghost px-2 py-1 text-xs text-red hover:border-red hover:text-red disabled:opacity-50"
                  >
                    <Trash className="h-3.5 w-3.5" />
                    Delete forever
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={purgeTarget !== null}
        title="Delete forever?"
        message={
          <>
            {`"${purgeTarget?.title ?? "This item"}" will be permanently removed. This cannot be undone.`}
          </>
        }
        confirmLabel="Delete forever"
        danger
        busy={busyId !== null && busyId === purgeTarget?.id}
        icon={<Trash className="h-4 w-4" />}
        onConfirm={() => purgeTarget && purge(purgeTarget)}
        onCancel={() => setPurgeTarget(null)}
      />
    </div>
  );
}
