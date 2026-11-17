import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfExam } from "@/lib/api/resolve";
import { updateExamSchema } from "@/lib/validation/staff";
import { deleteExam, getExamForStaff, updateExam } from "@/lib/staff/exams";

export const GET = route<{ examId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const examId = uuidParam(params.examId);
  await requirePermission(user, "exam.edit", await courseIdOfExam(examId));
  return json(await getExamForStaff(db, examId), 200, PRIVATE);
});

export const PATCH = route<{ examId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const examId = uuidParam(params.examId);
  await requirePermission(user, "exam.edit", await courseIdOfExam(examId));
  const input = await parseJson(req, updateExamSchema);
  return json(await updateExam(db, { examId, input, actorId: user.id }), 200, PRIVATE);
});

/** Only while nobody has attempted it. */
export const DELETE = route<{ examId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const examId = uuidParam(params.examId);
  await requirePermission(user, "exam.edit", await courseIdOfExam(examId));
  return json(await deleteExam(db, { examId, actorId: user.id }), 200, PRIVATE);
});
