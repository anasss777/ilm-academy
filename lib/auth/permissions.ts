// lib/auth/permissions.ts
// Server-side authorization. UI hiding is cosmetic; every staff route calls requirePermission.
//
// A role assignment with courseId = NULL applies to every course; with a courseId it applies
// to that course only. Permissions are checked against the course the resource belongs to.

import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { PERMISSION_KEYS, type PermissionKey } from "./permission-keys";

// The list itself lives in permission-keys.ts (no imports there, so tests can use it)
export { PERMISSION_KEYS, type PermissionKey };

export async function loadPermissions(userId: string, courseId?: string): Promise<Set<string>> {
  const rows = await db.userRole.findMany({
    where: {
      userId,
      // Without a course, only organization-wide roles count
      OR: courseId ? [{ courseId: null }, { courseId }] : [{ courseId: null }],
    },
    select: {
      role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
    },
  });
  const keys = new Set<string>();
  for (const r of rows) for (const rp of r.role.permissions) keys.add(rp.permission.key);
  return keys;
}

export async function requirePermission(
  user: { id: string },
  permission: PermissionKey,
  courseId?: string,
): Promise<void> {
  const keys = await loadPermissions(user.id, courseId);
  if (!keys.has(permission)) throw new ApiError(403, "FORBIDDEN");
}
