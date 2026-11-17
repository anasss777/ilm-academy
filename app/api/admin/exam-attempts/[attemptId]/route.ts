import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfExamAttempt } from "@/lib/api/resolve";
import { getAttemptForGrader } from "@/lib/staff/queues";

/** One attempt with every answer, the question, and the answer key. */
export const GET = route<{ attemptId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const attemptId = uuidParam(params.attemptId);
  await requirePermission(user, "exam.grade", await courseIdOfExamAttempt(attemptId));
  return json(await getAttemptForGrader(db, attemptId), 200, PRIVATE);
});
