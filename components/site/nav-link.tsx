"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/** Navigation link that marks itself as the current page (styled by .nav-link). */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  return (
    <Link href={href} className="nav-link" aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
