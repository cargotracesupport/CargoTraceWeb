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
