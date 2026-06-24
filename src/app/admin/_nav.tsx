"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dashboard, Package, Truck, UserCog } from "@/components/icons";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true, Icon: Dashboard },
  { href: "/admin/deliveries", label: "Deliveries", exact: false, Icon: Package },
  { href: "/admin/agents", label: "Agents", exact: false, Icon: UserCog },
  { href: "/admin/fleet", label: "Fleet", exact: false, Icon: Truck },
];

export default function AdminNav({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "bottom";
}) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  // Mobile: full-width bottom tab bar (icon over label, large touch targets).
  if (variant === "bottom") {
    return (
      <nav className="flex">
        {LINKS.map(({ href, label, exact, Icon }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted2"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  // Desktop: vertical sidebar nav.
  return (
    <nav className="flex flex-col gap-1 p-3">
      {LINKS.map(({ href, label, exact, Icon }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`ct-nav ${active ? "ct-nav-active" : ""}`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
