"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import type { Customer, CustomerAddress } from "@/lib/types";
import LocationPicker, { type LatLng } from "@/components/LocationPicker";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Plus, Pencil, Trash, MapPin } from "@/components/icons";

/**
 * Manage the saved drop-off addresses for one customer. Opens as a modal from
 * the Customers page. Adds/edits use the shared LocationPicker; nickname is an
 * optional label on top of the auto address text.
 */
export default function CustomerAddressesEditor({
  customer,
  orgId,
  onClose,
  onCountChange,
}: {
  customer: Customer;
  orgId: string;
  onClose: () => void;
  onCountChange?: (n: number) => void;
}) {
  const [items, setItems] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add / edit draft.
  const [draft, setDraft] = useState<Partial<CustomerAddress> | null>(null);
  const [pt, setPt] = useState<LatLng | null>(null);
  const [label, setLabel] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<CustomerAddress | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  // Load addresses (RLS-scoped).
  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data ?? []) as CustomerAddress[];
        setItems(rows);
        setLoading(false);
        onCountChange?.(rows.length);
      });
    return () => {
      alive = false;
    };
  }, [customer.id, onCountChange]);

  function openAdd() {
    setDraft({});
    setPt(null);
    setLabel("");
    setNickname("");
    setError(null);
  }
  function openEdit(a: CustomerAddress) {
    setDraft(a);
    setPt({ lat: a.lat, lng: a.lng });
    setLabel(a.label ?? "");
    setNickname(a.nickname ?? "");
    setError(null);
  }

  async function save() {
    if (!pt) {
      setError("Pick a location on the map first.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const values = {
      lat: pt.lat,
      lng: pt.lng,
      label: label.trim() || null,
      nickname: nickname.trim() || null,
    };
    if (draft && draft.id) {
      const { data, error: err } = await supabase
        .from("customer_addresses")
        .update(values)
        .eq("id", draft.id)
        .select("*")
        .single();
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      setItems((prev) =>
        prev.map((a) => (a.id === draft.id ? (data as CustomerAddress) : a)),
      );
    } else {
      const { data, error: err } = await supabase
        .from("customer_addresses")
        .insert({ ...values, customer_id: customer.id, org_id: orgId })
        .select("*")
        .single();
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      const next = [data as CustomerAddress, ...items];
      setItems(next);
      onCountChange?.(next.length);
    }
    setDraft(null);
  }

  async function remove(a: CustomerAddress) {
    setDelBusy(true);
    setError(null);
    const supabase = createClient();
    // Soft delete: stamp deleted_at (restorable from the admin Trash for 90 days).
    const { error: err } = await supabase
      .from("customer_addresses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", a.id);
    setDelBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDelTarget(null);
    const next = items.filter((x) => x.id !== a.id);
    setItems(next);
    onCountChange?.(next.length);
  }

  const modal = (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="ct-card w-full max-w-2xl overflow-hidden"
        style={{ boxShadow: "var(--ct-shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">
              Saved addresses &middot; {customer.name ?? customer.phone ?? "Customer"}
            </h3>
            <p className="mt-0.5 text-xs text-muted2">
              Drop-off locations reused across this customer&apos;s deliveries.
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="ct-btn-primary shrink-0"
          >
            <Plus className="h-4 w-4" /> Add address
          </button>
        </div>

        {/* Address list */}
        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted2">Loading&hellip;</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MapPin className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium">No saved addresses yet.</p>
              <p className="text-xs text-muted2">
                Add one here, or one is auto-saved the first time the customer
                sets a drop-off from their tracking link.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text">
                      {a.nickname ||
                        a.label ||
                        `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`}
                    </div>
                    {a.nickname && a.label ? (
                      <div className="mt-0.5 truncate text-xs text-muted2">
                        {a.label}
                      </div>
                    ) : null}
                    <div className="mt-0.5 font-mono text-[11px] text-muted">
                      {a.lat.toFixed(5)}, {a.lng.toFixed(5)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    aria-label="Edit address"
                    className="ct-btn-ghost !px-2 !py-2"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setDelTarget(a);
                    }}
                    aria-label="Delete address"
                    className="ct-btn-ghost !px-2 !py-2 text-red hover:text-red"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error ? (
          <p className="border-t border-border px-5 py-2 text-sm text-red">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="ct-btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  const editorModal = draft ? (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={() => !busy && setDraft(null)}
    >
      <div
        className="ct-card w-full max-w-lg overflow-hidden"
        style={{ boxShadow: "var(--ct-shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">
            {draft.id ? "Edit address" : "Add address"}
          </h3>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div>
            <label className="ct-label" htmlFor="addr_nick">
              Nickname (optional)
            </label>
            <input
              id="addr_nick"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Home, Office, Warehouse"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label">Address</label>
            <LocationPicker
              mode="dest"
              origin={null}
              dest={pt}
              onPick={(_which, p) => {
                setPt({ lat: p.lat, lng: p.lng });
                if (p.label) setLabel(p.label);
              }}
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="addr_label">
              Address label
            </label>
            <input
              id="addr_label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Full address text (auto-filled from map)"
              className="ct-input"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => setDraft(null)}
            className="ct-btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !pt}
            onClick={save}
            className="ct-btn-primary disabled:opacity-60"
          >
            {busy ? (
              <>
                <Spinner /> Saving&hellip;
              </>
            ) : draft.id ? (
              "Save"
            ) : (
              "Add address"
            )}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (!mounted) return null;
  return createPortal(
    <>
      {modal}
      {editorModal}
      <ConfirmDialog
        open={delTarget !== null}
        title="Move to Trash?"
        message={
          error && delTarget ? (
            <span className="text-red">{error}</span>
          ) : (
            `${delTarget?.nickname || delTarget?.label || "This address"} moves to the Trash. Past deliveries keep their location, and an admin can restore it for 90 days.`
          )
        }
        confirmLabel="Delete"
        danger
        busy={delBusy}
        icon={<Trash className="h-4 w-4" />}
        onConfirm={() => delTarget && remove(delTarget)}
        onCancel={() => setDelTarget(null)}
      />
    </>,
    document.body,
  );
}
