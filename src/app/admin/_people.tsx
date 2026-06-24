"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";
import Spinner from "@/components/Spinner";
import { Plus, Trash } from "@/components/icons";

/**
 * Create / list / delete card for people accounts (drivers, agents). Both are
 * provisioned the same way (POST/DELETE { fullName, email, password, phone? }),
 * so they share this card — only the endpoint + labels differ.
 */
export function PeopleCard({
  title,
  people,
  endpoint,
  Icon,
  idPrefix,
  namePlaceholder,
  createLabel,
  emptyLabel,
  deleteConfirm,
}: {
  title: string;
  people: Profile[];
  endpoint: string;
  Icon: React.ComponentType<{ className?: string }>;
  idPrefix: string;
  namePlaceholder: string;
  createLabel: string;
  emptyLabel: string;
  deleteConfirm: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  const noun = title.toLowerCase().replace(/s$/, "");

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setFullName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not add ${noun}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ct-card flex flex-col">
      <CardHeader
        title={title}
        Icon={Icon}
        count={people.length}
        open={open}
        onToggle={() => {
          setOpen((v) => !v);
          setError(null);
        }}
      />

      {open ? (
        <form
          onSubmit={addPerson}
          className="flex flex-col gap-3 border-b border-border p-4"
        >
          <div>
            <label className="ct-label" htmlFor={`${idPrefix}_name`}>
              Full name
            </label>
            <input
              id={`${idPrefix}_name`}
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={namePlaceholder}
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor={`${idPrefix}_email`}>
              Email
            </label>
            <input
              id={`${idPrefix}_email`}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor={`${idPrefix}_password`}>
              Temporary password
            </label>
            <input
              id={`${idPrefix}_password`}
              type="text"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="ct-input font-mono"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor={`${idPrefix}_phone`}>
              Phone (optional)
            </label>
            <input
              id={`${idPrefix}_phone`}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63…"
              className="ct-input"
            />
          </div>

          {error ? <FormError message={error} /> : null}

          <button type="submit" disabled={busy} className="ct-btn-primary">
            {busy ? (
              <>
                <Spinner /> Adding…
              </>
            ) : (
              createLabel
            )}
          </button>
        </form>
      ) : null}

      {people.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <ul className="divide-y divide-border">
          {people.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">
                  {p.full_name ?? `Unnamed ${noun}`}
                </p>
                {p.phone ? (
                  <p className="font-mono text-xs text-muted2">{p.phone}</p>
                ) : (
                  <p className="text-xs text-muted">No phone</p>
                )}
              </div>
              <DeletePersonButton
                endpoint={endpoint}
                id={p.id}
                confirmText={deleteConfirm}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeletePersonButton({
  endpoint,
  id,
  confirmText,
}: {
  endpoint: string;
  id: string;
  confirmText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(j?.error ?? `Failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Delete"
      className="ct-btn-ghost px-2 py-1 text-xs hover:border-red hover:text-red disabled:opacity-50"
    >
      {busy ? (
        <Spinner />
      ) : (
        <>
          <Trash className="h-3.5 w-3.5" />
          Delete
        </>
      )}
    </button>
  );
}

/* ── Shared presentational bits (also used by the Fleet vehicle/device cards) ── */

export function CardHeader({
  title,
  count,
  open,
  onToggle,
  Icon,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted2" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ct-pill bg-s3 text-muted2">{count}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="ct-btn-ghost px-3 py-1.5 text-xs"
      >
        {open ? (
          "Close"
        ) : (
          <>
            <Plus className="h-3.5 w-3.5" /> Add
          </>
        )}
      </button>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted2">
      {label}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
      {message}
    </p>
  );
}
