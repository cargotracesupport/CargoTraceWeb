import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Compare by the trailing digits so "+91 90000 00000" == "9000000000".
const normPhone = (s: string) => (s ?? "").replace(/\D/g, "").slice(-10);

// Throttle phone-match attempts per token (DB-backed, so it works across
// serverless instances). 10 tries/minute is plenty for a real human.
const RL_LIMIT = 10;
const RL_WINDOW_S = 60;
const MAX_LABEL_LEN = 200;

/**
 * Customer drop-off endpoint (no login — the link token + matching mobile number
 * are the credentials). Without coordinates it just verifies the number (login);
 * with coordinates it records the drop-off and moves the delivery out of
 * 'awaiting_dropoff'. Agents/admins never set the drop-off — only this path does.
 * POST { phone, lat?, lng?, label? }
 */
export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const phone = String(body.phone ?? "").trim();
  if (normPhone(phone).length < 6) {
    return NextResponse.json(
      { error: "Enter a valid mobile number." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Rate-limit per tracking token (durable, cross-instance) to blunt brute-force.
  const { data: allowed } = await supabase.rpc("rate_limit_hit", {
    p_key: `dropoff:${params.token}`,
    p_limit: RL_LIMIT,
    p_window_seconds: RL_WINDOW_S,
  });
  if (allowed === false) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(RL_WINDOW_S) } },
    );
  }

  const { data: d } = await supabase
    .from("deliveries")
    .select(
      "id, status, reference, goods, origin_label, customer_name, customer_phone, dest_lat, driver_id",
    )
    .eq("tracking_token", params.token)
    .maybeSingle();

  if (!d) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!d.customer_phone || normPhone(d.customer_phone) !== normPhone(phone)) {
    return NextResponse.json(
      { error: "That number doesn't match this delivery." },
      { status: 403 },
    );
  }

  const hasCoords = body.lat != null && body.lng != null;

  // Verify-only (login step).
  if (!hasCoords) {
    return NextResponse.json({
      ok: true,
      verified: true,
      reference: d.reference,
      goods: d.goods,
      customer_name: d.customer_name,
      origin_label: d.origin_label,
      dropoff_set: d.dest_lat != null,
    });
  }

  // Set the drop-off.
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const label = body.label
    ? String(body.label).trim().slice(0, MAX_LABEL_LEN)
    : null;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json({ error: "invalid location" }, { status: 400 });
  }

  // Now that the customer has set the drop-off, leave the waiting state.
  const newStatus =
    d.status === "awaiting_dropoff"
      ? d.driver_id
        ? "assigned"
        : "pending"
      : d.status;

  // Only set the drop-off while the delivery is still waiting for it — this
  // avoids clobbering a trip that already started (the freeze trigger would
  // reject it) and makes the write idempotent.
  const { data: updated, error: upErr } = await supabase
    .from("deliveries")
    .update({
      dest_lat: lat,
      dest_lng: lng,
      dest_label: label,
      status: newStatus,
    })
    .eq("id", d.id)
    .in("status", ["awaiting_dropoff", "pending", "assigned"])
    .select("id, dest_lat, dest_lng")
    .maybeSingle();

  if (upErr) {
    console.error("dropoff update failed:", upErr.message);
    return NextResponse.json(
      { error: "Could not save the drop-off location. Please try again." },
      { status: 400 },
    );
  }

  // Zero rows updated (deleted/started in a race) OR the coordinates didn't
  // actually land — never report success, or the customer sees the form again.
  if (!updated || updated.dest_lat == null || updated.dest_lng == null) {
    return NextResponse.json(
      {
        error:
          "We couldn't save your location — the delivery may have changed. Please refresh and try again.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
