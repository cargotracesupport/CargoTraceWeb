import { requireRole } from "@/lib/auth";
import AdminNav from "./_nav";
import { BrandMark, Wordmark, LiveDot, LogOut, Avatar } from "@/components/icons";

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
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <Wordmark className="text-base" />
            <span className="ct-pill ml-1 hidden bg-green/10 text-green sm:inline-flex">
              <LiveDot />
              LIVE
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[40vw] truncate text-sm text-muted2 sm:inline">
              {session.profile.full_name}
            </span>
            <Avatar name={session.profile.full_name ?? "?"} size={30} />
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="ct-btn-ghost px-3 py-1.5 text-xs">
                <LogOut className="h-3.5 w-3.5" />
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
