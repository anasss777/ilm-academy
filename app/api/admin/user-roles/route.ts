import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { loadPermissions, requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route } from "@/lib/api/handler";
import { grantRole } from "@/lib/staff/team";
import { grantRoleSchema } from "@/lib/validation/team";

/** Give someone a role, platform-wide (no courseId) or for one course. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, grantRoleSchema);
  const courseId = input.courseId ?? null;

  await requirePermission(user, "user.manage", courseId ?? undefined);
  const actorPerms = await loadPermissions(user.id, courseId ?? undefined);

  const result = await grantRole(db, { actorId: user.id, actorPerms, userId: input.userId, roleId: input.roleId, courseId });
  return json(result, result.outcome === "GRANTED" ? 201 : 200, PRIVATE);
});
