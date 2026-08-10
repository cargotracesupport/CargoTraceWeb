"use client";

import type { Profile, Vehicle } from "@/lib/types";
import { PeopleCard } from "@/components/people";
import { Users } from "@/components/icons";

// Client wrapper so the PeopleCard icon (a component) stays client-side —
// a Server Component can't pass a function/component prop across the boundary.
export default function DriversManager({
  drivers,
  vehicles,
  emails,
}: {
  drivers: Profile[];
  vehicles: Vehicle[];
  emails?: Record<string, string>;
}) {
  return (
    <PeopleCard
      title="Drivers"
      people={drivers}
      emails={emails}
      endpoint="/api/drivers"
      Icon={Users}
      idPrefix="driver"
      namePlaceholder="Juan Santos"
      createLabel="Create driver"
      emptyLabel="No drivers yet. Add one so you can assign deliveries to them."
      deleteConfirm="Delete this driver's account? This can't be undone."
      vehicles={vehicles}
    />
  );
}
