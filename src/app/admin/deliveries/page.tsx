import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import SimulateButton from "@/components/SimulateButton";
import DeleteButton from "@/components/DeleteButton";

type DeliveryRow = Delivery & {
  driver: { full_name: string | null } | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminDeliveriesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("deliveries")
    .select("*, driver:profiles(full_name)")
    .order("created_at", { ascending: false });

  const deliveries = (data ?? []) as DeliveryRow[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Deliveries</h1>
          <p className="text-sm text-muted2">
            All deliveries for your organization.
          </p>
        </div>
        <Link href="/admin/deliveries/new" className="ct-btn-primary">
          + New delivery
        </Link>
      </div>

      {deliveries.length === 0 ? (
        <div className="ct-card flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-muted2">No deliveries yet.</p>
          <Link href="/admin/deliveries/new" className="ct-btn-ghost">
            Create your first delivery
          </Link>
        </div>
      ) : (
        <div className="ct-card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="ct-label mb-0 px-4 py-3">Reference</th>
                <th className="ct-label mb-0 px-4 py-3">Route</th>
                <th className="ct-label mb-0 px-4 py-3">Customer</th>
                <th className="ct-label mb-0 px-4 py-3">Status</th>
                <th className="ct-label mb-0 px-4 py-3">Driver</th>
                <th className="ct-label mb-0 px-4 py-3">Created</th>
                <th className="ct-label mb-0 px-4 py-3">Tracking</th>
                <th className="ct-label mb-0 px-4 py-3">Simulate</th>
                <th className="ct-label mb-0 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deliveries.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-s2">
                  <td className="px-4 py-3">
                    <p className="font-mono font-medium">{d.reference ?? "—"}</p>
                    <p className="truncate text-xs text-muted2">{d.goods}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="truncate text-text">
                        {d.origin_label ?? "—"}
                      </span>
                      <span className="text-muted">→</span>
                      <span className="truncate text-green">
                        {d.dest_label ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted2">
                    {d.customer_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <DeliveryStatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-muted2">
                    {d.driver?.full_name ?? (
                      <span className="text-muted">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {fmtDate(d.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/track/${d.tracking_token}`}
                      target="_blank"
                      className="font-mono text-xs text-blue hover:underline"
                      title={`/track/${d.tracking_token}`}
                    >
                      /track/{d.tracking_token.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <SimulateButton
                      deliveryId={d.id}
                      origin={
                        d.origin_lat != null && d.origin_lng != null
                          ? { lat: d.origin_lat, lng: d.origin_lng }
                          : null
                      }
                      dest={
                        d.dest_lat != null && d.dest_lng != null
                          ? { lat: d.dest_lat, lng: d.dest_lng }
                          : null
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <DeleteButton
                      table="deliveries"
                      id={d.id}
                      confirmText="Delete this delivery? This removes its tracking history."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
