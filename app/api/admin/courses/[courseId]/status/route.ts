import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { courseStatusSchema } from "@/lib/validation/staff";
import { transitionCourse } from "@/lib/staff/courses";

/** publish / unpublish need course.publish; archive / unarchive need course.archive. */
export const POST = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  const { action } = await parseJson(req, courseStatusSchema);
  await requirePermission(
    user,
    action === "publish" || action === "unpublish" ? "course.publish" : "course.archive",
    courseId,
  );
  return json(await transitionCourse(db, { courseId, action, actorId: user.id }), 200, PRIVATE);
});
