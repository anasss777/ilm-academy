import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { questionContextOf } from "@/lib/api/resolve";
import { updateQuestionSchema } from "@/lib/validation/staff";
import { deleteQuestion, getQuestionForStaff, updateQuestion } from "@/lib/staff/questions";

// Lecture questions need question.edit; exam questions need exam.edit
async function authorize(questionId: string) {
  const user = await requireUser();
  const ctx = await questionContextOf(questionId);
  await requirePermission(user, ctx.examId ? "exam.edit" : "question.edit", ctx.courseId);
  return user;
}

export const GET = route<{ questionId: string }>(async (_req, { params }) => {
  const questionId = uuidParam(params.questionId);
  await authorize(questionId);
  return json(await getQuestionForStaff(db, questionId), 200, PRIVATE);
});

/** Wording, explanation, deadlines and status can always change; options, correct answer and
 *  points only until a student has answered. */
export const PATCH = route<{ questionId: string }>(async (req, { params }) => {
  const questionId = uuidParam(params.questionId);
  const user = await authorize(questionId);
  const input = await parseJson(req, updateQuestionSchema);
  return json(await updateQuestion(db, { questionId, input, actorId: user.id }), 200, PRIVATE);
});

export const DELETE = route<{ questionId: string }>(async (_req, { params }) => {
  const questionId = uuidParam(params.questionId);
  const user = await authorize(questionId);
  return json(await deleteQuestion(db, { questionId, actorId: user.id }), 200, PRIVATE);
});
