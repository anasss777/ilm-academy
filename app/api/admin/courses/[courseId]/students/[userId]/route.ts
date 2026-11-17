import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { staffSetEnrollmentSchema } from "@/lib/validation/staff";
import { staffSetEnrollment } from "@/lib/staff/students";

/** Withdraw or reactivate a student. Their history is kept either way. */
export const PATCH = route<{ courseId: string; userId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  const userId = uuidParam(params.userId);
  await assertCourseExists(courseId);
  await requirePermission(user, "enrollment.manage", courseId);
  const { status } = await parseJson(req, staffSetEnrollmentSchema);
  return json(await staffSetEnrollment(db, { courseId, userId, status, actorId: user.id }), 200, PRIVATE);
});
