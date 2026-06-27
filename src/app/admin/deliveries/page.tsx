import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import SimulateButton from "@/components/SimulateButton";
import DeleteButton from "@/components/DeleteButton";
import { Plus, Pencil, Locate } from "@/components/icons";

type DeliveryRow = Delivery & {
  driver: { full_name: string | null } | null;
  agent: { full_name: string | null } | null;
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

function originOf(d: DeliveryRow) {
  return d.origin_lat != null && d.origin_lng != null
    ? { lat: d.origin_lat, lng: d.origin_lng }
    : null;
}
function destOf(d: DeliveryRow) {
  return d.dest_lat != null && d.dest_lng != null
    ? { lat: d.dest_lat, lng: d.dest_lng }
    : null;
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-3 text-[11px] font-semibold uppercase tracking-[1.2px] text-muted2 ${className}`}
    >
      {children}
    </th>
  );
}

function RowActions({ d }: { d: DeliveryRow }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/admin/deliveries/${d.id}/edit`}
        title="Edit delivery"
        className="ct-btn-ghost px-2 py-1 text-xs"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Link>
      <Link
        href={`/track/${d.tracking_token}`}
        target="_blank"
        rel="noreferrer"
        title="Open tracker"
        className="ct-btn-ghost px-2 py-1 text-xs"
      >
        <Locate className="h-3.5 w-3.5" />
      </Link>
      <SimulateButton deliveryId={d.id} origin={originOf(d)} dest={destOf(d)} />
      <DeleteButton
        table="deliveries"
        id={d.id}
        confirmText="Delete this delivery? This removes its tracking history."
        label=""
      />
    </div>
  );
}

export default async function AdminDeliveriesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("deliveries")
    .select(
      "*, driver:profiles!deliveries_driver_id_fkey(full_name), agent:profiles!deliveries_agent_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false });

  const deliveries = (data ?? []) as DeliveryRow[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Deliveries</h1>
          <p className="text-sm text-muted2">
            All deliveries for your organization.
          </p>
        </div>
        <Link href="/admin/deliveries/new" className="ct-btn-primary">
          <Plus className="h-4 w-4" /> New delivery
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
        <>
          {/* Desktop: table */}
          <div className="ct-card hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Reference</Th>
                    <Th>Route</Th>
                    <Th>Customer</Th>
                    <Th>Status</Th>
                    <Th>Driver</Th>
                    <Th>Created</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="transition-colors hover:bg-s2/60">
                      <td className="px-3 py-3 align-top">
                        <p className="font-mono font-medium">
                          {d.reference ?? "—"}
                        </p>
                        <p className="max-w-[200px] truncate text-xs text-muted2">
                          {d.goods}
                        </p>
                        {d.agent?.full_name ? (
                          <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-muted">
                            Agent: {d.agent.full_name}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="max-w-[140px] truncate text-text">
                            {d.origin_label ?? "—"}
                          </span>
                          <span className="text-muted">→</span>
                          <span className="max-w-[140px] truncate text-green">
                            {d.dest_label ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-muted2">
                        {d.customer_name ?? "—"}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <DeliveryStatusBadge status={d.status} />
                      </td>
                      <td className="px-3 py-3 align-top text-muted2">
                        {d.driver?.full_name ?? (
                          <span className="text-muted">Unassigned</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-xs text-muted">
                        {fmtDate(d.created_at)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <RowActions d={d} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile / tablet: cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {deliveries.map((d) => (
              <div key={d.id} className="ct-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium">
                      {d.reference ?? "—"}
                    </p>
                    <p className="truncate text-xs text-muted2">{d.goods}</p>
                    {d.agent?.full_name ? (
                      <p className="truncate text-[11px] text-muted">
                        Agent: {d.agent.full_name}
                      </p>
                    ) : null}
                  </div>
                  <DeliveryStatusBadge status={d.status} />
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-sm">
                  <span className="min-w-0 truncate">{d.origin_label ?? "—"}</span>
                  <span className="shrink-0 text-muted">→</span>
                  <span className="min-w-0 truncate text-green">
                    {d.dest_label ?? "—"}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                  <span className="truncate">
                    {d.customer_name ?? "No customer"}
                  </span>
                  <span className="shrink-0 font-mono">
                    {fmtDate(d.created_at)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                  <RowActions d={d} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
