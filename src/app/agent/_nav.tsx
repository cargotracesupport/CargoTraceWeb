"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dashboard, Package, Users, Locate } from "@/components/icons";

const LINKS = [
  { href: "/agent", label: "Dispatch", exact: true, Icon: Dashboard },
  { href: "/agent/map", label: "Map", exact: false, Icon: Locate },
  { href: "/agent/unassigned", label: "Unassigned", exact: false, Icon: Package },
  { href: "/agent/drivers", label: "Drivers", exact: false, Icon: Users },
];

type Tone = "amber" | "primary";

export default function AgentNav({
  variant = "top",
  unassignedCount = 0,
  mapCount = 0,
}: {
  variant?: "top" | "bottom";
  unassignedCount?: number;
  mapCount?: number;
}) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  // Amber = action required (needs a driver); primary = informational (active count).
  const badgeFor = (href: string): { count: number; tone: Tone } => {
    if (href === "/agent/unassigned" && unassignedCount > 0)
      return { count: unassignedCount, tone: "amber" };
    if (href === "/agent/map" && mapCount > 0)
      return { count: mapCount, tone: "primary" };
    return { count: 0, tone: "amber" };
  };

  const badgeBg = (t: Tone) => (t === "primary" ? "bg-primary" : "bg-amber");

  // Mobile: full-width bottom tab bar (icon over label, large touch targets).
  if (variant === "bottom") {
    return (
      <nav className="mx-auto flex max-w-6xl">
        {LINKS.map(({ href, label, exact, Icon }) => {
          const active = isActive(href, exact);
          const { count, tone } = badgeFor(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted2"
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                {count > 0 ? (
                  <span
                    className={`absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full ${badgeBg(tone)} px-1 text-center text-[9px] font-bold leading-4 text-white`}
                  >
                    {count}
                  </span>
                ) : null}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  // Desktop: horizontal nav row under the header.
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 px-4 py-2">
      {LINKS.map(({ href, label, exact, Icon }) => {
        const active = isActive(href, exact);
        const { count, tone } = badgeFor(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`ct-nav ${active ? "ct-nav-active" : ""}`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
            <span>{label}</span>
            {count > 0 ? (
              <span
                className={`ml-1 min-w-[18px] rounded-full ${badgeBg(tone)} px-1.5 text-center text-[10px] font-bold leading-[18px] text-white`}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
