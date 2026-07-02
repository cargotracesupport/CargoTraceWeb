import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. SERVER ONLY — bypasses RLS.
 * Use only in route handlers / server actions for trusted operations
 * (GPS ingest, creating driver users, public token lookups).
 * Never import this into a Client Component.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // Supabase queries go through fetch, which Next.js's Data Cache will
      // otherwise cache in production — freezing reads at the first snapshot
      // (e.g. the public tracking API returning a delivery's create-time state
      // forever). Force every request to be uncached so reads are always live.
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
}
