import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Public delivery lookup by tracking token (no auth).
 * Returns only the fields a receiver needs — never the whole fleet.
 * Used by the customer tracking page to poll live position + status + ETA inputs.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("deliveries")
    .select(
      "reference, goods, status, origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, customer_name, last_lat, last_lng, last_speed, last_position_at, delivered_at",
    )
    .eq("tracking_token", params.token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ delivery: data });
}
