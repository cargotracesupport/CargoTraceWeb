// Accurate "same route" grouping by real driving detour (OSRM), replacing the
// straight-line proximity heuristic when routing is available. A drop-off joins
// a route when inserting it adds little driving time — so a Kannur stop folds
// into a Kozhikode→Kasaragod trip, while a stop 40 km off the highway doesn't.

import { haversineKm, type Pt } from "@/lib/cluster";
import { drivingDurationMatrix, type LngLat } from "@/lib/osrm";

export type RouteItem<T = unknown> = {
  id: string;
  origin: Pt;
  dest: Pt;
  ref: T;
};

export type RoadGroupOpts = {
  /** Pickups within this many km are treated as one origin (same corridor). */
  pickupKm?: number;
  /** A stop is "on the way" if it adds at most this much driving time (sec)… */
  maxDetourSec?: number;
  /** …or at most this fraction of the route's current length, whichever is more. */
  detourFrac?: number;
  /** Matrix source — injectable for testing; defaults to live OSRM. */
  fetchMatrix?: (points: LngLat[]) => Promise<number[][] | null>;
};

// Pool deliveries that share (roughly) a pickup — they leave from the same place.
function poolByPickup<T>(
  items: RouteItem<T>[],
  pickupKm: number,
): RouteItem<T>[][] {
  const pools: RouteItem<T>[][] = [];
  for (const it of items) {
    const pool = pools.find((p) =>
      p.some((m) => haversineKm(m.origin, it.origin) <= pickupKm),
    );
    if (pool) pool.push(it);
    else pools.push([it]);
  }
  return pools;
}

/**
 * Group deliveries by real driving detour. Returns groups whose items are in
 * road-optimized visiting order, or null if routing is unavailable (caller
 * should fall back to straight-line grouping).
 */
export async function groupByRoad<T>(
  items: RouteItem<T>[],
  opts: RoadGroupOpts = {},
): Promise<RouteItem<T>[][] | null> {
  const pickupKm = opts.pickupKm ?? 3;
  const maxDetourSec = opts.maxDetourSec ?? 15 * 60;
  const detourFrac = opts.detourFrac ?? 0.15;
  const fetchMatrix = opts.fetchMatrix ?? drivingDurationMatrix;
  if (items.length === 0) return [];

  const pools = poolByPickup(items, pickupKm);

  // One matrix over every point we need: each pool's representative origin plus
  // every delivery's destination.
  const points: LngLat[] = [];
  const originIdx = new Map<number, number>(); // pool index -> point index
  pools.forEach((pool, pi) => {
    originIdx.set(pi, points.length);
    points.push([pool[0].origin.lng, pool[0].origin.lat]);
  });
  const destIdx = new Map<string, number>(); // item id -> point index
  for (const it of items) {
    destIdx.set(it.id, points.length);
    points.push([it.dest.lng, it.dest.lat]);
  }

  const matrix = await fetchMatrix(points);
  if (!matrix) return null;
  const dur = (a: number, b: number) => matrix[a][b];

  const routeLength = (seq: RouteItem<T>[], O: number): number => {
    if (seq.length === 0) return 0;
    let total = dur(O, destIdx.get(seq[0].id)!);
    for (let i = 1; i < seq.length; i++)
      total += dur(destIdx.get(seq[i - 1].id)!, destIdx.get(seq[i].id)!);
    return total;
  };

  const groups: RouteItem<T>[][] = [];
  pools.forEach((pool, pi) => {
    const O = originIdx.get(pi)!;
    // Build the corridor spine farthest-drop-first, so nearer on-the-way stops
    // insert into it at ~zero cost.
    const sorted = [...pool].sort(
      (a, b) => dur(O, destIdx.get(b.id)!) - dur(O, destIdx.get(a.id)!),
    );
    const routes: RouteItem<T>[][] = [];
    for (const it of sorted) {
      const di = destIdx.get(it.id)!;
      let best: { seq: RouteItem<T>[]; pos: number; added: number } | null =
        null;
      for (const seq of routes) {
        for (let pos = 0; pos <= seq.length; pos++) {
          const prev = pos === 0 ? O : destIdx.get(seq[pos - 1].id)!;
          const next = pos === seq.length ? null : destIdx.get(seq[pos].id)!;
          const added =
            next == null
              ? dur(prev, di) // pure extension past the last stop
              : dur(prev, di) + dur(di, next) - dur(prev, next);
          if (best == null || added < best.added) best = { seq, pos, added };
        }
      }
      const tol = best
        ? Math.max(maxDetourSec, detourFrac * routeLength(best.seq, O))
        : 0;
      if (best && best.added <= tol) best.seq.splice(best.pos, 0, it);
      else routes.push([it]);
    }
    groups.push(...routes);
  });

  return groups;
}
