import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { saveAnswers } from "@/lib/exams/service";

const body = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedOptionId: z.string().uuid().nullish(),
        answerText: z.string().max(20_000).nullish(),
      }),
    )
    .max(200),
});

/** Autosave: replaces the saved answers for the questions included. Blank clears. */
export const PUT = route<{ attemptId: string }>(async (req, { params }) => {
  const user = await requireUser();
  await enforceRateLimit(db, { scope: "exam-save", subject: user.id, limit: 120, windowSeconds: 60 });
  const { answers } = await parseJson(req, body);
  const result = await saveAnswers(db, {
    attemptId: uuidParam(params.attemptId),
    userId: user.id,
    answers,
  });
  return json(result);
});
