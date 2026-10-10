import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIpFrom, isTrackingToken } from "@/lib/tracking";

export const dynamic = "force-dynamic";

// Compare by the trailing digits so "+91 90000 00000" == "9000000000".
const normPhone = (s: string) => (s ?? "").replace(/\D/g, "").slice(-10);

// Throttle phone-match attempts per token (DB-backed, so it works across
// serverless instances). 10 tries/minute is plenty for a real human.
const RL_LIMIT = 10;
const RL_WINDOW_S = 60;
// Every drop-off attempt from one IP, whatever link it uses.
const IP_LIMIT = 30;
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

  // A malformed token can't match anything. Reject it before the rate limiter
  // writes a row keyed on it, or arbitrary URL text could fill rate_hits.
  if (!isTrackingToken(params.token)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = createAdminClient();

  // Rate-limit per IP and per tracking token (durable, cross-instance) to
  // blunt brute-force. Fails CLOSED: if the limiter errors, refuse.
  const limited = async (key: string, limit: number) => {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: RL_WINDOW_S,
    });
    return !!error || data !== true;
  };
  if (
    (await limited(`dropoff:ip:${clientIpFrom(req.headers)}`, IP_LIMIT)) ||
    (await limited(`dropoff:${params.token}`, RL_LIMIT))
  ) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(RL_WINDOW_S) } },
    );
  }

  const { data: d } = await supabase
    .from("deliveries")
    .select(
      "id, status, reference, goods, origin_label, customer_name, customer_phone, customer_id, org_id, dest_lat, driver_id, agent_id",
    )
    .eq("tracking_token", params.token)
    .is("deleted_at", null)
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

  // The customer may set or change the drop-off until the trip starts; after
  // that the freeze trigger would reject it, so started trips are excluded.
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

  // Changing a drop-off that was already set is worth a human look: it's how a
  // diverted delivery would show up. Tell the admins, the owning agent and the
  // assigned driver. Non-fatal.
  if (d.dest_lat != null) {
    const ref = d.reference ?? "a delivery";
    const title = `Drop-off changed — ${ref}`;
    const body = `The customer moved the drop-off${label ? ` to ${label}` : ""}.`;
    const rows: Array<Record<string, unknown>> = [
      { org_id: d.org_id, recipient_role: "admin", delivery_id: d.id, type: "dropoff_changed", title, body },
    ];
    if (d.agent_id) {
      rows.push({ org_id: d.org_id, recipient_id: d.agent_id, recipient_role: "agent", delivery_id: d.id, type: "dropoff_changed", title, body });
    }
    if (d.driver_id) {
      rows.push({ org_id: d.org_id, recipient_id: d.driver_id, recipient_role: "driver", delivery_id: d.id, type: "dropoff_changed", title, body });
    }
    const { error: nErr } = await supabase.from("notifications").insert(rows);
    if (nErr) console.error("dropoff_changed notify failed:", nErr.message);
  }

  // Save this drop-off to the customer's address book so it's available on
  // their next delivery. Dedup within ~50 m (customer_address_nearby); a match
  // updates the label so the newest text wins, otherwise insert a new row. Any
  // failure here is non-fatal — the drop-off itself already saved.
  if (d.customer_id) {
    const { data: near } = await supabase.rpc("customer_address_nearby", {
      p_customer: d.customer_id,
      p_lat: lat,
      p_lng: lng,
    });
    const existing = Array.isArray(near) ? near[0] : null;
    if (existing?.id) {
      if (label && label !== existing.label) {
        await supabase
          .from("customer_addresses")
          .update({ label })
          .eq("id", existing.id);
      }
    } else {
      await supabase.from("customer_addresses").insert({
        customer_id: d.customer_id,
        org_id: d.org_id,
        label,
        lat,
        lng,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
