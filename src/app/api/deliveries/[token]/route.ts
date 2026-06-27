import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Statuses where the customer should be able to see & call the driver. Before a
// trip is live (or after it's done/cancelled) we don't expose the driver's phone.
const DRIVER_VISIBLE: ReadonlySet<string> = new Set(["assigned", "en_route"]);

// Anyone with the link can read this; never let a shared cache/CDN store it
// (it carries customer name, addresses, and — when active — the driver's phone).
const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

type DriverEmbed = { full_name: string | null; phone: string | null } | null;

/**
 * Public delivery lookup by tracking token (no auth).
 * Returns only the fields a receiver needs — never the whole fleet. The driver
 * embed is disambiguated by FK name because deliveries has two FKs into
 * profiles (driver_id + agent_id), and only the driver should be exposed.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("deliveries")
    .select(
      "reference, goods, status, " +
        "origin_label, origin_lat, origin_lng, " +
        "dest_label, dest_lat, dest_lng, " +
        "customer_name, " +
        "last_lat, last_lng, last_speed, last_position_at, delivered_at, " +
        "driver:profiles!deliveries_driver_id_fkey(full_name, phone), " +
        "vehicle:vehicles(plate, name)",
    )
    .eq("tracking_token", params.token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: NO_STORE },
    );
  }

  // Withhold the driver's phone until the delivery is actually out for delivery.
  const delivery = data as unknown as Record<string, unknown> & {
    status: string;
    driver: DriverEmbed;
  };
  if (delivery.driver && !DRIVER_VISIBLE.has(delivery.status)) {
    delivery.driver = { full_name: delivery.driver.full_name, phone: null };
  }

  return NextResponse.json({ delivery }, { headers: NO_STORE });
}
