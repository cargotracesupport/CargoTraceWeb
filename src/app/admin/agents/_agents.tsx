"use client";

import type { Profile } from "@/lib/types";
import { PeopleCard } from "../_people";
import { UserCog } from "@/components/icons";

// Client wrapper so the PeopleCard icon (a component) stays on the client side —
// a Server Component can't pass a function/component prop across the boundary.
export default function AgentsManager({ agents }: { agents: Profile[] }) {
  return (
    <div className="max-w-md">
      <PeopleCard
        title="Agents"
        people={agents}
        endpoint="/api/agents"
        Icon={UserCog}
        idPrefix="agent"
        namePlaceholder="Dispatch coordinator"
        createLabel="Create agent"
        emptyLabel="No agents yet. Agents log in to assign deliveries to your drivers."
        deleteConfirm="Delete this agent's account? This can't be undone."
      />
    </div>
  );
}
