import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { loadPermissions, requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, route, uuidParam } from "@/lib/api/handler";
import { revokeRole } from "@/lib/staff/team";

/** Take a role assignment away. */
export const DELETE = route<{ assignmentId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const assignmentId = uuidParam(params.assignmentId);

  const assignment = await db.userRole.findUnique({ where: { id: assignmentId }, select: { courseId: true } });
  if (!assignment) throw new ApiError(404, "NOT_FOUND");

  await requirePermission(user, "user.manage", assignment.courseId ?? undefined);
  const actorPerms = await loadPermissions(user.id, assignment.courseId ?? undefined);
  return json(await revokeRole(db, { actorId: user.id, actorPerms, assignmentId }), 200, PRIVATE);
});
