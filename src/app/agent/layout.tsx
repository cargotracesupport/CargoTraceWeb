import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BrandMark, Wordmark, LogOut, LiveDot } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import AgentNav from "./_nav";
import NewOrderAlert from "./_alert";

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("agent");
  const supabase = createClient();

  // Orders waiting for a driver — shown as a badge on the Unassigned tab.
  const { count } = await supabase
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .is("driver_id", null)
    .not("status", "in", "(delivered,cancelled)");
  const unassignedCount = count ?? 0;

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
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="ct-btn-ghost px-3 py-1.5 text-xs">
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Desktop: nav row under the header */}
      <div className="hidden border-b border-border bg-s1/60 backdrop-blur md:block">
        <AgentNav variant="top" unassignedCount={unassignedCount} />
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 md:pb-4">
        {children}
      </main>

      {/* Mobile: fixed bottom tab bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-s1/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <AgentNav variant="bottom" unassignedCount={unassignedCount} />
      </div>

      {/* New-order chime + toast (fires on any agent page) */}
      <NewOrderAlert orgId={session.profile.org_id} />
    </div>
  );
}
