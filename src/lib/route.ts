// Client-side driving-route helpers. These call the server proxy (/api/route),
// which uses Google Routes (traffic-aware) when configured and OSRM otherwise —
// so the routing provider is swappable without touching callers. Results are
// cached per exact waypoint set to avoid redundant round-trips.

type LngLat = [number, number];

export type RouteLeg = { durationSec: number; distanceM: number };
export type DetailedRoute = { coords: LngLat[]; legs: RouteLeg[] };

const detailCache = new Map<string, DetailedRoute | null>();
const keyOf = (pts: LngLat[]) =>
  pts.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";");

/**
 * By-road driving route through ordered waypoints: the polyline plus one
 * {duration, distance} leg per consecutive pair. Returns null when routing is
 * unavailable (callers fall back to straight lines / no ETAs).
 */
export async function roadRouteDetailed(
  points: LngLat[],
): Promise<DetailedRoute | null> {
  if (points.length < 2) return null;
  const key = keyOf(points);
  if (detailCache.has(key)) return detailCache.get(key)!;
  try {
    const res = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waypoints: points }),
    });
    if (res.ok) {
      const j = (await res.json()) as Partial<DetailedRoute>;
      if (
        Array.isArray(j.coords) &&
        j.coords.length >= 2 &&
        Array.isArray(j.legs)
      ) {
        const out = { coords: j.coords, legs: j.legs };
        detailCache.set(key, out);
        return out;
      }
    }
  } catch {
    /* network error — treat as unavailable */
  }
  detailCache.set(key, null);
  return null;
}

/**
 * By-road driving path A→B as a list of [lng, lat] points. Falls back to a
 * straight line when routing is unavailable, so the map always draws something.
 */
export async function roadRoute(from: LngLat, to: LngLat): Promise<LngLat[]> {
  const d = await roadRouteDetailed([from, to]);
  return d?.coords ?? [from, to];
}

/**
 * By-road driving path through an ordered list of waypoints (pickup → A → B …),
 * as one [lng, lat] polyline. Falls back to straight segments joining the points.
 */
export async function roadRouteThrough(points: LngLat[]): Promise<LngLat[]> {
  if (points.length < 2) return points;
  const d = await roadRouteDetailed(points);
  return d?.coords ?? points;
}
