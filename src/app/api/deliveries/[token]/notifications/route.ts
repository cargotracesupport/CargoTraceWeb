import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * Public customer notification feed, by tracking token (no auth). Returns the
 * customer-facing notifications for this delivery only.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const supabase = createAdminClient();
  const { data: d } = await supabase
    .from("deliveries")
    .select("id")
    .eq("tracking_token", params.token)
    .maybeSingle();
  if (!d) {
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: NO_STORE },
    );
  }
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, created_at")
    .eq("delivery_id", d.id)
    .eq("recipient_role", "customer")
    .order("created_at", { ascending: false })
    .limit(30);
  return NextResponse.json({ notifications: data ?? [] }, { headers: NO_STORE });
}
