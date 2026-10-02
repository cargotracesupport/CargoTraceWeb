// Driver presence / liveness, derived from the last GPS fix on the delivery
// (deliveries.last_lat / last_lng / last_speed / last_position_at). Used by the
// admin dashboard and agent map to mark a position as live or stale, and to
// flag a driver who has gone quiet mid-trip.
//
// Units: deliveries.last_speed is METRES PER SECOND (the driver app writes m/s;
// /api/track converts the web driver's km/h before storing). Convert with
// speedKmh() for display or ETA maths.

import type { Delivery } from "@/lib/types";

// A fix older than this is stale: shown greyed with "last seen N min ago",
// never as live. The driver app reports at most every 15 s and only after
// moving 60 m, so a moving driver refreshes well inside this; a driver who
// has stopped (or lost signal) goes stale after 3 minutes.
export const STALE_AFTER_MS = 3 * 60 * 1000;

// At or below this speed (km/h) a driver with a fresh fix is treated as stopped.
const MOVING_KMH = 3;

export type Presence = "moving" | "idle" | "offline" | "nosignal";

type PresenceInput = Pick<
  Delivery,
  "status" | "last_position_at" | "last_speed" | "started_at"
>;

/** m/s (as stored) to km/h. Null stays null. */
export function speedKmh(ms: number | null | undefined): number | null {
  return ms == null ? null : ms * 3.6;
}

/** Milliseconds since the last fix; null if there has never been one. */
export function fixAgeMs(
  lastPositionAt: string | null | undefined,
  now = Date.now(),
): number | null {
  if (!lastPositionAt) return null;
  const t = new Date(lastPositionAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

/** True when there is a fix and it is recent enough to show as live. */
export function isLiveFix(
  lastPositionAt: string | null | undefined,
  now = Date.now(),
): boolean {
  const age = fixAgeMs(lastPositionAt, now);
  return age != null && age <= STALE_AFTER_MS;
}

/** "just now", "14 min ago", "3h ago", "2d ago" — or "never reported". */
export function fixAgeLabel(
  lastPositionAt: string | null | undefined,
  now = Date.now(),
): string {
  const age = fixAgeMs(lastPositionAt, now);
  if (age == null) return "never reported";
  const mins = Math.floor(age / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * State of the truck marker. "nosignal" = never reported, "offline" = the
 * last fix is stale (drawn grey), otherwise moving / idle by speed.
 */
export function presenceOf(d: PresenceInput, now = Date.now()): Presence {
  if (!d.last_position_at) return "nosignal";
  if (!isLiveFix(d.last_position_at, now)) return "offline";
  return (speedKmh(d.last_speed) ?? 0) > MOVING_KMH ? "moving" : "idle";
}

/** Went quiet mid-trip: the trip was started but the GPS fix has gone stale. */
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
  const age = fixAgeMs(d.last_position_at, now);
  return age == null ? null : Math.floor(age / 60000);
}
