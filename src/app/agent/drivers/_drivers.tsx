"use client";

import type { Profile } from "@/lib/types";
import { PeopleCard } from "@/components/people";
import { Users } from "@/components/icons";

// Client wrapper so the PeopleCard icon (a component) stays client-side —
// a Server Component can't pass a function/component prop across the boundary.
export default function DriversManager({ drivers }: { drivers: Profile[] }) {
  return (
    <div className="max-w-md">
      <PeopleCard
        title="Drivers"
        people={drivers}
        endpoint="/api/drivers"
        Icon={Users}
        idPrefix="driver"
        namePlaceholder="Juan Santos"
        createLabel="Create driver"
        emptyLabel="No drivers yet. Add one so you can assign deliveries to them."
        deleteConfirm="Delete this driver's account? This can't be undone."
      />
    </div>
  );
}
