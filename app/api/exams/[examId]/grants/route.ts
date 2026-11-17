import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfExam } from "@/lib/api/resolve";
import { grantExamAttempt } from "@/lib/exams/service";

const body = z.object({
  userId: z.string().uuid(),
  extraAttempts: z.number().int().min(0).max(10).optional(),
  newDueAt: z.coerce.date().nullish(),
  reason: z.string().max(1_000).nullish(),
});

/** Reopen: extra attempts and/or a new deadline for one student. Instructors only. */
export const POST = route<{ examId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const examId = uuidParam(params.examId);
  await requirePermission(user, "exam.reopen", await courseIdOfExam(examId));
  const input = await parseJson(req, body);
  const grant = await grantExamAttempt(db, {
    examId,
    actorId: user.id,
    ...input,
  });
  return json(
    {
      id: grant.id,
      extraAttempts: grant.extraAttempts,
      newDueAt: grant.newDueAt,
    },
    201,
  );
});
