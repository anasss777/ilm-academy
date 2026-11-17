"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/** A tab of the course area; marks itself as current for .tab to style. */
export function TabLink({ href, exact, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className="tab" aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
