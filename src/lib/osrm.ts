// Driving-time matrix for same-route grouping. Calls the server proxy
// (/api/route-matrix), which uses OSRM (matrices stay off Google for cost —
// see the proxy for why). Cached per exact point set.

export type LngLat = [number, number];

const MAX_POINTS = 90;

const matrixCache = new Map<string, number[][] | null>();
const keyOf = (points: LngLat[]) =>
  points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";");

/**
 * N×N driving-time matrix (seconds) among `points`. Returns null when routing is
 * unavailable or there are too few/many points, so callers can fall back to
 * straight-line grouping.
 */
export async function drivingDurationMatrix(
  points: LngLat[],
): Promise<number[][] | null> {
  if (points.length < 2 || points.length > MAX_POINTS) return null;
  const key = keyOf(points);
  if (matrixCache.has(key)) return matrixCache.get(key)!;
  try {
    const res = await fetch("/api/route-matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
    if (res.ok) {
      const j = (await res.json()) as { durations?: number[][] };
      if (Array.isArray(j.durations) && j.durations.length === points.length) {
        // The proxy encodes unreachable pairs as -1; treat those as Infinity so
        // they never look "on the way".
        const clean = j.durations.map((row) =>
          row.map((v) => (v < 0 ? Infinity : v)),
        );
        matrixCache.set(key, clean);
        return clean;
      }
    }
  } catch {
    /* network error — treat as unavailable */
  }
  matrixCache.set(key, null);
  return null;
}
