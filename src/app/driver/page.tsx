import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";

export default async function DriverHomePage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("deliveries")
    .select("*")
    .order("created_at", { ascending: false });

  const deliveries = (data ?? []) as Delivery[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">My deliveries</h1>
        <p className="text-sm text-muted2">Tap a delivery to view route and update status.</p>
      </div>

      {deliveries.length === 0 ? (
        <div className="ct-card flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm text-muted2">No deliveries assigned yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {deliveries.map((d) => (
            <li key={d.id}>
              <Link
                href={`/driver/deliveries/${d.id}`}
                className="ct-card block transition-colors hover:border-green/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium">{d.reference}</p>
                    <p className="truncate text-sm text-muted2">{d.goods}</p>
                  </div>
                  <DeliveryStatusBadge status={d.status} />
                </div>

                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="truncate text-text">{d.origin_label}</span>
                  <span className="text-muted">→</span>
                  <span className="truncate text-green">{d.dest_label}</span>
                </div>

                {d.customer_name ? (
                  <p className="mt-2 text-xs text-muted">Customer: {d.customer_name}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
