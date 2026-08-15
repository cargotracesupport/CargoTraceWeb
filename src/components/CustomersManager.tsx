"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";
import { Plus, Pencil, Trash, Search, Phone, Contact } from "@/components/icons";
import Spinner from "@/components/Spinner";

/**
 * Customer master (per-agent address book). Lists the customers this user can
 * see (RLS: agents see their own, admins see all in the org) and lets them
 * add / edit / delete. Writes go through the browser client under RLS.
 */
export default function CustomersManager({
  initial,
  orgId,
  currentUserId,
}: {
  initial: Customer[];
  orgId: string;
  currentUserId: string;
}) {
  const [items, setItems] = useState<Customer[]>(initial);
  const [query, setQuery] = useState("");
  // The record being edited, or a blank draft when adding. null = modal closed.
  const [draft, setDraft] = useState<Partial<Customer> | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.name, c.phone, c.email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [items, query]);

  function openAdd() {
    setDraft({});
    setName("");
    setPhone("");
    setEmail("");
    setError(null);
  }
  function openEdit(c: Customer) {
    setDraft(c);
    setName(c.name ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setError(null);
  }

  async function save() {
    if (!name.trim() && !phone.trim()) {
      setError("Enter at least a name or a phone number.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const values = {
      name: name.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    };
    if (draft && draft.id) {
      const { data, error: err } = await supabase
        .from("customers")
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
        prev.map((c) => (c.id === draft.id ? (data as Customer) : c)),
      );
    } else {
      const { data, error: err } = await supabase
        .from("customers")
        .insert({ ...values, org_id: orgId, created_by: currentUserId })
        .select("*")
        .single();
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      setItems((prev) => [data as Customer, ...prev]);
    }
    setDraft(null);
  }

  async function remove(c: Customer) {
    if (
      !window.confirm(
        `Delete ${c.name ?? c.phone ?? "this customer"}? Their past deliveries are kept.`,
      )
    )
      return;
    const supabase = createClient();
    const { error: err } = await supabase
      .from("customers")
      .delete()
      .eq("id", c.id);
    if (err) {
      setError(err.message);
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== c.id));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone or email…"
            className="ct-input pl-9"
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="ct-btn-primary shrink-0 justify-center"
        >
          <Plus className="h-4 w-4" /> Add customer
        </button>
      </div>

      {/* list */}
      {filtered.length === 0 ? (
        <div className="ct-card flex flex-col items-center gap-2 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Contact className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium">
            {query ? "No customers match your search." : "No customers yet."}
          </p>
          {!query ? (
            <p className="text-xs text-muted2">
              Add customers here, or from the “New delivery” form, so you can pick
              them next time.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="ct-card divide-y divide-border overflow-hidden p-0">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text">
                  {c.name ?? "Unnamed customer"}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted2">
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </span>
                  ) : null}
                  {c.email ? <span className="truncate">{c.email}</span> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openEdit(c)}
                aria-label="Edit customer"
                className="ct-btn-ghost !px-2 !py-2"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(c)}
                aria-label="Delete customer"
                className="ct-btn-ghost !px-2 !py-2 text-red hover:text-red"
              >
                <Trash className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* add / edit modal */}
      {draft ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setDraft(null)}
        >
          <div
            className="ct-card w-full max-w-sm p-5"
            style={{ boxShadow: "var(--ct-shadow-pop)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">
              {draft.id ? "Edit customer" : "Add customer"}
            </h3>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="ct-label" htmlFor="cust_name">
                  Name
                </label>
                <input
                  id="cust_name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Dela Cruz"
                  className="ct-input"
                  autoFocus
                />
              </div>
              <div>
                <label className="ct-label" htmlFor="cust_phone">
                  Mobile number
                </label>
                <input
                  id="cust_phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 90000 00000"
                  className="ct-input"
                />
              </div>
              <div>
                <label className="ct-label" htmlFor="cust_email">
                  Email
                </label>
                <input
                  id="cust_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="ct-input"
                />
              </div>
            </div>
            {error ? (
              <p className="mt-3 text-sm text-red">{error}</p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDraft(null)}
                className="ct-btn-ghost flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="ct-btn-primary flex-1 justify-center disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : draft.id ? (
                  "Save changes"
                ) : (
                  "Add customer"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
