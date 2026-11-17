// lib/ui/context.ts
// What every page under /my-courses/[courseId] needs first: the locale, a valid course id,
// and the signed-in user (or a redirect to the login page that comes back here).

import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requirePageUser } from "@/lib/auth/page";
import { parseUuid } from "@/lib/auth/params";

export async function courseContext<P extends { locale: string; courseId: string }>(
  params: Promise<P>,
  nextSuffix = "",
) {
  const resolved = await params;
  const { locale } = resolved;
  setRequestLocale(locale);

  const courseId = parseUuid(resolved.courseId);
  if (!courseId) notFound();

  const user = await requirePageUser(locale, `/my-courses/${courseId}${nextSuffix}`);
  return { ...resolved, locale, courseId: courseId as string, user, base: `/my-courses/${courseId}` };
}
