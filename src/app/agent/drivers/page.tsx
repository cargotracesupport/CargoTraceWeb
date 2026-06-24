import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import DriversManager from "./_drivers";

export default async function AgentDriversPage() {
  await requireRole("agent");
  const supabase = createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "driver")
    .order("full_name", { ascending: true });

  const drivers = (data ?? []) as Profile[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Drivers</h1>
        <p className="text-sm text-muted2">
          Add and manage the drivers you assign deliveries to.
        </p>
      </div>

      <DriversManager drivers={drivers} />
    </div>
  );
}
