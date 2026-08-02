"use client";

import type { Delivery } from "@/lib/types";
import { isOfflineMidTrip, lastSeenMinutes } from "@/lib/presence";

type Row = Delivery & { driver?: { full_name: string | null } | null };

/**
 * Banner shown to admins/agents when one or more drivers have gone offline
 * *after starting a trip* — i.e. their GPS was live and has since gone silent.
 * Each entry links to the delivery so its last-known position can be inspected.
 */
export default function OfflineSummary({
  deliveries,
  now,
  onSelect,
}: {
  deliveries: Row[];
  now: number;
  onSelect?: (id: string) => void;
}) {
  const offline = deliveries.filter((d) => isOfflineMidTrip(d, now));
  if (offline.length === 0) return null;

  return (
    <div className="ct-card border-red/40 bg-red/5 p-3">
      <div className="flex items-center gap-2">
        <WarnIcon />
        <h3 className="text-sm font-semibold text-red">
          {offline.length} driver{offline.length > 1 ? "s" : ""} went offline
          mid-trip
        </h3>
      </div>
      <p className="mt-0.5 text-xs text-muted2">
        The trip was started but the driver&rsquo;s GPS has gone silent. Their
        last known position is still on the map.
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {offline.map((d) => {
          const mins = lastSeenMinutes(d, now);
          const leg =
            d.picked_up_at == null ? "heading to pickup" : "carrying the goods";
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect?.(d.id)}
                className="w-full rounded-lg border border-red/25 bg-s1 px-3 py-2 text-left transition-colors hover:border-red/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm font-medium">
                    {d.reference ?? "—"}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-red">
                    {mins == null ? "no signal" : `last seen ${mins} min ago`}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted2">
                  {d.driver?.full_name ?? "Driver"} &middot; was {leg}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WarnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-red"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
