import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfQuestion } from "@/lib/api/resolve";
import { grantDeadlineExtension } from "@/lib/grading/service";

const body = z.object({
  userId: z.string().uuid(),
  newDueAt: z.coerce.date(),
  reason: z.string().max(1000).nullish(),
  /** true = also clear the student's existing grade so they can edit and be regraded */
  reopen: z.boolean().optional(),
});

/** Extend (or reopen) one student's deadline for a lecture question. */
export const POST = route<{ questionId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const questionId = uuidParam(params.questionId);
  await requirePermission(
    user,
    "submission.extend",
    await courseIdOfQuestion(questionId),
  );
  const input = await parseJson(req, body);
  const extension = await grantDeadlineExtension(db, {
    questionId,
    actorId: user.id,
    ...input,
  });
  return json({ id: extension.id, newDueAt: extension.newDueAt }, 201);
});
