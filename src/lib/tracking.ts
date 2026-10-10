// Public delivery tracking by token. SERVER ONLY: uses the service-role client.
// Shared by the /track/[token] page and GET /api/deliveries/[token] (which the
// page polls), so both return exactly the same customer-safe shape.
//
// Customers have no profiles row, so no RLS policy can serve them; the
// tracking token is the only credential. That is why this runs server-side
// with the service-role key instead of an anon-key policy on tracking_token
// (which would let anyone who can enumerate tokens read any delivery), and why
// every lookup is rate-limited.

import { createAdminClient } from "@/lib/supabase/admin";
import { estimateEtaMinutes } from "@/lib/eta";
import { STALE_AFTER_MS, speedKmh } from "@/lib/presence";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * What a customer may see. No internal ids (delivery, driver, agent, org,
 * device), no position history, no other customer's data. The driver's name,
 * phone and vehicle are included on purpose: the tracker lets the customer
 * call their driver. The truck position is only included while the delivery
 * is en route.
 */
export interface PublicDelivery {
  reference: string | null;
  goods: string | null;
  status: string;
  origin_label: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_label: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  customer_name: string | null;
  /** Current truck position; null unless en route and it has reported. */
  last_lat: number | null;
  last_lng: number | null;
  last_position_at: string | null;
  /** Seconds since the last fix, by the server clock (phone clocks drift). */
  position_age_s: number | null;
  /** False once the fix is older than STALE_AFTER_MS: show "last seen", not live. */
  position_live: boolean;
  /** Minutes to the drop-off from a live position; null when stale or unknown. */
  eta_minutes: number | null;
  delivered_at: string | null;
  picked_up_at: string | null;
  driver: { full_name: string | null; phone: string | null } | null;
  vehicle: { plate: string | null; name: string | null } | null;
}

// tracking_token is a uuid; anything else can't match, so don't query for it.
const TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTrackingToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/**
 * Caller identity for rate limiting, from proxy headers (Vercel sets
 * x-forwarded-for). An IPv6 client usually controls a whole /64, so it is
 * keyed by that prefix; otherwise rotating addresses would dodge every limit.
 */
export function clientIpFrom(headers: Headers): string {
  const ip =
    (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    headers.get("x-real-ip") ||
    "unknown";
  return ip.includes(":") ? ipv6Prefix64(ip) : ip;
}

/** First four groups of an IPv6 address ("2001:db8:0:1::/64"). */
function ipv6Prefix64(ip: string): string {
  const bare = ip.replace(/^\[|\](:\d+)?$/g, "").split("%")[0].toLowerCase();
  const [head, tail] = bare.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail !== undefined ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array(Math.max(0, fill)).fill("0"), ...right];
  return groups.slice(0, 4).map((g) => g || "0").join(":") + "::/64";
}

// ── Rate limits ───────────────────────────────────────────────────────────
// Per IP + token: the tracker polls the delivery every 15 s and the updates
// feed every 15 s (8 a minute), plus reloads. Keyed on the pair so customers
// behind one carrier NAT address don't share a budget.
const PER_TOKEN_LIMIT = 40;
const PER_TOKEN_WINDOW_S = 60;
// Unknown tokens per IP. A real customer almost never misses, so repeated
// misses mean someone is guessing; lock that IP out for the hour / day.
const MISS_KEEP_S = 86_400;
const MISS_PER_HOUR = 20;
const MISS_PER_DAY = 60;

export type TrackGate = "ok" | "throttled" | "locked";

// The limiter fails CLOSED: if it can't be read, the request is refused.
async function under(sb: Admin, key: string, limit: number, windowS: number) {
  const { data, error } = await sb.rpc("rate_limit_peek", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowS,
  });
  return !error && data === true;
}

/**
 * Check (and count) one tracking request. Call before the lookup. A token
 * that isn't a uuid passes the gate without writing a row keyed on it (the
 * lookup then misses and records a per-IP miss), so junk URLs can't fill
 * rate_hits.
 */
export async function gateTrackingRequest(
  sb: Admin,
  ip: string,
  token: string,
): Promise<TrackGate> {
  const missKey = `trackmiss:ip:${ip}`;
  const [hour, day] = await Promise.all([
    under(sb, missKey, MISS_PER_HOUR, 3600),
    under(sb, missKey, MISS_PER_DAY, MISS_KEEP_S),
  ]);
  if (!hour || !day) return "locked";
  if (!isTrackingToken(token)) return "ok";
  const { data: allowed, error } = await sb.rpc("rate_limit_hit", {
    p_key: `track:${ip}:${token}`,
    p_limit: PER_TOKEN_LIMIT,
    p_window_seconds: PER_TOKEN_WINDOW_S,
  });
  return error || allowed !== true ? "throttled" : "ok";
}

