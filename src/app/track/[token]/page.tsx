import { headers } from "next/headers";
import CustomerTracker, {
  type PublicDelivery,
} from "@/components/CustomerTracker";

export const dynamic = "force-dynamic";

// Public tracking page (no auth). Thin consumer of the public
// GET /api/deliveries/{token} endpoint — no Supabase access here.
export default async function TrackPage({
  params,
}: {
  params: { token: string };
}) {
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "");

  const res = await fetch(`${origin}/api/deliveries/${params.token}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return (
      <main className="min-h-dvh bg-bg text-text flex items-center justify-center p-6">
        <div className="ct-card max-w-sm w-full text-center p-8">
          <div className="text-2xl font-semibold mb-2">
            Cargo<span className="text-green">Trace</span>
          </div>
          <p className="text-lg font-medium mt-4">Tracking link not found</p>
          <p className="text-muted2 mt-2 text-sm">
            This tracking link is invalid or has expired. Please double-check the
            link from your sender.
          </p>
        </div>
      </main>
    );
  }

  const { delivery } = (await res.json()) as { delivery: PublicDelivery };

  return <CustomerTracker token={params.token} initial={delivery} />;
}
