import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BrandMark, Wordmark, LiveDot } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import AgentNav from "./_nav";
import NewOrderAlert from "./_alert";

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("agent");
  const supabase = createClient();

  // Tab counts — Unassigned: orders still waiting for a driver.
  //               Map: active deliveries (assigned + en_route) — what the map shows.
  const [{ count: unC }, { count: mC }] = await Promise.all([
    supabase
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .is("driver_id", null)
      .not("status", "in", "(delivered,cancelled)"),
    supabase
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .in("status", ["awaiting_dropoff", "assigned", "en_route"]),
  ]);
  const unassignedCount = unC ?? 0;
  const mapCount = mC ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-border bg-s1/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <BrandMark className="h-7 w-7" />
            <Wordmark className="text-sm" />
            <span className="ml-1 hidden text-[10px] font-semibold uppercase tracking-wide text-muted2 sm:inline">
              Dispatch
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="ct-pill bg-primary/10 text-primary">
              <LiveDot /> LIVE
            </span>
            <span className="hidden max-w-[40vw] truncate text-sm text-muted2 sm:inline">
              {session.profile.full_name}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Desktop: nav row under the header */}
      <div className="hidden border-b border-border bg-s1/60 backdrop-blur md:block">
        <AgentNav
          variant="top"
          unassignedCount={unassignedCount}
          mapCount={mapCount}
        />
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 md:pb-4">
        {children}
      </main>

      {/* Mobile: fixed bottom tab bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-s1/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <AgentNav
          variant="bottom"
          unassignedCount={unassignedCount}
          mapCount={mapCount}
        />
      </div>

      {/* New-order chime + toast (fires on any agent page) */}
      <NewOrderAlert
        orgId={session.profile.org_id}
        agentId={session.profile.id}
      />
    </div>
  );
}
