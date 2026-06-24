"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";
import Spinner from "@/components/Spinner";
import { Plus, Trash, Pencil, Truck } from "@/components/icons";

export type VehicleLite = {
  id: string;
  plate: string | null;
  name: string | null;
};

const vehLabel = (v: VehicleLite) => v.plate ?? v.name ?? "Vehicle";

/**
 * Create / list / delete card for people accounts (drivers, agents). Both are
 * provisioned the same way (POST/DELETE { fullName, email, password, phone? }),
 * so they share this card — only the endpoint + labels differ. When `vehicles`
 * is passed (drivers), a vehicle picker is shown so the person can be given a
 * current vehicle that auto-fills at dispatch.
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
  vehicles,
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
  vehicles?: VehicleLite[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleId, setVehicleId] = useState("");

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
          ...(vehicles ? { vehicleId: vehicleId || undefined } : {}),
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
      setVehicleId("");
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
          {vehicles ? (
            <div>
              <label className="ct-label" htmlFor={`${idPrefix}_vehicle`}>
                Vehicle (optional)
              </label>
              <select
                id={`${idPrefix}_vehicle`}
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="ct-input"
              >
                <option value="">No vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehLabel(v)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

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
            <PersonRow
              key={p.id}
              person={p}
              endpoint={endpoint}
              noun={noun}
              deleteConfirm={deleteConfirm}
              vehicles={vehicles}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonRow({
  person,
  endpoint,
  noun,
  deleteConfirm,
  vehicles,
}: {
  person: Profile;
  endpoint: string;
  noun: string;
  deleteConfirm: string;
  vehicles?: VehicleLite[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(person.full_name ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [vehicleId, setVehicleId] = useState(person.vehicle_id ?? "");

  const currentVehicle = vehicles?.find((v) => v.id === person.vehicle_id);

  function reset() {
    setFullName(person.full_name ?? "");
    setPhone(person.phone ?? "");
    setVehicleId(person.vehicle_id ?? "");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: person.id,
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          ...(vehicles ? { vehicleId } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(j?.error ?? `Failed (${res.status})`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save ${noun}.`);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={save} className="flex flex-col gap-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="Full name"
            className="ct-input"
            aria-label="Full name"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="ct-input"
            aria-label="Phone"
          />
          {vehicles ? (
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="ct-input"
              aria-label="Vehicle"
            >
              <option value="">No vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {vehLabel(v)}
                </option>
              ))}
            </select>
          ) : null}
          {error ? <FormError message={error} /> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="ct-btn-primary px-3 py-1.5 text-xs"
            >
              {busy ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                reset();
              }}
              className="ct-btn-ghost px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">
          {person.full_name ?? `Unnamed ${noun}`}
        </p>
        {person.phone ? (
          <p className="font-mono text-xs text-muted2">{person.phone}</p>
        ) : (
          <p className="text-xs text-muted">No phone</p>
        )}
        {currentVehicle ? (
          <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-muted2">
            <Truck className="h-3.5 w-3.5" /> {vehLabel(currentVehicle)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            reset();
            setEditing(true);
          }}
          title={`Edit ${noun}`}
          className="ct-btn-ghost px-2 py-1 text-xs"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <DeletePersonButton
          endpoint={endpoint}
          id={person.id}
          confirmText={deleteConfirm}
        />
      </div>
    </li>
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
