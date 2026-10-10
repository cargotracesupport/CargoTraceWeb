import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrackingToken } from "@/lib/tracking";

export const dynamic = "force-dynamic";

// By-road driving route through ordered waypoints (start → A → B …). Uses Google
// Routes API (traffic-aware) when GOOGLE_ROUTES_KEY is set; otherwise OSRM. Keeps
// the Google key server-side. Response shape is provider-independent:
//   { coords: [[lng,lat], …], legs: [{ durationSec, distanceM }, …] }
// with one leg per consecutive waypoint pair.

type LngLat = [number, number];
type Leg = { durationSec: number; distanceM: number };
type RouteOut = { coords: LngLat[]; legs: Leg[] };

// Google allows up to 25 intermediates; keep the whole path under that.
const MAX_WAYPOINTS = 25;
// The public tracker only ever asks for truck → pickup → drop-off.
const MAX_TOKEN_WAYPOINTS = 3;
// Outbound calls must not hold a function slot open indefinitely.
const UPSTREAM_TIMEOUT_MS = 8000;

// Per-instance cache. Fixed pickups/drop-offs repeat constantly; the moving
// truck is already throttled to ~1 km buckets by callers.
const cache = new Map<string, RouteOut>();
const keyOf = (wp: LngLat[]) =>
  wp.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";");

function validWaypoints(v: unknown): v is LngLat[] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    v.length <= MAX_WAYPOINTS &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[1]) <= 90 &&
        Math.abs(p[0]) <= 180,
    )
  );
}

// "123s" or "123.4s" → seconds.
function parseDuration(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(/s$/, "")) || 0;
  return 0;
}

async function googleRoute(
  wp: LngLat[],
  key: string,
): Promise<RouteOut | null> {
  const loc = (p: LngLat) => ({
    location: { latLng: { latitude: p[1], longitude: p[0] } },
  });
  try {
    const res = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "routes.legs.duration,routes.legs.distanceMeters,routes.polyline.geoJsonLinestring",
        },
        body: JSON.stringify({
          origin: loc(wp[0]),
          destination: loc(wp[wp.length - 1]),
          intermediates: wp.slice(1, -1).map(loc),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          polylineEncoding: "GEO_JSON_LINESTRING",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      routes?: {
        legs?: { duration?: string | number; distanceMeters?: number }[];
        polyline?: { geoJsonLinestring?: { coordinates?: LngLat[] } };
      }[];
    };
    const r = json.routes?.[0];
    const coords = r?.polyline?.geoJsonLinestring?.coordinates;
    const legs = (r?.legs ?? []).map((l) => ({
      durationSec: parseDuration(l.duration),
      distanceM: l.distanceMeters ?? 0,
    }));
    if (
      !Array.isArray(coords) ||
      coords.length < 2 ||
      legs.length !== wp.length - 1
    )
      return null;
    return { coords, legs };
  } catch {
    return null;
  }
}

async function osrmRoute(wp: LngLat[]): Promise<RouteOut | null> {
  try {
    const coordStr = wp.map((p) => `${p[0]},${p[1]}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      routes?: {
        geometry?: { coordinates?: LngLat[] };
        legs?: { duration?: number; distance?: number }[];
      }[];
    };
    const r = json.routes?.[0];
    const coords = r?.geometry?.coordinates;
    const legs = (r?.legs ?? []).map((l) => ({
      durationSec: l.duration ?? 0,
      distanceM: l.distance ?? 0,
    }));
    if (
      !Array.isArray(coords) ||
      coords.length < 2 ||
      legs.length !== wp.length - 1
    )
      return null;
    return { coords, legs };
  } catch {
    return null;
  }
}

// Every caller is rate-limited: each call can be a paid Google Routes request.
// Customers need very few calls (the client caches routes and only re-fetches
// when the driver moves ~1 km); staff maps re-route on selection changes, not
// on every GPS fix. Generous for real use, a hard ceiling for abuse.
const RL_LIMIT = 30; // per tracking token
const STAFF_RL_LIMIT = 60; // per signed-in user
const RL_WINDOW_S = 60;

// Gate the caller. This endpoint calls Google Routes (TRAFFIC_AWARE — the
// priciest tier) when GOOGLE_ROUTES_KEY is set, so it must not be an open proxy.
// Signed-in staff (admin / agent / driver) are limited per user; otherwise a
// valid customer tracking token is required (the public tracker genuinely
// needs routing), limited per token and to MAX_TOKEN_WAYPOINTS points. The
// limiter fails CLOSED. Returns an error response, or null.
async function gate(
  token: unknown,
  waypointCount: number,
): Promise<NextResponse | null> {
  const admin = createAdminClient();
  const limited = async (key: string, limit: number) => {
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: RL_WINDOW_S,
    });
    return !!error || data !== true;
  };
  const tooMany = () =>
    NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(RL_WINDOW_S) } },
    );

  const session = await getSessionProfile();
  if (session) {
    return (await limited(`route:user:${session.userId}`, STAFF_RL_LIMIT))
      ? tooMany()
      : null;
  }

  const t = typeof token === "string" ? token : "";
  if (!isTrackingToken(t) || waypointCount > MAX_TOKEN_WAYPOINTS) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { data } = await admin
    .from("deliveries")
    .select("id")
    .eq("tracking_token", t)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return (await limited(`route:${t}`, RL_LIMIT)) ? tooMany() : null;
}

export async function POST(req: Request) {
  let body: { waypoints?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const wp = body.waypoints;
  if (!validWaypoints(wp)) {
    return NextResponse.json({ error: "invalid waypoints" }, { status: 400 });
  }
  const denied = await gate(body.token, wp.length);
  if (denied) return denied;

  const key = keyOf(wp);
  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const gKey = process.env.GOOGLE_ROUTES_KEY;
  const out = (gKey ? await googleRoute(wp, gKey) : null) ?? (await osrmRoute(wp));
  if (!out) {
    return NextResponse.json({ error: "routing unavailable" }, { status: 502 });
  }

  if (cache.size > 500) cache.clear(); // crude cap; points are stable so this is rare
  cache.set(key, out);
  return NextResponse.json(out, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
