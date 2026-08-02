// Driver presence / liveness, derived from the last GPS timestamp. Used by the
// admin dashboard and agent map to flag a driver who has gone quiet mid-trip.

import type { Delivery } from "@/lib/types";

// A driver on an active (en_route) trip is OFFLINE once their last GPS fix is
// older than this. Live drivers ping every few seconds, so a couple of minutes
// of silence means the phone lost signal or the app was closed.
export const OFFLINE_AFTER_MS = 2 * 60 * 1000;

// At or below this speed (km/h) a driver with a fresh fix is treated as stopped.
const MOVING_KMH = 3;

export type Presence = "moving" | "idle" | "offline" | "nosignal";

type PresenceInput = Pick<
  Delivery,
  "status" | "last_position_at" | "last_speed" | "started_at"
>;

/** Live state of the driver on a delivery. Only meaningful while en_route. */
export function presenceOf(d: PresenceInput, now = Date.now()): Presence {
  if (d.status !== "en_route" || !d.last_position_at) return "nosignal";
  const age = now - new Date(d.last_position_at).getTime();
  if (age > OFFLINE_AFTER_MS) return "offline";
  return (d.last_speed ?? 0) > MOVING_KMH ? "moving" : "idle";
}

/** Went offline mid-trip: the trip was started but the GPS has since gone stale. */
export function isOfflineMidTrip(d: PresenceInput, now = Date.now()): boolean {
  return (
    d.status === "en_route" &&
    d.started_at != null &&
    presenceOf(d, now) === "offline"
  );
}

/** Whole minutes since the last fix; null if there has never been one. */
export function lastSeenMinutes(
  d: PresenceInput,
  now = Date.now(),
): number | null {
  if (!d.last_position_at) return null;
  return Math.floor((now - new Date(d.last_position_at).getTime()) / 60000);
}
