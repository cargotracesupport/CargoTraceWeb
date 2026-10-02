import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clientIpFrom,
  gateTrackingRequest,
  isTrackingToken,
  recordTrackingMiss,
  TRACK_RETRY_AFTER_S,
} from "@/lib/tracking";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * Public customer notification feed, by tracking token (no auth). Returns the
 * customer-facing notifications for this delivery only, without row ids.
 * Shares the tracking rate limit with GET /api/deliveries/[token].
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
      { error: "Too many requests. Please wait a minute." },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(TRACK_RETRY_AFTER_S) },
      },
    );
  }

  const { data: d } = isTrackingToken(params.token)
    ? await supabase
        .from("deliveries")
        .select("id")
        .eq("tracking_token", params.token)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (!d) {
    await recordTrackingMiss(supabase, ip);
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: NO_STORE },
    );
  }
  const { data } = await supabase
    .from("notifications")
    .select("type, title, body, created_at")
    .eq("delivery_id", d.id)
    .eq("recipient_role", "customer")
    .order("created_at", { ascending: false })
    .limit(30);
  return NextResponse.json({ notifications: data ?? [] }, { headers: NO_STORE });
}
