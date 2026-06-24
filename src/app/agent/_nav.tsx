"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dashboard, Users } from "@/components/icons";

const LINKS = [
  { href: "/agent", label: "Dispatch", exact: true, Icon: Dashboard },
  { href: "/agent/drivers", label: "Drivers", exact: false, Icon: Users },
];

export default function AgentNav() {
  const pathname = usePathname();

  return (
    <nav className="mx-auto flex max-w-6xl gap-1 px-4 py-2">
      {LINKS.map(({ href, label, exact, Icon }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/");

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
