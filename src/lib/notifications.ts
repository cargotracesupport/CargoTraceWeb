// Server-side notification creation for app-driven events (e.g. a driver
// turning off location). Delivery lifecycle events (created / picked-up /
// en-route / delivered / cancelled) are created by a DB trigger — see
// supabase/migrations/0018_notifications.sql. Uses the service-role client so
// one user's action can notify others in the same org.

import { createAdminClient } from "@/lib/supabase/admin";

export interface NotifyRow {
  orgId: string;
  recipientRole?: "admin" | "agent" | "driver" | "customer" | null;
  recipientId?: string | null;
  deliveryId?: string | null;
  type: string;
  title: string;
  body?: string | null;
}

export async function notify(rows: NotifyRow[]): Promise<void> {
  if (!rows.length) return;
  const supabase = createAdminClient();
  await supabase.from("notifications").insert(
    rows.map((r) => ({
      org_id: r.orgId,
      recipient_role: r.recipientRole ?? null,
      recipient_id: r.recipientId ?? null,
      delivery_id: r.deliveryId ?? null,
      type: r.type,
      title: r.title,
      body: r.body ?? null,
    })),
  );
}
