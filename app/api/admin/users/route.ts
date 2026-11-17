import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { PRIVATE, json, parseQuery, route } from "@/lib/api/handler";
import { hasPermissionAnywhere, searchUsers } from "@/lib/staff/team";
import { searchUsersQuery } from "@/lib/validation/team";

/** Find accounts by name or email, to add them to a team. Needs "user.manage" somewhere. */
export const GET = route(async (req) => {
  const user = await requireUser();
  if (!(await hasPermissionAnywhere(db, user.id, "user.manage"))) throw new ApiError(403, "FORBIDDEN");
  const { q } = parseQuery(req, searchUsersQuery);
  return json({ items: await searchUsers(db, { q }) }, 200, PRIVATE);
});
