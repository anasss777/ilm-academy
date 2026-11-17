import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { z } from "zod";
import { PRIVATE, json, parseJson, parseQuery, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { staffEnrollSchema } from "@/lib/validation/staff";
import { listCourseStudents, staffEnrollStudent } from "@/lib/staff/students";

const query = z.object({
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  status: z.enum(["ACTIVE", "WITHDRAWN"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Paginated student list: search by name or email, filter by status. */
export const GET = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "student.view", courseId);
  const input = parseQuery(req, query);
  return json(await listCourseStudents(db, { courseId, ...input }), 200, PRIVATE);
});

/** Enroll an existing account by email. */
export const POST = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "enrollment.manage", courseId);
  const { email } = await parseJson(req, staffEnrollSchema);
  const result = await staffEnrollStudent(db, { courseId, email, actorId: user.id });
  return json(result, result.outcome === "ALREADY_ENROLLED" ? 200 : 201, PRIVATE);
});
