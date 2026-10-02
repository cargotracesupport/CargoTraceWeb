import { headers } from "next/headers";
import CustomerTracker from "@/components/CustomerTracker";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clientIpFrom,
  gateTrackingRequest,
  getPublicDelivery,
  recordTrackingMiss,
} from "@/lib/tracking";

export const dynamic = "force-dynamic";

// Public tracking page (no auth). Looks the delivery up server-side with the
// same customer-safe lookup and rate limit as GET /api/deliveries/{token},
// which the client then polls for live updates. The service-role key stays
// on the server; the browser only ever receives the PublicDelivery shape.
export default async function TrackPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createAdminClient();
  const ip = clientIpFrom(headers());

  const gate = await gateTrackingRequest(supabase, ip, params.token);
  if (gate !== "ok") {
    return (
      <Notice
        title="Too many requests"
        body="Please wait a minute and open your tracking link again."
      />
    );
  }

  const delivery = await getPublicDelivery(supabase, params.token);
  if (!delivery) {
    await recordTrackingMiss(supabase, ip);
    return (
      <Notice
        title="Tracking link not found"
        body="This tracking link is invalid or has expired. Please double-check the link from your sender."
      />
    );
  }

  return <CustomerTracker token={params.token} initial={delivery} />;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-dvh bg-bg text-text flex items-center justify-center p-6">
      <div className="ct-card max-w-sm w-full text-center p-8">
        <div className="text-2xl font-semibold mb-2">
          Goods<span className="text-green">wala</span>
        </div>
        <p className="text-lg font-medium mt-4">{title}</p>
        <p className="text-muted2 mt-2 text-sm">{body}</p>
      </div>
    </main>
  );
}
