import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { publishCertificateRequirement } from "@/lib/eligibility/loader";

// All three keys are required; null explicitly disables a requirement
const percent = z.number().min(0).max(100).nullable();
const body = z.object({
  minAttendancePercent: percent,
  minQuestionScorePercent: percent,
  minExamPercent: percent,
});

/** Publish a new requirements version. Decided reviews are flagged for re-review. */
export const PUT = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "certificate.configure", courseId);
  const thresholds = await parseJson(req, body);
  const { requirement, sync } = await publishCertificateRequirement(db, {
    courseId,
    thresholds,
    actorId: user.id,
  });
  return json({ version: requirement.version, sync });
});