/** Count a lookup that matched no delivery against the caller's IP. */
export async function recordTrackingMiss(sb: Admin, ip: string) {
  // Huge limit = always record; the window is how long misses are kept.
  await sb.rpc("rate_limit_hit", {
    p_key: `trackmiss:ip:${ip}`,
    p_limit: 1_000_000,
    p_window_seconds: MISS_KEEP_S,
  });
}

export const TRACK_RETRY_AFTER_S = PER_TOKEN_WINDOW_S;

// ── Lookup ────────────────────────────────────────────────────────────────

type Row = {
  reference: string | null;
  goods: string | null;
  status: string;
  origin_label: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_label: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  customer_name: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_speed: number | null;
  last_position_at: string | null;
  delivered_at: string | null;
  picked_up_at: string | null;
  driver: { full_name: string | null; phone: string | null } | null;
  vehicle: { plate: string | null; name: string | null } | null;
};

/** Customer-safe view of the delivery for this token, or null if none. */
export async function getPublicDelivery(
  sb: Admin,
  token: string,
): Promise<PublicDelivery | null> {
  if (!isTrackingToken(token)) return null;
  // The driver embed names its FK because deliveries has two FKs into
  // profiles (driver_id and agent_id); only the driver is exposed, and only
  // their name and phone. No id columns are selected.
  const { data, error } = await sb
    .from("deliveries")
    .select(
      "reference, goods, status, " +
        "origin_label, origin_lat, origin_lng, " +
        "dest_label, dest_lat, dest_lng, " +
        "customer_name, " +
        "last_lat, last_lng, last_speed, last_position_at, delivered_at, picked_up_at, " +
        "driver:profiles!deliveries_driver_id_fkey(full_name, phone), " +
        "vehicle:vehicles(plate, name)",
    )
    .eq("tracking_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return toPublic(data as unknown as Row);
}

function toPublic(r: Row, now = Date.now()): PublicDelivery {
  // The truck is only shown while the trip is under way. Before it starts
  // there is no current position, and after delivery the driver's location
  // is none of the customer's business.
  const enRoute = r.status === "en_route";
  const hasFix =
    enRoute && r.last_lat != null && r.last_lng != null && !!r.last_position_at;
  const fixAt = hasFix ? new Date(r.last_position_at as string).getTime() : NaN;
  const ageMs = Number.isFinite(fixAt) ? Math.max(0, now - fixAt) : null;
  const live = ageMs != null && ageMs <= STALE_AFTER_MS;

  let eta: number | null = null;
  if (live) {
    const truck = { lat: r.last_lat as number, lng: r.last_lng as number };
    const origin =
      r.origin_lat != null && r.origin_lng != null
        ? { lat: r.origin_lat, lng: r.origin_lng }
        : null;
    const dest =
      r.dest_lat != null && r.dest_lng != null
        ? { lat: r.dest_lat, lng: r.dest_lng }
        : null;
    const kmh = speedKmh(r.last_speed);
    if (r.picked_up_at == null && origin) {
      // Still heading to the pickup: both legs, so "arriving in" stays honest.
      const toPickup = estimateEtaMinutes(truck, origin, kmh);
      const onward = dest ? estimateEtaMinutes(origin, dest, null) : 0;
      eta = toPickup == null ? null : toPickup + (onward ?? 0);
    } else {
      eta = estimateEtaMinutes(truck, dest, kmh);
    }
  }

  return {
    reference: r.reference,
    goods: r.goods,
    status: r.status,
    origin_label: r.origin_label,
    origin_lat: r.origin_lat,
    origin_lng: r.origin_lng,
    dest_label: r.dest_label,
    dest_lat: r.dest_lat,
    dest_lng: r.dest_lng,
    customer_name: r.customer_name,
    last_lat: hasFix ? r.last_lat : null,
    last_lng: hasFix ? r.last_lng : null,
    last_position_at: hasFix ? r.last_position_at : null,
    position_age_s: ageMs == null ? null : Math.floor(ageMs / 1000),
    position_live: live,
    eta_minutes: eta,
    delivered_at: r.delivered_at,
    picked_up_at: r.picked_up_at,
    driver: r.driver
      ? { full_name: r.driver.full_name, phone: r.driver.phone }
      : null,
    vehicle: r.vehicle
      ? { plate: r.vehicle.plate, name: r.vehicle.name }
      : null,
  };
}
