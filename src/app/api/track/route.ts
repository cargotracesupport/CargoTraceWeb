import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// How far the client-supplied recordedAt may stray from the server clock before
// we distrust it and stamp server-side instead (guards against back/forward-dating).
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * GPS ingest endpoint — AUTHENTICATED. The driver app shares the phone's GPS
 * from the (logged-in) driver delivery screen. We require a session and verify
 * the caller is allowed to post for this delivery: the assigned driver, an admin
 * in the delivery's org, or the agent who owns it (the admin "Simulate" tool).
 *
 * POST { deliveryId, lat, lng, speed?, heading?, recordedAt? }
 *
 * NOTE: dedicated GPS hardware (no session cookie) is not in use yet. When it
 * is added, give it a separate path authenticated by a per-device shared secret
 * — do NOT re-open this endpoint to unauthenticated callers.
 */
export async function POST(req: Request) {
  // Must be signed in. Without this, anyone who learns a delivery UUID could
  // spoof its truck position and force status transitions.
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json({ error: "valid lat/lng required" }, { status: 400 });
  }

  // speed/heading are optional; reject non-finite values rather than writing NaN.
  let speed: number | null = null;
  if (body.speed != null) {
    const s = Number(body.speed);
    if (!Number.isFinite(s) || s < 0) {
      return NextResponse.json({ error: "invalid speed" }, { status: 400 });
    }
    speed = s;
  }
  let heading: number | null = null;
  if (body.heading != null) {
    const h = Number(body.heading);
    if (!Number.isFinite(h)) {
      return NextResponse.json({ error: "invalid heading" }, { status: 400 });
    }
    heading = h;
  }

  // Trust the client timestamp only if it's near the server clock; otherwise
  // stamp server-side. Prevents back/forward-dating the position history.
  const now = Date.now();
  let recordedAt = new Date(now).toISOString();
  if (typeof body.recordedAt === "string") {
    const t = Date.parse(body.recordedAt);
    if (Number.isFinite(t) && Math.abs(now - t) <= MAX_CLOCK_SKEW_MS) {
      recordedAt = new Date(t).toISOString();
    }
  }

  const deliveryId =
    typeof body.deliveryId === "string" ? body.deliveryId : "";
  if (!deliveryId) {
    return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("id, org_id, device_id, driver_id, agent_id")
    .eq("id", deliveryId)
    .maybeSingle();

  if (!delivery) {
    return NextResponse.json({ error: "unknown delivery" }, { status: 404 });
  }

  // Authorization: the assigned driver, an admin in the same org, or the owning
  // agent. Anyone else (incl. an agent for another agent's delivery) is rejected.
  const role = session.profile.role;
  const allowed =
    delivery.driver_id === session.userId ||
    (role === "admin" && delivery.org_id === session.profile.org_id) ||
    (role === "agent" && delivery.agent_id === session.userId);
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

  // Update denormalized last-known position.
  await supabase
    .from("deliveries")
    .update({
      last_lat: lat,
      last_lng: lng,
      last_speed: speed,
      last_position_at: recordedAt,
    })
    .eq("id", delivery.id);

  // First GPS ping takes a delivery live (assigned -> en_route). Stays scoped to
  // this delivery, which we've already confirmed the caller owns.
  await supabase
    .from("deliveries")
    .update({ status: "en_route", started_at: recordedAt })
    .eq("id", delivery.id)
    .in("status", ["pending", "assigned"]);

  // Multi-stop trip: one GPS ping moves the truck for ALL of this driver's other
  // in-progress stops too, so every grouped customer sees the driver moving.
  if (delivery.driver_id) {
    await supabase
      .from("deliveries")
      .update({
        last_lat: lat,
        last_lng: lng,
        last_speed: speed,
        last_position_at: recordedAt,
      })
      .eq("driver_id", delivery.driver_id)
      .eq("status", "en_route")
      .neq("id", delivery.id);
  }

  return NextResponse.json({ ok: true, delivery: delivery.id });
}
