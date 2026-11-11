import Link from "next/link";
import { BrandMark } from "@/components/icons";

// Shared pieces of the public legal pages (/privacy, /terms) and the links to
// them in page footers.

export const CONTACT_EMAIL = "support@goodswala.com";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 text-text sm:py-12">
      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        <BrandMark className="h-10 w-10" />
        <p className="text-sm font-bold tracking-tight">
          Goods<span className="text-primary">wala</span>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-xs text-muted2">Last updated {updated}</p>
      </header>

      <article className="ct-card flex flex-col gap-8 p-5 text-sm leading-relaxed sm:p-8">
        {children}
      </article>

      <p className="mt-6 text-center text-xs text-muted2">
        <LegalLinks />
      </p>
    </main>
  );
}

/** The "In short" box at the top of a legal page. */
export function Summary({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h2 className="mb-2 text-base font-semibold tracking-tight">In short</h2>
      <ul className="list-disc space-y-1.5 pl-5">{children}</ul>
    </section>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function Sub({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export function Mail() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {CONTACT_EMAIL}
    </a>
  );
}

const linkCls = "underline-offset-2 hover:text-text hover:underline";

/** "Privacy Policy · Terms of Use" for page footers. */
export function LegalLinks() {
  return (
    <>
      <Link href="/privacy" className={linkCls}>
        Privacy Policy
      </Link>
      {" · "}
      <Link href="/terms" className={linkCls}>
        Terms of Use
      </Link>
    </>
  );
}
