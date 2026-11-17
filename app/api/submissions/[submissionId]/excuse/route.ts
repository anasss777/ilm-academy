import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { staffSubmissionDto } from "@/lib/api/dto";
import { courseIdOfSubmission } from "@/lib/api/resolve";
import { setExcuse } from "@/lib/grading/service";

const body = z.object({
  granted: z.boolean(),
  reason: z.string().max(1_000).nullish(),
});

/** Grant or revoke a late-penalty excuse. A reason is required when granting. */
export const PUT = route<{ submissionId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const submissionId = uuidParam(params.submissionId);
  await requirePermission(
    user,
    "submission.extend",
    await courseIdOfSubmission(submissionId),
  );
  const input = await parseJson(req, body);
  const updated = await setExcuse(db, {
    submissionId,
    actorId: user.id,
    ...input,
  });
  return json(staffSubmissionDto(updated));
});
