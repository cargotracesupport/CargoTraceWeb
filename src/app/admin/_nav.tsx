"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/deliveries", label: "Deliveries", exact: false },
  { href: "/admin/fleet", label: "Fleet", exact: false },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 p-2 md:flex-col md:gap-0.5 md:p-3">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(link.href + "/");

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors md:flex-none ${
              active
                ? "bg-green/10 text-green"
                : "text-muted2 hover:bg-s2 hover:text-text"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
