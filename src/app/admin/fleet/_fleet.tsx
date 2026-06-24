"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Vehicle, Device } from "@/lib/types";
import Spinner from "@/components/Spinner";
import DeleteButton from "@/components/DeleteButton";
import { Truck, Package, Users } from "@/components/icons";
import { PeopleCard, CardHeader, EmptyState, FormError } from "@/components/people";

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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <PeopleCard
        title="Drivers"
        people={drivers}
        endpoint="/api/drivers"
        Icon={Users}
        idPrefix="driver"
        namePlaceholder="Juan Santos"
        createLabel="Create driver"
        emptyLabel="No drivers yet. Add one to start assigning deliveries."
        deleteConfirm="Delete this driver's account? This can't be undone."
      />
      <VehiclesCard orgId={orgId} vehicles={vehicles} />
      <DevicesCard orgId={orgId} devices={devices} vehicles={vehicles} />
    </div>
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
        Icon={Truck}
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
            {busy ? (
              <>
                <Spinner /> Adding…
              </>
            ) : (
              "Add vehicle"
            )}
          </button>
        </form>
      ) : null}

      {vehicles.length === 0 ? (
        <EmptyState label="No vehicles yet." />
      ) : (
        <ul className="divide-y divide-border">
          {vehicles.map((v) => (
            <li
              key={v.id}
              className="flex items-start justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">{v.name}</p>
                {v.plate ? (
                  <p className="font-mono text-xs text-muted2">{v.plate}</p>
                ) : (
                  <p className="text-xs text-muted">No plate</p>
                )}
              </div>
              <DeleteButton
                table="vehicles"
                id={v.id}
                confirmText="Delete this vehicle?"
              />
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
        Icon={Package}
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
            {busy ? (
              <>
                <Spinner /> Adding…
              </>
            ) : (
              "Add device"
            )}
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
              <li
                key={dev.id}
                className="flex items-start justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {dev.label ?? "Device"}
                  </p>
                  <p className="font-mono text-xs text-muted2">
                    {dev.hardware_id}
                  </p>
                  <p className="text-xs text-muted">
                    {vn ? `On ${vn}` : "Unassigned"}
                  </p>
                </div>
                <DeleteButton
                  table="devices"
                  id={dev.id}
                  confirmText="Delete this device?"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
