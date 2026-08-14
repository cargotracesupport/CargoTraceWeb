import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, type NotifyRow } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * A driver whose browser blocked/denied location POSTs here so the owning agent
 * and the org admins are alerted that the trip isn't sharing GPS.
 * POST { deliveryId }. Throttled to once per 15 min per delivery.
 */
export async function POST(req: Request) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { deliveryId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
  if (!deliveryId) {
    return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: delivery } = await supabase
    .from("deliveries")
    .select("id, org_id, reference, driver_id, agent_id")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!delivery) {
    return NextResponse.json({ error: "unknown delivery" }, { status: 404 });
  }
  // Only the assigned driver can raise this alert for the delivery.
  if (delivery.driver_id !== session.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Durable throttle so repeated permission errors don't spam the feed.
  const { data: allowed } = await supabase.rpc("rate_limit_hit", {
    p_key: `locdenied:${deliveryId}`,
    p_limit: 1,
    p_window_seconds: 900,
  });
  if (allowed === false) return NextResponse.json({ ok: true, throttled: true });

  const name = session.profile.full_name ?? "The driver";
  const ref = delivery.reference ?? "a delivery";
  const title = `Location off — ${ref}`;
  const bodyText = `${name} has location turned off, so live tracking is paused.`;

  const rows: NotifyRow[] = [
    {
      orgId: delivery.org_id,
      recipientRole: "admin",
      deliveryId: delivery.id,
      type: "location_denied",
      title,
      body: bodyText,
    },
  ];
  if (delivery.agent_id) {
    rows.push({
      orgId: delivery.org_id,
      recipientId: delivery.agent_id,
      recipientRole: "agent",
      deliveryId: delivery.id,
      type: "location_denied",
      title,
      body: bodyText,
    });
  }
  await notify(rows);
  return NextResponse.json({ ok: true });
}
