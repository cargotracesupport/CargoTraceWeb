"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DeliveryStatus } from "@/lib/types";
import ShareLocationButton from "@/components/ShareLocationButton";

export default function DriverActions({
  deliveryId,
  status,
  driverId,
}: {
  deliveryId: string;
  status: DeliveryStatus;
  driverId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // driverId is accepted for parity with the delivery context; RLS scopes the
  // update to this driver's own delivery, so we don't need it in the payload.
  void driverId;

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("deliveries")
      .update(patch)
      .eq("id", deliveryId);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="ct-card flex flex-col gap-3 p-4">
      {status === "assigned" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            update({ status: "en_route", started_at: new Date().toISOString() })
          }
          className="ct-btn-primary w-full py-3 text-base disabled:opacity-60"
        >
          {busy ? "Starting…" : "Start trip"}
        </button>
      ) : null}

      {status === "en_route" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            update({ status: "delivered", delivered_at: new Date().toISOString() })
          }
          className="ct-btn-primary w-full py-3 text-base disabled:opacity-60"
        >
          {busy ? "Saving…" : "Mark delivered"}
        </button>
      ) : null}

      {status === "delivered" ? (
        <p className="text-center text-sm text-green">This delivery is complete.</p>
      ) : null}

      {status === "awaiting_dropoff" ? (
        <div className="flex flex-col items-center gap-1 rounded-xl bg-amber/10 px-3 py-3 text-center">
          <p className="text-sm font-semibold text-amber">
            Waiting for drop-off location
          </p>
          <p className="text-xs text-muted2">
            The customer hasn&rsquo;t set their drop-off yet. You can start the
            trip once they do.
          </p>
        </div>
      ) : null}

      {status === "pending" ? (
        <p className="text-center text-sm text-muted2">
          Waiting to be assigned a vehicle.
        </p>
      ) : null}

      {status === "cancelled" ? (
        <p className="text-center text-sm text-red">This delivery was cancelled.</p>
      ) : null}

      {error ? <p className="text-center text-sm text-red">{error}</p> : null}

      <div className="border-t border-border pt-3">
        <ShareLocationButton deliveryId={deliveryId} />
        <p className="mt-2 text-xs text-muted">
          Interim: shares your phone GPS while this screen is open. Replaced by the
          vehicle&apos;s GPS hardware later.
        </p>
      </div>
    </div>
  );
}
