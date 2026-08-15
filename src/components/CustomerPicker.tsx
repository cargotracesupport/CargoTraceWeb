"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";
import { Plus } from "@/components/icons";
import Spinner from "@/components/Spinner";

/**
 * Pick an existing customer for a delivery, or add a new one to the master with
 * the "+ New" button. Selecting (or adding) reports the customer up via onPick
 * so the delivery form fills name / phone / email and links customer_id.
 * Choosing the blank option reports null (a one-off customer typed by hand).
 */
export default function CustomerPicker({
  customers,
  value,
  onPick,
  orgId,
  currentUserId,
}: {
  customers: Customer[];
  value: string; // selected customer id ("" = none / one-off)
  onPick: (c: Customer | null) => void;
  orgId: string;
  currentUserId: string;
}) {
  const [list, setList] = useState<Customer[]>(customers);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim() && !phone.trim()) {
      setError("Enter at least a name or a phone number.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("customers")
      .insert({
        name: name.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        org_id: orgId,
        created_by: currentUserId,
      })
      .select("*")
      .single();
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const c = data as Customer;
    setList((prev) => [c, ...prev]);
    onPick(c);
    setOpen(false);
    setName("");
    setPhone("");
    setEmail("");
  }

  return (
    <div>
      <label className="ct-label" htmlFor="customer_select">
        Saved customer
      </label>
      <div className="flex gap-2">
        <select
          id="customer_select"
          value={value}
          onChange={(e) => {
            const c = list.find((x) => x.id === e.target.value) ?? null;
            onPick(c);
          }}
          className="ct-input"
        >
          <option value="">— New / one-off customer —</option>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? "Unnamed"}
              {c.phone ? ` · ${c.phone}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="ct-btn-ghost shrink-0"
          title="Add a new customer to your list"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Pick a saved customer to fill in their details, or add a new one with
        “New”.
      </p>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="ct-card w-full max-w-sm p-5"
            style={{ boxShadow: "var(--ct-shadow-pop)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Add customer</h3>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="ct-label" htmlFor="new_cust_name">
                  Name
                </label>
                <input
                  id="new_cust_name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Dela Cruz"
                  className="ct-input"
                  autoFocus
                />
              </div>
              <div>
                <label className="ct-label" htmlFor="new_cust_phone">
                  Mobile number
                </label>
                <input
                  id="new_cust_phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 90000 00000"
                  className="ct-input"
                />
              </div>
              <div>
                <label className="ct-label" htmlFor="new_cust_email">
                  Email
                </label>
                <input
                  id="new_cust_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="ct-input"
                />
              </div>
            </div>
            {error ? <p className="mt-3 text-sm text-red">{error}</p> : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="ct-btn-ghost flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={add}
                className="ct-btn-primary flex-1 justify-center disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  "Add & select"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
