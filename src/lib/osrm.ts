// Road driving-time helpers backed by OSRM (the same public server used by
// lib/route.ts). CORS-enabled, no API key. Used to group deliveries by real
// driving *detour* ("is this stop on the way?") instead of straight-line
// proximity — so e.g. a Kannur drop-off folds into a Kozhikode→Kasaragod trip.

export type LngLat = [number, number];

// OSRM's public /table service caps at ~100 coordinates; stay comfortably under.
const MAX_POINTS = 90;

// Cache matrices by their exact point-set, so realtime board churn that yields
// the same ready-set doesn't re-hit OSRM.
const matrixCache = new Map<string, number[][] | null>();

function keyOf(points: LngLat[]): string {
  return points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";");
}

/**
 * N×N driving-time matrix (seconds) among `points`, via OSRM /table.
 * Returns null when routing is unavailable, or there are too few/many points,
 * so callers can fall back to straight-line grouping.
 */
export async function drivingDurationMatrix(
  points: LngLat[],
): Promise<number[][] | null> {
  if (points.length < 2 || points.length > MAX_POINTS) return null;
  const key = keyOf(points);
  if (matrixCache.has(key)) return matrixCache.get(key)!;

  const coords = points.map((p) => `${p[0]},${p[1]}`).join(";");
  try {
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`;
    const res = await fetch(url);
    if (!res.ok) {
      matrixCache.set(key, null);
      return null;
    }
    const json = (await res.json()) as { durations?: (number | null)[][] };
    const d = json.durations;
    if (!Array.isArray(d) || d.length !== points.length) {
      matrixCache.set(key, null);
      return null;
    }
    // OSRM returns null for unreachable pairs — treat those as Infinity so they
    // never look "on the way".
    const clean = d.map((row) => row.map((v) => (v == null ? Infinity : v)));
    matrixCache.set(key, clean);
    return clean;
  } catch {
    // network/CORS/rate-limit — signal "unavailable" so the caller falls back.
    matrixCache.set(key, null);
    return null;
  }
}
