import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { loadPermissions, requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { deleteRole, updateRole } from "@/lib/staff/team";
import { updateRoleSchema } from "@/lib/validation/team";

export const PATCH = route<{ roleId: string }>(async (req, { params }) => {
  const user = await requireUser();
  await requirePermission(user, "role.manage");
  const roleId = uuidParam(params.roleId);
  const input = await parseJson(req, updateRoleSchema);
  const actorPerms = await loadPermissions(user.id);
  return json(await updateRole(db, { actorId: user.id, actorPerms, roleId, ...input }), 200, PRIVATE);
});

export const DELETE = route<{ roleId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  await requirePermission(user, "role.manage");
  return json(await deleteRole(db, { actorId: user.id, roleId: uuidParam(params.roleId) }), 200, PRIVATE);
});
