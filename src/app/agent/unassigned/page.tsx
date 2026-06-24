import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import AssignConsole, {
  type DriverOption,
  type VehicleOption,
} from "../_assign";

export default async function AgentUnassignedPage() {
  await requireRole("agent");
  const supabase = createClient();

  const [deliveriesRes, driversRes, vehiclesRes] = await Promise.all([
    supabase
      .from("deliveries")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "driver")
      .order("full_name", { ascending: true }),
    supabase
      .from("vehicles")
      .select("id, plate, name")
      .order("plate", { ascending: true }),
  ]);

  const deliveries = (deliveriesRes.data ?? []) as Delivery[];
  const drivers = (driversRes.data ?? []) as DriverOption[];
  const vehicles = (vehiclesRes.data ?? []) as VehicleOption[];

  return (
    <AssignConsole
      initialDeliveries={deliveries}
      drivers={drivers}
      vehicles={vehicles}
      mode="unassigned"
    />
  );
}
