import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { studentSubmissionDto } from "@/lib/api/dto";
import { submitAnswer } from "@/lib/grading/service";

const body = z.object({
  answerText: z.string().max(20_000).nullish(),
  selectedOptionId: z.string().uuid().nullish(),
});

/** Student submits (or edits, before grading and before the deadline) an answer. */
export const POST = route<{ questionId: string }>(async (req, { params }) => {
  const user = await requireUser();
  await enforceRateLimit(db, { scope: "submit", subject: user.id, limit: 30, windowSeconds: 60 });
  const input = await parseJson(req, body);
  // userId always comes from the session, never from the request body
  const submission = await submitAnswer(db, {
    questionId: uuidParam(params.questionId),
    userId: user.id,
    ...input,
  });
  return json(studentSubmissionDto(submission), 201);
});
