import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Compare by the trailing digits so "+91 90000 00000" == "9000000000".
const normPhone = (s: string) => (s ?? "").replace(/\D/g, "").slice(-10);

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
  const label = body.label ? String(body.label).trim() : null;
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

  const { error: upErr } = await supabase
    .from("deliveries")
    .update({
      dest_lat: lat,
      dest_lng: lng,
      dest_label: label,
      status: newStatus,
    })
    .eq("id", d.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
