import { useEffect, useState } from "react";
import { roadRouteThrough } from "@/lib/route";
import type { Delivery } from "@/lib/types";

type Sel = Pick<
  Delivery,
  | "id"
  | "status"
  | "last_lat"
  | "last_lng"
  | "picked_up_at"
  | "origin_lat"
  | "origin_lng"
  | "dest_lat"
  | "dest_lng"
> | null;

export interface RouteProps {
  route?: Array<[number, number]>;
  roadFrom?: [number, number];
  roadTo?: [number, number];
}

/**
 * The route line for the selected delivery on the dispatch maps:
 *  - en route, not yet picked up → driver → pickup → drop-off (the leg the
 *    driver is currently on)
 *  - en route, picked up         → driver → drop-off
 *  - not started yet             → pickup → drop-off (the planned trip)
 *
 * Returns props to spread onto <LiveMap/>. The 3-point (heading-to-pickup) leg
 * is fetched here; the 2-point legs are drawn by LiveMap itself.
 */
export function useSelectedRoute(sel: Sel): RouteProps {
  const hasPos = !!sel && sel.last_lat != null && sel.last_lng != null;
  const enroute = !!sel && sel.status === "en_route" && hasPos;
  const hasOrigin = !!sel && sel.origin_lat != null && sel.origin_lng != null;
  const hasDest = !!sel && sel.dest_lat != null && sel.dest_lng != null;
  const headingToPickup = !!sel && enroute && sel.picked_up_at == null && hasOrigin;

  // Throttle re-routing to ~1 km buckets of the driver position (like the
  // customer tracker) so live GPS ticks don't re-hit routing constantly.
  const truckKey = hasPos
    ? `${(sel!.last_lat as number).toFixed(2)},${(sel!.last_lng as number).toFixed(2)}`
    : "";
  const sig = `${sel?.id ?? ""}|${headingToPickup ? "P" : ""}|${hasDest ? "D" : ""}|${truckKey}`;

  const [pickupRoute, setPickupRoute] = useState<
    Array<[number, number]> | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!headingToPickup || !sel) {
      setPickupRoute(undefined);
      return;
    }
    const pts: Array<[number, number]> = [
      [sel.last_lng as number, sel.last_lat as number],
      [sel.origin_lng as number, sel.origin_lat as number],
    ];
    if (hasDest) pts.push([sel.dest_lng as number, sel.dest_lat as number]);
    roadRouteThrough(pts).then((r) => {
      if (!cancelled) setPickupRoute(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  if (!sel) return {};
  if (headingToPickup) return { route: pickupRoute };
  if (enroute && hasDest) {
    return {
      roadFrom: [sel.last_lng as number, sel.last_lat as number],
      roadTo: [sel.dest_lng as number, sel.dest_lat as number],
    };
  }
  if (hasOrigin && hasDest) {
    return {
      roadFrom: [sel.origin_lng as number, sel.origin_lat as number],
      roadTo: [sel.dest_lng as number, sel.dest_lat as number],
    };
  }
  return {};
}
