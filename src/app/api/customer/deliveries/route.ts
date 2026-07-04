import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Compare by the trailing digits so "+91 90000 00000" == "9000000000".
const normPhone = (s: string) => (s ?? "").replace(/\D/g, "").slice(-10);
const normRef = (s: string) => (s ?? "").trim().toLowerCase();

// Throttle login attempts per phone (DB-backed, cross-instance).
const RL_LIMIT = 10;
const RL_WINDOW_S = 60;

type DeliveryRow = {
  reference: string | null;
  status: string;
  goods: string | null;
  origin_label: string | null;
  dest_label: string | null;
  dest_lat: number | null;
  customer_name: string | null;
  tracking_token: string;
  created_at: string;
  delivered_at: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Customer home "login". Two ways in, both returning every delivery booked
 * with the customer's number (with tracking links):
 *  - POST { token }              — a delivery's tracking-link token (the link
 *    itself is the credential, same as the tracking page)
 *  - POST { phone, reference }   — the booked mobile number plus any one of
 *    their delivery references
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const reference = String(body.reference ?? "").trim();
  let phone = String(body.phone ?? "").trim();

  const supabase = createAdminClient();

  if (token) {
    // ── Token login: resolve the delivery's phone; the link is the proof. ──
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: "invalid link" }, { status: 403 });
    }
    const { data: allowed } = await supabase.rpc("rate_limit_hit", {
      p_key: `custhome:tok:${token}`,
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
      .select("customer_phone")
      .eq("tracking_token", token)
      .maybeSingle();
    if (!d?.customer_phone) {
      return NextResponse.json(
        { error: "This link couldn't load your deliveries." },
        { status: 403 },
      );
    }
    phone = d.customer_phone;
  } else {
    // ── Phone + reference login. ──────────────────────────────────────────
    if (normPhone(phone).length < 6) {
      return NextResponse.json(
        { error: "Enter a valid mobile number." },
        { status: 400 },
      );
    }
    if (!reference) {
      return NextResponse.json(
        { error: "Enter one of your delivery reference numbers." },
        { status: 400 },
      );
    }
    const { data: allowed } = await supabase.rpc("rate_limit_hit", {
      p_key: `custhome:${normPhone(phone)}`,
      p_limit: RL_LIMIT,
      p_window_seconds: RL_WINDOW_S,
    });
    if (allowed === false) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a minute and try again." },
        { status: 429, headers: { "Retry-After": String(RL_WINDOW_S) } },
      );
    }
  }

  const { data, error } = await supabase.rpc("deliveries_for_customer_phone", {
    p_phone: phone,
  });
  if (error) {
    console.error("customer lookup failed:", error.message);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as (DeliveryRow & Record<string, unknown>)[];
  // Phone+reference path: the reference must belong to one of this number's
  // deliveries — that pairing is the proof it's really the customer (same 403
  // whether the phone or the reference is wrong, so nothing can be probed).
  const verified =
    !!token ||
    rows.some((r) => normRef(r.reference ?? "") === normRef(reference));
  if (!verified) {
    return NextResponse.json(
      { error: "That number and reference don't match any delivery." },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      customer_name:
        rows.find((r) => r.customer_name)?.customer_name ?? null,
      deliveries: rows.map((r) => ({
        reference: r.reference,
        status: r.status,
        goods: r.goods,
        origin_label: r.origin_label,
        dest_label: r.dest_label,
        needs_dropoff: r.status === "awaiting_dropoff" || r.dest_lat == null,
        tracking_token: r.tracking_token,
        created_at: r.created_at,
        delivered_at: r.delivered_at,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
