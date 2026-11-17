import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { staffAttemptDto } from "@/lib/api/dto";
import { courseIdOfExamAnswer } from "@/lib/api/resolve";
import { gradeExamAnswer } from "@/lib/exams/service";

const body = z.object({
  score: z.number().finite(),
  feedback: z.string().max(5_000).nullish(),
  release: z.boolean().optional(),
});

/** Grade one written answer; the attempt completes when its last open answer is graded. */
export const PUT = route<{ answerId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const answerId = uuidParam(params.answerId);
  await requirePermission(
    user,
    "exam.grade",
    await courseIdOfExamAnswer(answerId),
  );
  const input = await parseJson(req, body);
  const attempt = await gradeExamAnswer(db, {
    answerId,
    actorId: user.id,
    ...input,
  });
  return json(staffAttemptDto(attempt));
});
