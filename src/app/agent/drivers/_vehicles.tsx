"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Vehicle } from "@/lib/types";
import Spinner from "@/components/Spinner";
import DeleteButton from "@/components/DeleteButton";
import { Truck, Pencil } from "@/components/icons";
import { CardHeader, EmptyState, FormError } from "@/components/people";
import VehicleDimensionFields from "@/components/VehicleDimensionFields";
import { formatVehicleSpecs } from "@/lib/vehicle";

export default function VehiclesManager({
  orgId,
  agentId,
  vehicles,
}: {
  orgId: string;
  agentId: string;
  vehicles: Vehicle[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [number, setNumber] = useState("");
  const [model, setModel] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [widthM, setWidthM] = useState("");
  const [capacityKg, setCapacityKg] = useState("");

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const plate = number.trim();
    const supabase = createClient();
    const { error: err } = await supabase.from("vehicles").insert({
      org_id: orgId,
      plate,
      name: model.trim() || plate, // name is NOT NULL — default to the number
      agent_id: agentId, // the agent owns vehicles they create (RLS requires it)
      length_m: lengthM ? Number(lengthM) : null,
      width_m: widthM ? Number(widthM) : null,
      capacity_kg: capacityKg ? Number(capacityKg) : null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNumber("");
    setModel("");
    setLengthM("");
    setWidthM("");
    setCapacityKg("");
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
            <label className="ct-label" htmlFor="veh_number">
              Vehicle number *
            </label>
            <input
              id="veh_number"
              required
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="MH 12 AB 1234"
              className="ct-input font-mono uppercase"
            />
          </div>
          <div>
            <label className="ct-label" htmlFor="veh_model">
              Make / model (optional)
            </label>
            <input
              id="veh_model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Tata 407"
              className="ct-input"
            />
          </div>
          <VehicleDimensionFields
            length={lengthM}
            width={widthM}
            capacity={capacityKg}
            onLength={setLengthM}
            onWidth={setWidthM}
            onCapacity={setCapacityKg}
          />

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
        <EmptyState label="No vehicles yet. Add a vehicle number to assign at dispatch." />
      ) : (
        <ul className="divide-y divide-border">
          {vehicles.map((v) => (
            <VehicleRow key={v.id} vehicle={v} />
          ))}
        </ul>
      )}
    </section>
  );
}

function VehicleRow({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState(vehicle.plate ?? "");
  const [model, setModel] = useState(vehicle.name ?? "");
  const [lengthM, setLengthM] = useState(vehicle.length_m?.toString() ?? "");
  const [widthM, setWidthM] = useState(vehicle.width_m?.toString() ?? "");
  const [capacityKg, setCapacityKg] = useState(
    vehicle.capacity_kg?.toString() ?? "",
  );

  function reset() {
    setNumber(vehicle.plate ?? "");
    setModel(vehicle.name ?? "");
    setLengthM(vehicle.length_m?.toString() ?? "");
    setWidthM(vehicle.width_m?.toString() ?? "");
    setCapacityKg(vehicle.capacity_kg?.toString() ?? "");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const plate = number.trim();
    const supabase = createClient();
    const { error: err } = await supabase
      .from("vehicles")
      .update({
        plate,
        name: model.trim() || plate,
        length_m: lengthM ? Number(lengthM) : null,
        width_m: widthM ? Number(widthM) : null,
        capacity_kg: capacityKg ? Number(capacityKg) : null,
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
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
            placeholder="Vehicle number"
            className="ct-input font-mono uppercase"
            aria-label="Vehicle number"
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Make / model (optional)"
            className="ct-input"
            aria-label="Make or model"
          />
          <VehicleDimensionFields
            length={lengthM}
            width={widthM}
            capacity={capacityKg}
            onLength={setLengthM}
            onWidth={setWidthM}
            onCapacity={setCapacityKg}
          />
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
        <p className="font-mono text-sm font-medium text-text">
          {vehicle.plate ?? vehicle.name}
        </p>
        {vehicle.plate && vehicle.name && vehicle.name !== vehicle.plate ? (
          <p className="text-xs text-muted2">{vehicle.name}</p>
        ) : null}
        {formatVehicleSpecs(vehicle) ? (
          <p className="mt-0.5 text-[11px] font-medium text-primary">
            {formatVehicleSpecs(vehicle)}
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
