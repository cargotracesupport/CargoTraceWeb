import { NextResponse } from "next/server";
import { sendDeliveryMessage, type WaEvent, type DeliveryLike } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// The "booked / set your drop-off" message on delivery creation is OFF by
// default: the "Send on WhatsApp" button on the delivery-created screen already
// covers it, and auto-sending too would double-message. Set this to "true" to
// automate it (and drop the manual step).
const SEND_ON_BOOKED = process.env.WHATSAPP_SEND_ON_BOOKED === "true";

interface Row extends DeliveryLike {
  id: string;
  status: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema?: string;
  record: Row | null;
  old_record: Row | null;
}

/**
 * Supabase Database Webhook receiver — the single choke point for automated
 * customer WhatsApp notifications.
 *
 * Configure a webhook (Supabase → Database → Webhooks) on public.deliveries for
 * INSERT + UPDATE that POSTs here with a header
 *   x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>
 * We diff old→new status and send the matching pre-approved template. Catching
 * changes at the DB layer means every transition fires exactly once regardless
 * of where it came from (driver app, agent RPC, GPS ingest, raw SQL).
 *
 * Excluded from auth middleware (the matcher skips /api), so it's reachable by
 * Supabase; the shared secret is what authenticates the caller.
 */
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET || "";
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const row = payload.record;
  if (payload.table !== "deliveries" || !row) {
    return NextResponse.json({ ok: true, skipped: "ignored" });
  }

  const prevStatus = payload.old_record?.status ?? null;
  const status = row.status;

  // Only a genuine status transition into a target state sends anything. On GPS
  // pings the row updates but status is unchanged (prev === new) → nothing sent.
  let event: WaEvent | null = null;
  if (payload.type === "INSERT") {
    if (
      SEND_ON_BOOKED &&
      ["awaiting_dropoff", "pending", "assigned"].includes(status)
    ) {
      event = "booked";
    }
  } else if (payload.type === "UPDATE" && prevStatus !== status) {
    if (status === "en_route") event = "en_route";
    else if (status === "delivered") event = "delivered";
  }

  if (!event) {
    return NextResponse.json({ ok: true, skipped: "no_event" });
  }

  const result = await sendDeliveryMessage(event, row);
  if (!result.ok && !result.skipped) {
    // Real failure (not a deliberate skip) — log for observability. Still 200
    // below so Supabase doesn't retry-storm on a bad phone / template.
    console.error(`[whatsapp] ${event} for delivery ${row.id}:`, result.error);
  }
  return NextResponse.json({ event, ...result });
}
