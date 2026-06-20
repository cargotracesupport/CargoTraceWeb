import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { BrandMark, Wordmark, LogOut, LiveDot } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("driver");

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-s1/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/driver" className="flex items-center gap-2">
              <BrandMark className="h-7 w-7" />
              <Wordmark className="text-sm" />
            </Link>
            <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-muted2 sm:inline">
              Driver
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="ct-pill bg-primary/10 text-primary">
              <LiveDot /> TX
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

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
