import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { createExamSchema } from "@/lib/validation/staff";
import { createExam } from "@/lib/staff/exams";

/** Create the course's exam as a draft. Add questions, then publish it. */
export const POST = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "exam.create", courseId);
  const input = await parseJson(req, createExamSchema);
  return json(await createExam(db, { courseId, input, actorId: user.id }), 201, PRIVATE);
});
