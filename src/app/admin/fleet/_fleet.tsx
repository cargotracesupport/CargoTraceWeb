"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Vehicle, Device } from "@/lib/types";

export default function Fleet({
  orgId,
  drivers,
  vehicles,
  devices,
}: {
  orgId: string;
  drivers: Profile[];
  vehicles: Vehicle[];
  devices: Device[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <DriversCard drivers={drivers} />
      <VehiclesCard orgId={orgId} vehicles={vehicles} />
      <DevicesCard orgId={orgId} devices={devices} vehicles={vehicles} />
    </div>
  );
}

/* ── Drivers ──────────────────────────────────────────────────────────── */

function DriversCard({ drivers }: { drivers: Profile[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  async function addDriver(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/drivers", {
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
      setError(err instanceof Error ? err.message : "Could not add driver.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ct-card flex flex-col">
      <CardHeader
        title="Drivers"
        count={drivers.length}
        open={open}
        onToggle={() => {
          setOpen((v) => !v);
          setError(null);
        }}
      />

      {open ? (
        <form
          onSubmit={addDriver}
          className="flex flex-col gap-3 border-b border-border p-4"
        >
          <div>
            <label className="ct-label" htmlFor="driver_name">
              Full name
            </label>
            <input
              id="driver_name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Santos"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="driver_email">
              Email
            </label>
            <input
              id="driver_email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="driver@example.com"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="driver_password">
              Temporary password
            </label>
            <input
              id="driver_password"
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
            <label className="ct-label" htmlFor="driver_phone">
              Phone (optional)
            </label>
            <input
              id="driver_phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63…"
              className="ct-input"
            />
          </div>

          {error ? <FormError message={error} /> : null}

          <button type="submit" disabled={busy} className="ct-btn-primary">
            {busy ? "Adding…" : "Create driver"}
          </button>
        </form>
      ) : null}

      {drivers.length === 0 ? (
        <EmptyState label="No drivers yet. Add one to start assigning deliveries." />
      ) : (
        <ul className="divide-y divide-border">
          {drivers.map((d) => (
            <li key={d.id} className="px-4 py-3">
              <p className="text-sm font-medium text-text">
                {d.full_name ?? "Unnamed driver"}
              </p>
              {d.phone ? (
                <p className="font-mono text-xs text-muted2">{d.phone}</p>
              ) : (
                <p className="text-xs text-muted">No phone</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Vehicles ─────────────────────────────────────────────────────────── */

function VehiclesCard({
  orgId,
  vehicles,
}: {
  orgId: string;
  vehicles: Vehicle[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("vehicles").insert({
      org_id: orgId,
      name: name.trim(),
      plate: plate.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setName("");
    setPlate("");
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="ct-card flex flex-col">
      <CardHeader
        title="Vehicles"
        count={vehicles.length}
        open={open}
        onToggle={() => {
          setOpen((v) => !v);
          setError(null);
        }}
      />

      {open ? (
        <form
          onSubmit={addVehicle}
          className="flex flex-col gap-3 border-b border-border p-4"
        >
          <div>
            <label className="ct-label" htmlFor="vehicle_name">
              Name
            </label>
            <input
              id="vehicle_name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Truck 04"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="vehicle_plate">
              Plate (optional)
            </label>
            <input
              id="vehicle_plate"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="ABC 1234"
              className="ct-input font-mono"
            />
          </div>

          {error ? <FormError message={error} /> : null}

          <button type="submit" disabled={busy} className="ct-btn-primary">
            {busy ? "Adding…" : "Add vehicle"}
          </button>
        </form>
      ) : null}

      {vehicles.length === 0 ? (
        <EmptyState label="No vehicles yet." />
      ) : (
        <ul className="divide-y divide-border">
          {vehicles.map((v) => (
            <li key={v.id} className="px-4 py-3">
              <p className="text-sm font-medium text-text">{v.name}</p>
              {v.plate ? (
                <p className="font-mono text-xs text-muted2">{v.plate}</p>
              ) : (
                <p className="text-xs text-muted">No plate</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Devices ──────────────────────────────────────────────────────────── */

function DevicesCard({
  orgId,
  devices,
  vehicles,
}: {
  orgId: string;
  devices: Device[];
  vehicles: Vehicle[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hardwareId, setHardwareId] = useState("");
  const [label, setLabel] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const vehicleName = (id: string | null): string | null => {
    if (!id) return null;
    return vehicles.find((v) => v.id === id)?.name ?? null;
  };

  async function addDevice(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("devices").insert({
      org_id: orgId,
      hardware_id: hardwareId.trim(),
      label: label.trim() || null,
      vehicle_id: vehicleId || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setHardwareId("");
    setLabel("");
    setVehicleId("");
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="ct-card flex flex-col">
      <CardHeader
        title="Devices"
        count={devices.length}
        open={open}
        onToggle={() => {
          setOpen((v) => !v);
          setError(null);
        }}
      />

      {open ? (
        <form
          onSubmit={addDevice}
          className="flex flex-col gap-3 border-b border-border p-4"
        >
          <div>
            <label className="ct-label" htmlFor="device_hw">
              Hardware ID
            </label>
            <input
              id="device_hw"
              required
              value={hardwareId}
              onChange={(e) => setHardwareId(e.target.value)}
              placeholder="GPS-00042"
              className="ct-input font-mono"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="device_label">
              Label (optional)
            </label>
            <input
              id="device_label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Dashcam GPS"
              className="ct-input"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="device_vehicle">
              Vehicle (optional)
            </label>
            <select
              id="device_vehicle"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="ct-input"
            >
              <option value="">Unassigned</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {error ? <FormError message={error} /> : null}

          <button type="submit" disabled={busy} className="ct-btn-primary">
            {busy ? "Adding…" : "Add device"}
          </button>
        </form>
      ) : null}

      {devices.length === 0 ? (
        <EmptyState label="No GPS devices yet." />
      ) : (
        <ul className="divide-y divide-border">
          {devices.map((dev) => {
            const vn = vehicleName(dev.vehicle_id);
            return (
              <li key={dev.id} className="px-4 py-3">
                <p className="text-sm font-medium text-text">
                  {dev.label ?? "Device"}
                </p>
                <p className="font-mono text-xs text-muted2">
                  {dev.hardware_id}
                </p>
                <p className="text-xs text-muted">
                  {vn ? `On ${vn}` : "Unassigned"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Shared bits ──────────────────────────────────────────────────────── */

function CardHeader({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ct-pill bg-s3 text-muted2">{count}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="ct-btn-ghost px-3 py-1.5 text-xs"
      >
        {open ? "Close" : "+ Add"}
      </button>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted2">
      {label}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
      {message}
    </p>
  );
}
