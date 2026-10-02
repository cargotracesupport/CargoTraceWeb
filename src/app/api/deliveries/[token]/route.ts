import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clientIpFrom,
  gateTrackingRequest,
  getPublicDelivery,
  recordTrackingMiss,
  TRACK_RETRY_AFTER_S,
} from "@/lib/tracking";

export const dynamic = "force-dynamic";

// Anyone with the link can read this; never let a shared cache/CDN store it
// (it carries the customer's name, addresses, and the driver's phone).
const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

/**
 * Public delivery lookup by tracking token (no auth). The customer tracker
 * polls this every 15 s for status, ETA and the truck position. The token is
 * the only credential, so every call is rate-limited and the response is the
 * customer-safe shape from getPublicDelivery (no internal ids, no history).
 */
export async function GET(
  req: Request,
  { params }: { params: { token: string } },
) {
  const supabase = createAdminClient();
  const ip = clientIpFrom(req.headers);

  const gate = await gateTrackingRequest(supabase, ip, params.token);
  if (gate !== "ok") {
    return NextResponse.json(
      {
        error:
          gate === "locked"
            ? "Too many invalid tracking links from this network. Try again later."
            : "Too many requests. Please wait a minute.",
      },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(TRACK_RETRY_AFTER_S) },
      },
    );
  }

  const delivery = await getPublicDelivery(supabase, params.token);
  if (!delivery) {
    await recordTrackingMiss(supabase, ip);
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: NO_STORE },
    );
  }

  return NextResponse.json({ delivery }, { headers: NO_STORE });
}
