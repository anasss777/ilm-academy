import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { courseContentSchema } from "@/lib/validation/staff";
import { replaceCourseContent } from "@/lib/staff/courses";

/** Replace the learning objectives and/or the FAQ list. */
export const PUT = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "course.edit", courseId);
  const input = await parseJson(req, courseContentSchema);
  return json(await replaceCourseContent(db, { courseId, input, actorId: user.id }), 200, PRIVATE);
});
