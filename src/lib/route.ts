// Fetch a by-road driving route (A→B) as a list of [lng, lat] points, using the
// public OSRM demo server. Falls back to a straight line if routing is
// unavailable, so the map always draws something.

type LngLat = [number, number];

const cache = new Map<string, LngLat[]>();

export async function roadRoute(from: LngLat, to: LngLat): Promise<LngLat[]> {
  const key = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const straight: LngLat[] = [from, to];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return straight;
    const json = (await res.json()) as {
      routes?: { geometry?: { coordinates?: LngLat[] } }[];
    };
    const coords = json.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      cache.set(key, coords);
      return coords;
    }
  } catch {
    /* network/CORS error — fall through to straight line */
  }
  return straight;
}

export type RouteLeg = { durationSec: number; distanceM: number };
export type DetailedRoute = { coords: LngLat[]; legs: RouteLeg[] };

const detailCache = new Map<string, DetailedRoute>();

/**
 * By-road driving route through an ordered list of waypoints (start → A → B …):
 * the full polyline plus one {duration, distance} leg per consecutive pair —
 * so callers can show "time to reach each stop". Returns null when routing is
 * unavailable (callers fall back to straight lines / no ETAs).
 */
export async function roadRouteDetailed(
  points: LngLat[],
): Promise<DetailedRoute | null> {
  if (points.length < 2) return null;
  const key = "det:" + points.map((p) => `${p[0]},${p[1]}`).join(";");
  const cached = detailCache.get(key);
  if (cached) return cached;

  try {
    const coordStr = points.map((p) => `${p[0]},${p[1]}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (res.ok) {
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
        Array.isArray(coords) &&
        coords.length >= 2 &&
        legs.length === points.length - 1
      ) {
        const out = { coords, legs };
        detailCache.set(key, out);
        return out;
      }
    }
  } catch {
    /* network/CORS error — fall through to null */
  }
  return null;
}

/**
 * By-road driving path through an ordered list of waypoints (pickup → A → B …),
 * as one [lng, lat] polyline. Falls back to straight segments joining the points
 * if routing is unavailable, so the map always draws something.
 */
export async function roadRouteThrough(points: LngLat[]): Promise<LngLat[]> {
  if (points.length < 2) return points;
  const detailed = await roadRouteDetailed(points);
  return detailed?.coords ?? points;
}
