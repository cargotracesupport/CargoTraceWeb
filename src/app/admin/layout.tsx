import { requireRole } from "@/lib/auth";
import AdminNav from "./_nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("admin");

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Fixed topbar */}
      <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-border bg-s1/95 backdrop-blur">
        <div className="flex h-full items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold tracking-tight">
              Cargo<span className="text-green">Trace</span>
            </span>
            <span className="ct-pill bg-green/10 text-green">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
              LIVE
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[40vw] truncate text-sm text-muted2 sm:inline">
              {session.profile.full_name}
            </span>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="ct-btn-ghost px-3 py-1.5 text-xs">
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Sidebar (desktop) — collapses to a top nav row on mobile */}
      <aside className="fixed bottom-0 left-0 top-14 z-20 hidden w-52 border-r border-border bg-s1/60 md:block">
        <AdminNav />
      </aside>

      {/* Mobile nav row, directly under the topbar */}
      <div className="fixed inset-x-0 top-14 z-20 border-b border-border bg-s1/80 backdrop-blur md:hidden">
        <AdminNav />
      </div>

      <main className="pt-[7rem] md:pl-52 md:pt-14">
        <div className="p-4">{children}</div>
      </main>
    </div>
  );
}
