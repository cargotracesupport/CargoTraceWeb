import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Compare by the trailing digits so "+91 90000 00000" == "9000000000".
const normPhone = (s: string) => (s ?? "").replace(/\D/g, "").slice(-10);
const normRef = (s: string) => (s ?? "").trim().toLowerCase();

// Throttle login attempts per phone / per link (DB-backed, cross-instance).
const RL_LIMIT = 10;
const RL_WINDOW_S = 60;

// Every attempt from one IP, whatever phone or link it tries.
const IP_LIMIT = 20;
const IP_WINDOW_S = 600;

// Failure lockout. Delivery references are sequential (CT-1000, CT-1001…), so a
// throttle alone isn't enough: someone who knows a customer's number could walk
// the references. Failed attempts are recorded per phone and per IP (kept 24 h)
// and checked against an hourly and a daily cap on the same rows.
const FAIL_KEEP_S = 86_400;
const PHONE_FAIL_HOUR = 5;
const PHONE_FAIL_DAY = 15;
const IP_FAIL_HOUR = 10;
const IP_FAIL_DAY = 30;

type Admin = ReturnType<typeof createAdminClient>;

function clientIp(req: Request): string {
  return (
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Record one hit; false when the key is already at its limit. */
async function hit(sb: Admin, key: string, limit: number, windowS: number) {
  const { data } = await sb.rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowS,
  });
  return data !== false;
}

/** Read-only: true while the key is still under its limit. */
async function under(sb: Admin, key: string, limit: number, windowS: number) {
  const { data } = await sb.rpc("rate_limit_peek", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowS,
  });
  return data !== false;
}

async function lockedOut(sb: Admin, key: string, perHour: number, perDay: number) {
  const [hour, day] = await Promise.all([
    under(sb, key, perHour, 3600),
    under(sb, key, perDay, FAIL_KEEP_S),
  ]);
  return !(hour && day);
}

async function recordFailure(sb: Admin, keys: string[]) {
  // Huge limit = always record; the 24 h window is how long failures are kept.
  await Promise.all(keys.map((k) => hit(sb, k, 1_000_000, FAIL_KEEP_S)));
}

const tooMany = () =>
  NextResponse.json(
    { error: "Too many attempts. Please wait a minute and try again." },
    { status: 429, headers: { "Retry-After": String(RL_WINDOW_S) } },
  );

const lockedResponse = () =>
  NextResponse.json(
    {
      error:
        "Too many failed attempts. Please try again later, or open the tracking link from your message.",
    },
    { status: 429, headers: { "Retry-After": "3600" } },
  );

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

  // Per-IP: throttle every attempt, and refuse an IP with too many failures.
  const ip = clientIp(req);
  const ipFailKey = `custfail:ip:${ip}`;
  let phoneFailKey: string | null = null;
  if (!(await hit(supabase, `custhome:ip:${ip}`, IP_LIMIT, IP_WINDOW_S))) {
    return tooMany();
  }
  if (await lockedOut(supabase, ipFailKey, IP_FAIL_HOUR, IP_FAIL_DAY)) {
    return lockedResponse();
  }

  if (token) {
    // ── Token login: resolve the delivery's phone; the link is the proof. ──
    if (!UUID_RE.test(token)) {
      await recordFailure(supabase, [ipFailKey]);
      return NextResponse.json({ error: "invalid link" }, { status: 403 });
    }
    if (!(await hit(supabase, `custhome:tok:${token}`, RL_LIMIT, RL_WINDOW_S))) {
      return tooMany();
    }
    const { data: d } = await supabase
      .from("deliveries")
      .select("customer_phone")
      .eq("tracking_token", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (!d?.customer_phone) {
      await recordFailure(supabase, [ipFailKey]);
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
    // Too many wrong references for this number → locked, whatever IP asks.
    phoneFailKey = `custfail:ph:${normPhone(phone)}`;
    if (await lockedOut(supabase, phoneFailKey, PHONE_FAIL_HOUR, PHONE_FAIL_DAY)) {
      return lockedResponse();
    }
    if (!(await hit(supabase, `custhome:${normPhone(phone)}`, RL_LIMIT, RL_WINDOW_S))) {
      return tooMany();
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
    await recordFailure(
      supabase,
      phoneFailKey ? [ipFailKey, phoneFailKey] : [ipFailKey],
    );
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
