import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { courseSettingsSchema } from "@/lib/validation/staff";
import { updateCourseSettings } from "@/lib/staff/courses";

/** Late-penalty defaults, partial-attendance weight, answer reveal mode, default visibility. */
export const PUT = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "course.edit", courseId);
  const input = await parseJson(req, courseSettingsSchema);
  return json(await updateCourseSettings(db, { courseId, input, actorId: user.id }), 200, PRIVATE);
});
