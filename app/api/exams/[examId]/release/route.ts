import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfExam } from "@/lib/api/resolve";
import { releaseExamAttempts } from "@/lib/exams/service";

/** Publish every fully graded but unreleased attempt for this exam. */
export const POST = route<{ examId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const examId = uuidParam(params.examId);
  await requirePermission(user, "exam.grade", await courseIdOfExam(examId));
  return json(await releaseExamAttempts(db, { examId, actorId: user.id }));
});
