import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { loadPermissions, requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route } from "@/lib/api/handler";
import { createRole, listRoles } from "@/lib/staff/team";
import { createRoleSchema } from "@/lib/validation/team";

export const GET = route(async () => {
  const user = await requireUser();
  await requirePermission(user, "role.manage");
  return json({ items: await listRoles(db) }, 200, PRIVATE);
});

/** Create a custom role with a chosen set of permissions (only ones you hold yourself). */
export const POST = route(async (req) => {
  const user = await requireUser();
  await requirePermission(user, "role.manage");
  const input = await parseJson(req, createRoleSchema);
  const actorPerms = await loadPermissions(user.id);
  return json(await createRole(db, { actorId: user.id, actorPerms, ...input }), 201, PRIVATE);
});
