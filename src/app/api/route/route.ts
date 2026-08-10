import { NextResponse } from "next/server";

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
    const res = await fetch(url, { cache: "no-store" });
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

export async function POST(req: Request) {
  let body: { waypoints?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const wp = body.waypoints;
  if (!validWaypoints(wp)) {
    return NextResponse.json({ error: "invalid waypoints" }, { status: 400 });
  }

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
