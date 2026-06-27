import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ delivery: data });
}
