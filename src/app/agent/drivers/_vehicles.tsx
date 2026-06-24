"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Vehicle } from "@/lib/types";
import Spinner from "@/components/Spinner";
import DeleteButton from "@/components/DeleteButton";
import { Truck } from "@/components/icons";
import { CardHeader, EmptyState, FormError } from "@/components/people";

export default function VehiclesManager({
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

  const [number, setNumber] = useState("");
  const [model, setModel] = useState("");

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
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNumber("");
    setModel("");
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
            <li
              key={v.id}
              className="flex items-start justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium text-text">
                  {v.plate ?? v.name}
                </p>
                {v.plate && v.name && v.name !== v.plate ? (
                  <p className="text-xs text-muted2">{v.name}</p>
                ) : null}
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
