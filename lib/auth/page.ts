// lib/auth/page.ts
// Session helpers for server-rendered pages.
//
// getPageUser is cached per request: the site layout, the course layout and the page itself
// can all ask for the signed-in user and the work (a Supabase call and a query) is done once.

import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { getOptionalUser, type SessionUser } from "./session";

export const getPageUser = cache(getOptionalUser);

/** The signed-in user, or a redirect to the login page that returns here afterwards. */
export async function requirePageUser(locale: string, next: string): Promise<SessionUser> {
  const user = await getPageUser();
  if (!user) redirect({ href: { pathname: "/login", query: { next } }, locale });
  return user as SessionUser;
}
