import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { staffSubmissionDto } from "@/lib/api/dto";
import { courseIdOfSubmission } from "@/lib/api/resolve";
import { gradeSubmission } from "@/lib/grading/service";

const body = z.object({
  rawScore: z.number().finite(),
  feedback: z.string().max(5_000).nullish(),
  penaltyType: z.enum(["NONE", "PERCENT", "POINTS"]).optional(),
  penaltyValue: z.number().finite().optional(),
  release: z.boolean().optional(),
});

export const PUT = route<{ submissionId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const submissionId = uuidParam(params.submissionId);
  await requirePermission(
    user,
    "submission.grade",
    await courseIdOfSubmission(submissionId),
  );
  const input = await parseJson(req, body);
  const graded = await gradeSubmission(db, {
    submissionId,
    actorId: user.id,
    ...input,
  });
  return json(staffSubmissionDto(graded));
});
