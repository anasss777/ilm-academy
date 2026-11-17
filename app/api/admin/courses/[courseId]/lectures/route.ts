import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { createLectureSchema } from "@/lib/validation/staff";
import { createLecture } from "@/lib/staff/lectures";

export const POST = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "lecture.create", courseId);
  const input = await parseJson(req, createLectureSchema);
  return json(await createLecture(db, { courseId, input, actorId: user.id }), 201, PRIVATE);
});
