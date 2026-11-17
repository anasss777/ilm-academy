import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { updateCourseSchema } from "@/lib/validation/staff";
import { updateCourse } from "@/lib/staff/courses";

export const PATCH = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "course.edit", courseId);
  const input = await parseJson(req, updateCourseSchema);
  return json(await updateCourse(db, { courseId, input, actorId: user.id }), 200, PRIVATE);
});
