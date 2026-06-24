import { requireRole } from "@/lib/auth";
import AdminNav from "./_nav";
import { BrandMark, Wordmark, LiveDot, Avatar } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";

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
            <span className="ct-pill ml-1 hidden bg-primary/10 text-primary sm:inline-flex">
              <LiveDot />
              LIVE
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden max-w-[40vw] truncate text-sm text-muted2 sm:inline">
              {session.profile.full_name}
            </span>
            <Avatar name={session.profile.full_name ?? "?"} size={30} />
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Sidebar (desktop) */}
      <aside className="fixed bottom-0 left-0 top-14 z-20 hidden w-52 border-r border-border bg-s1/60 md:block">
        <AdminNav variant="sidebar" />
      </aside>

      <main className="pt-14 md:pl-52">
        <div className="p-4 pb-24 md:pb-4">{children}</div>
      </main>

      {/* Mobile: fixed bottom tab bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-s1/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <AdminNav variant="bottom" />
      </div>
    </div>
  );
}
