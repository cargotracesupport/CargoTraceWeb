"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Vehicle, Device } from "@/lib/types";
import Spinner from "@/components/Spinner";
import DeleteButton from "@/components/DeleteButton";
import { Truck, Package, Users, Pencil } from "@/components/icons";
import { PeopleCard, CardHeader, EmptyState, FormError } from "@/components/people";

type AgentOpt = { id: string; full_name: string | null };

export default function Fleet({
  orgId,
  drivers,
  vehicles,
  devices,
  agents,
  emails,
}: {
  orgId: string;
  drivers: Profile[];
  vehicles: Vehicle[];
  devices: Device[];
  agents: AgentOpt[];
  emails?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <PeopleCard
        title="Drivers"
        people={drivers}
        emails={emails}
        endpoint="/api/drivers"
        Icon={Users}
        idPrefix="driver"
        namePlaceholder="Juan Santos"
        createLabel="Create driver"
        emptyLabel="No drivers yet. Add one to start assigning deliveries."
        deleteConfirm="Delete this driver's account? This can't be undone."
        vehicles={vehicles}
        agents={agents}
      />
      <VehiclesCard orgId={orgId} vehicles={vehicles} agents={agents} />
      <DevicesCard orgId={orgId} devices={devices} vehicles={vehicles} />
    </div>
  );
}

const ownerName = (agents: AgentOpt[], id: string | null) =>
  id ? (agents.find((a) => a.id === id)?.full_name ?? "Agent") : null;

/* ── Vehicles ─────────────────────────────────────────────────────────── */

function VehiclesCard({
  orgId,
  vehicles,
  agents,
}: {
  orgId: string;
  vehicles: Vehicle[];
  agents: AgentOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [ownerAgentId, setOwnerAgentId] = useState("");

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("vehicles").insert({
      org_id: orgId,
      name: name.trim(),
      plate: plate.trim() || null,
      agent_id: ownerAgentId || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setName("");
    setPlate("");
    setOwnerAgentId("");
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
          <div>
            <label className="ct-label" htmlFor="vehicle_owner">
              Owner agent (optional)
            </label>
            <select
              id="vehicle_owner"
              value={ownerAgentId}
              onChange={(e) => setOwnerAgentId(e.target.value)}
              className="ct-input"
            >
              <option value="">— None (admin only) —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name ?? "Agent"}
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
            <AdminVehicleRow key={v.id} vehicle={v} agents={agents} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Admin vehicle row: edit name, plate and the owning agent in place. */
function AdminVehicleRow({
  vehicle,
  agents,
}: {
  vehicle: Vehicle;
  agents: AgentOpt[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(vehicle.name ?? "");
  const [plate, setPlate] = useState(vehicle.plate ?? "");
  const [ownerAgentId, setOwnerAgentId] = useState(vehicle.agent_id ?? "");

  function reset() {
    setName(vehicle.name ?? "");
    setPlate(vehicle.plate ?? "");
    setOwnerAgentId(vehicle.agent_id ?? "");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("vehicles")
      .update({
        name: name.trim() || plate.trim(),
        plate: plate.trim() || null,
        agent_id: ownerAgentId || null,
      })
      .eq("id", vehicle.id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={save} className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Name"
            className="ct-input"
            aria-label="Vehicle name"
          />
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Plate (optional)"
            className="ct-input font-mono"
            aria-label="Plate"
          />
          <label className="ct-label" htmlFor={`veh-owner-${vehicle.id}`}>
            Owner agent
          </label>
          <select
            id={`veh-owner-${vehicle.id}`}
            value={ownerAgentId}
            onChange={(e) => setOwnerAgentId(e.target.value)}
            className="ct-input"
            aria-label="Owner agent"
          >
            <option value="">— None (admin only) —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name ?? "Agent"}
              </option>
            ))}
          </select>
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
        <p className="text-sm font-medium text-text">{vehicle.name}</p>
        {vehicle.plate ? (
          <p className="font-mono text-xs text-muted2">{vehicle.plate}</p>
        ) : (
          <p className="text-xs text-muted">No plate</p>
        )}
        <p className="text-[11px] text-muted">
          {ownerName(agents, vehicle.agent_id)
            ? `Agent: ${ownerName(agents, vehicle.agent_id)}`
            : "Unassigned"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            reset();
            setEditing(true);
          }}
          title="Edit vehicle"
          className="ct-btn-ghost px-2 py-1 text-xs"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <DeleteButton
          table="vehicles"
          id={vehicle.id}
          confirmText="Delete this vehicle?"
        />
      </div>
    </li>
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
