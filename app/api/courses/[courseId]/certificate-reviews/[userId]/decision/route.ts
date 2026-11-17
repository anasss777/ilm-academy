import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { decideCertificate } from "@/lib/eligibility/loader";

const body = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  /** Required when the decision contradicts the automatic result */
  reason: z.string().max(2_000).nullish(),
});

export const POST = route<{ courseId: string; userId: string }>(
  async (req, { params }) => {
    const user = await requireUser();
    const courseId = uuidParam(params.courseId);
    const studentId = uuidParam(params.userId);
    await assertCourseExists(courseId);
    await requirePermission(user, "certificate.review", courseId);
    const input = await parseJson(req, body);
    const review = await decideCertificate(db, {
      courseId,
      userId: studentId,
      actorId: user.id,
      ...input,
    });
    return json({
      status: review.status,
      needsReReview: review.needsReReview,
      requirementVersion: review.requirementVersion,
      overrideReason: review.overrideReason,
    });
  },
);
