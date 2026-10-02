"use client";

import type { Delivery } from "@/lib/types";
import { estimateEtaMinutes, formatEta } from "@/lib/eta";
import { fixAgeLabel, isLiveFix, speedKmh } from "@/lib/presence";

type PositionInput = Pick<
  Delivery,
  | "last_lat"
  | "last_lng"
  | "last_speed"
  | "last_position_at"
  | "dest_lat"
  | "dest_lng"
>;

function StatRow({
  label,
  value,
  color = "text-text",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted2">{label}</span>
      <span className={`font-mono text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}

/**
 * The driver's position for one delivery on the staff maps. A fix older than
 * STALE_AFTER_MS is shown as stale ("last seen 14 min ago", no speed or ETA)
 * rather than as a live GPS lock; a delivery that has never reported says so.
 */
export default function PositionCard({
  d,
  now,
}: {
  d: PositionInput;
  now: number;
}) {
  const hasPos = d.last_lat != null && d.last_lng != null;
  if (!hasPos || !d.last_position_at) {
    return (
      <div className="rounded-lg border border-border bg-s2 p-3 text-sm text-muted2">
        No location reported yet. It appears once the driver starts the trip.
      </div>
    );
  }

  const live = isLiveFix(d.last_position_at, now);
  const kmh = speedKmh(d.last_speed);
  const eta =
    live && d.dest_lat != null && d.dest_lng != null
      ? estimateEtaMinutes(
          { lat: d.last_lat as number, lng: d.last_lng as number },
          { lat: d.dest_lat, lng: d.dest_lng },
          kmh,
        )
      : null;

  return (
    <div className="rounded-lg border border-border bg-s2 px-3">
      <div className="flex items-center justify-between border-b border-border/50 py-2.5">
        <span className="ct-label mb-0">
          {live ? "Live position" : "Last known position"}
        </span>
        {live ? (
          <span className="ct-pill bg-green/10 text-green">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
            Live
          </span>
        ) : (
          <span className="ct-pill bg-s3 text-muted2">
            <span className="h-1.5 w-1.5 rounded-full bg-muted" />
            Stale · last seen {fixAgeLabel(d.last_position_at, now)}
          </span>
        )}
      </div>
      <StatRow
        label="Coordinates"
        value={`${(d.last_lat as number).toFixed(4)}°, ${(d.last_lng as number).toFixed(4)}°`}
        color={live ? "text-blue" : "text-muted2"}
      />
      {live && kmh != null ? (
        <StatRow
          label="Speed"
          value={`${Math.round(kmh)} km/h`}
          color="text-green"
        />
      ) : null}
      {live ? (
        <StatRow label="ETA" value={formatEta(eta)} color="text-green" />
      ) : null}
      <StatRow
        label="Updated"
        value={fixAgeLabel(d.last_position_at, now)}
        color={live ? "text-text" : "text-amber"}
      />
    </div>
  );
}
