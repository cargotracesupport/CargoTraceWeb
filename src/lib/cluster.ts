// Proximity clustering used to suggest "same route" delivery groups on the
// dispatch board. Two deliveries are on the same route when their pickups are
// near each other AND their drop-offs are near each other.

export type Pt = { lat: number; lng: number };

/** Great-circle distance between two points, in km. */
export function haversineKm(a: Pt, b: Pt): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Greedy single-linkage clustering: an item joins the first group where some
 * member is within `pickupKm` (pickup) AND `dropKm` (drop-off); otherwise it
 * starts a new group. Order-stable, no external calls.
 */
export function groupSameRoute<T extends { origin: Pt; dest: Pt }>(
  items: T[],
  opts?: { pickupKm?: number; dropKm?: number },
): T[][] {
  const pickupKm = opts?.pickupKm ?? 3;
  const dropKm = opts?.dropKm ?? 5;
  const groups: T[][] = [];
  for (const it of items) {
    let placed = false;
    for (const g of groups) {
      if (
        g.some(
          (m) =>
            haversineKm(m.origin, it.origin) <= pickupKm &&
            haversineKm(m.dest, it.dest) <= dropKm,
        )
      ) {
        g.push(it);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([it]);
  }
  return groups;
}
