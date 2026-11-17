import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfLecture } from "@/lib/api/resolve";
import { createQuestionSchema } from "@/lib/validation/staff";
import { createQuestion, listQuestionsForStaff } from "@/lib/staff/questions";

/** Staff list: includes the answer key and how many students have answered. */
export const GET = route<{ lectureId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const lectureId = uuidParam(params.lectureId);
  await requirePermission(user, "question.edit", await courseIdOfLecture(lectureId));
  return json(await listQuestionsForStaff(db, { kind: "lecture", lectureId }), 200, PRIVATE);
});

export const POST = route<{ lectureId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const lectureId = uuidParam(params.lectureId);
  await requirePermission(user, "question.create", await courseIdOfLecture(lectureId));
  const input = await parseJson(req, createQuestionSchema);
  const created = await createQuestion(db, { parent: { kind: "lecture", lectureId }, input, actorId: user.id });
  return json(created, 201, PRIVATE);
});
