import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfLecture } from "@/lib/api/resolve";
import { updateLectureSchema } from "@/lib/validation/staff";
import { deleteLecture, updateLecture } from "@/lib/staff/lectures";

export const PATCH = route<{ lectureId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const lectureId = uuidParam(params.lectureId);
  await requirePermission(user, "lecture.edit", await courseIdOfLecture(lectureId));
  const input = await parseJson(req, updateLectureSchema);
  return json(await updateLecture(db, { lectureId, input, actorId: user.id }), 200, PRIVATE);
});

/** Soft delete: attendance and submissions are kept. */
export const DELETE = route<{ lectureId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const lectureId = uuidParam(params.lectureId);
  await requirePermission(user, "lecture.delete", await courseIdOfLecture(lectureId));
  return json(await deleteLecture(db, { lectureId, actorId: user.id }), 200, PRIVATE);
});
