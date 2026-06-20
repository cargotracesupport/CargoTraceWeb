import Link from "next/link";
import { requireRole } from "@/lib/auth";

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
          <Link href="/driver" className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green shadow-[0_0_0_4px_rgba(0,230,118,0.18)]" />
            <span className="text-sm font-semibold tracking-tight">CargoTrace</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="max-w-[40vw] truncate text-sm text-muted2">
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

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
