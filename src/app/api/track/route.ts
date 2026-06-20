import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GPS ingest endpoint. ONE entry point for both:
 *   - GPS hardware:  POST { hardwareId, lat, lng, speed?, heading?, recordedAt? }
 *   - Driver phone (interim): POST { deliveryId, lat, lng, speed?, heading?, recordedAt? }
 *
 * Writes a position row and updates the delivery's denormalized last-known position.
 * Uses the service role (bypasses RLS) — this is a trusted server endpoint.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }
  const speed = body.speed != null ? Number(body.speed) : null;
  const heading = body.heading != null ? Number(body.heading) : null;
  const recordedAt =
    typeof body.recordedAt === "string" ? body.recordedAt : new Date().toISOString();

  const supabase = createAdminClient();

  // Resolve which delivery this fix belongs to.
  let delivery:
    | { id: string; org_id: string; device_id: string | null; driver_id: string | null }
    | null = null;

  if (typeof body.hardwareId === "string" && body.hardwareId) {
    // Hardware path: find the device, then its active delivery.
    const { data: device } = await supabase
      .from("devices")
      .select("id, org_id")
      .eq("hardware_id", body.hardwareId)
      .single();
    if (!device) {
      return NextResponse.json({ error: "unknown device" }, { status: 404 });
    }
    const { data: active } = await supabase
      .from("deliveries")
      .select("id, org_id, device_id, driver_id")
      .eq("device_id", device.id)
      .in("status", ["pending", "assigned", "en_route"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Still record the raw position even without an active delivery.
    if (active) delivery = active;
    else {
      await supabase.from("positions").insert({
        org_id: device.org_id,
        device_id: device.id,
        lat,
        lng,
        speed,
        heading,
        recorded_at: recordedAt,
      });
      return NextResponse.json({ ok: true, delivery: null });
    }
  } else if (typeof body.deliveryId === "string" && body.deliveryId) {
    // Driver-phone path.
    const { data } = await supabase
      .from("deliveries")
      .select("id, org_id, device_id, driver_id")
      .eq("id", body.deliveryId)
      .single();
    delivery = data;
    if (!delivery) {
      return NextResponse.json({ error: "unknown delivery" }, { status: 404 });
    }
  } else {
    return NextResponse.json(
      { error: "hardwareId or deliveryId required" },
      { status: 400 },
    );
  }

  await supabase.from("positions").insert({
    org_id: delivery.org_id,
    delivery_id: delivery.id,
    device_id: delivery.device_id,
    driver_id: delivery.driver_id,
    lat,
    lng,
    speed,
    heading,
    recorded_at: recordedAt,
  });

  // Update denormalized last-known position; auto-advance assigned -> en_route on first ping.
  await supabase
    .from("deliveries")
    .update({
      last_lat: lat,
      last_lng: lng,
      last_speed: speed,
      last_position_at: recordedAt,
    })
    .eq("id", delivery.id);

  // First GPS ping takes a delivery live, whether or not a driver was assigned.
  await supabase
    .from("deliveries")
    .update({ status: "en_route", started_at: recordedAt })
    .eq("id", delivery.id)
    .in("status", ["pending", "assigned"]);

  return NextResponse.json({ ok: true, delivery: delivery.id });
}
