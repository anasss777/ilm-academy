import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, route, uuidParam } from "@/lib/api/handler";
import { studentAttemptDto } from "@/lib/api/dto";
import { startAttempt } from "@/lib/exams/service";

/** Start a new attempt, or resume the one in progress. */
export const POST = route<{ examId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { attempt, resumed } = await startAttempt(db, {
    examId: uuidParam(params.examId),
    userId: user.id,
  });
  return json({ ...studentAttemptDto(attempt), resumed }, resumed ? 200 : 201);
});
