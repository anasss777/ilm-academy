// lib/auth/page-permissions.ts
// Permission checks for server-rendered admin pages. The API routes enforce the same rules on
// every request; this only decides what a page shows (or sends the person to a "no access" page).

import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { loadPermissions, type PermissionKey } from "./permissions";

/** Permissions of one user for one course (or the organization-wide ones when no course). */
export const getPerms = cache((userId: string, courseId?: string) => loadPermissions(userId, courseId));

export async function requirePagePermission(
  locale: string,
  userId: string,
  permission: PermissionKey,
  courseId?: string,
): Promise<Set<string>> {
  const perms = await getPerms(userId, courseId);
  if (!perms.has(permission)) redirect({ href: "/admin/no-access", locale });
  return perms;
}
