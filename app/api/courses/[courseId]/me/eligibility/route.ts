import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, route, uuidParam } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { getStudentEligibility } from "@/lib/eligibility/loader";

/** A student's own progress and certificate eligibility for a course. */
export const GET = route<{ courseId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
    select: { status: true },
  });
  if (!enrollment || enrollment.status !== "ACTIVE")
    throw new ApiError(403, "NOT_ENROLLED");

  const { requirement, requirementVersion, result, review } =
    await getStudentEligibility(db, courseId, user.id);
  return json({
    requirement,
    requirementVersion,
    status: result.status,
    reasons: result.reasons,
    attendance: result.attendance,
    questions: result.questions,
    exam: result.exam,
    review,
  });
});
