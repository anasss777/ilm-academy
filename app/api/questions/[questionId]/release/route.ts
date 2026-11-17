import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfQuestion } from "@/lib/api/resolve";
import { releaseGrades } from "@/lib/grading/service";

/** Publish every held grade for a question. */
export const POST = route<{ questionId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const questionId = uuidParam(params.questionId);
  await requirePermission(
    user,
    "submission.grade",
    await courseIdOfQuestion(questionId),
  );
  return json(await releaseGrades(db, { questionId, actorId: user.id }));
});
