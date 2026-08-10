import type { DeliveryStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

const STYLES: Record<DeliveryStatus, string> = {
  awaiting_dropoff: "bg-amber/10 text-amber",
  pending: "bg-muted/10 text-muted2",
  assigned: "bg-blue/10 text-blue",
  en_route: "bg-green/10 text-green",
  delivered: "bg-green/20 text-green",
  cancelled: "bg-red/10 text-red",
};

export default function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span className={`ct-pill ${STYLES[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}
