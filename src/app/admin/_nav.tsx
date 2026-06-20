"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dashboard, Package, Truck } from "@/components/icons";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true, Icon: Dashboard },
  { href: "/admin/deliveries", label: "Deliveries", exact: false, Icon: Package },
  { href: "/admin/fleet", label: "Fleet", exact: false, Icon: Truck },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 p-2 md:flex-col md:gap-1 md:p-3">
      {LINKS.map(({ href, label, exact, Icon }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/");

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`ct-nav flex-1 justify-center md:flex-none md:justify-start ${
              active ? "ct-nav-active" : ""
            }`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
