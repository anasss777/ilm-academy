import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { courseInstructorsSchema } from "@/lib/validation/staff";
import { setCourseInstructors } from "@/lib/staff/courses";

export const PUT = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "course.edit", courseId);
  const { userIds } = await parseJson(req, courseInstructorsSchema);
  return json(await setCourseInstructors(db, { courseId, userIds, actorId: user.id }), 200, PRIVATE);
});
