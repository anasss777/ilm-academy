// lib/ui/admin-context.ts
// The common start of every /admin/courses/[courseId] page: locale, a valid course id, the
// signed-in user, and what that user may do in this course.

import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requirePageUser } from "@/lib/auth/page";
import { parseUuid } from "@/lib/auth/params";
import { getPerms } from "@/lib/auth/page-permissions";
import type { PermissionKey } from "@/lib/auth/permissions";

export async function adminCourseContext<P extends { locale: string; courseId: string }>(
  params: Promise<P>,
  nextSuffix = "",
  need?: PermissionKey,
) {
  const resolved = await params;
  const { locale } = resolved;
  setRequestLocale(locale);

  const courseId = parseUuid(resolved.courseId);
  if (!courseId) notFound();

  const user = await requirePageUser(locale, `/admin/courses/${courseId}${nextSuffix}`);
  const perms = await getPerms(user.id, courseId);
  if (perms.size === 0 || (need && !perms.has(need))) redirect({ href: "/admin/no-access", locale });

  return {
    ...resolved,
    locale,
    courseId: courseId as string,
    user,
    perms,
    base: `/admin/courses/${courseId}`,
  };
}
