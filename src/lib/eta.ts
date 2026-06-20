// Naive ETA helpers for the MVP. Straight-line (haversine) distance / assumed road speed.
// Good enough to show "~25 min away"; replace with a routing API later for accuracy.

export interface LatLng {
  lat: number;
  lng: number;
}

const DEFAULT_SPEED_KMH = 40;

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Estimated minutes from current position to destination. null if inputs missing. */
export function estimateEtaMinutes(
  current: LatLng | null,
  dest: LatLng | null,
  speedKmh?: number | null,
): number | null {
  if (!current || !dest) return null;
  const km = haversineKm(current, dest);
  const speed = speedKmh && speedKmh > 5 ? speedKmh : DEFAULT_SPEED_KMH;
  return Math.max(1, Math.round((km / speed) * 60));
}

export function formatEta(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
