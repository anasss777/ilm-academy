import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfExam } from "@/lib/api/resolve";
import { createQuestionSchema } from "@/lib/validation/staff";
import { createQuestion, listQuestionsForStaff } from "@/lib/staff/questions";

export const GET = route<{ examId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const examId = uuidParam(params.examId);
  await requirePermission(user, "exam.edit", await courseIdOfExam(examId));
  return json(await listQuestionsForStaff(db, { kind: "exam", examId }), 200, PRIVATE);
});

export const POST = route<{ examId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const examId = uuidParam(params.examId);
  await requirePermission(user, "exam.edit", await courseIdOfExam(examId));
  const input = await parseJson(req, createQuestionSchema);
  const created = await createQuestion(db, { parent: { kind: "exam", examId }, input, actorId: user.id });
  return json(created, 201, PRIVATE);
});
