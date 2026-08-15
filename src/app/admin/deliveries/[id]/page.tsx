import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Delivery } from "@/lib/types";
import DeliveryDetail, {
  type DeliveryDetailData,
} from "@/components/DeliveryDetail";
import { ArrowLeft, Pencil } from "@/components/icons";

// Details are editable only until the trip starts (matches the DB freeze).
const CAN_EDIT = new Set(["awaiting_dropoff", "pending", "assigned"]);

type Row = Delivery & {
  driver: { full_name: string | null; phone: string | null } | null;
  vehicle: DeliveryDetailData["vehicle"];
  agent: { full_name: string | null } | null;
};

export default async function AdminDeliveryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("admin");
  const supabase = createClient();
  const { data } = await supabase
    .from("deliveries")
    .select(
      "*, driver:profiles!deliveries_driver_id_fkey(full_name, phone), vehicle:vehicles(name, plate, length_m, width_m, capacity_kg), agent:profiles!deliveries_agent_id_fkey(full_name)",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const row = data as Row;

  const detail: DeliveryDetailData = {
    delivery: row as Delivery,
    driver: row.driver ?? null,
    vehicle: row.vehicle ?? null,
    agent: row.agent ?? null,
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/deliveries" className="ct-btn-ghost">
          <ArrowLeft className="h-4 w-4" /> Back to deliveries
        </Link>
        {CAN_EDIT.has(row.status) ? (
          <Link
            href={`/admin/deliveries/${row.id}/edit`}
            className="ct-btn-ghost"
          >
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        ) : null}
      </div>
      <DeliveryDetail data={detail} trackHref={`/track/${row.tracking_token}`} />
    </div>
  );
}
