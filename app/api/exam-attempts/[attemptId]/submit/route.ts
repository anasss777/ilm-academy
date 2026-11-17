import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, route, uuidParam } from "@/lib/api/handler";
import { studentAttemptDto } from "@/lib/api/dto";
import { submitAttempt } from "@/lib/exams/service";

export const POST = route<{ attemptId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const attempt = await submitAttempt(db, {
    attemptId: uuidParam(params.attemptId),
    userId: user.id,
  });
  return json(studentAttemptDto(attempt));
});
