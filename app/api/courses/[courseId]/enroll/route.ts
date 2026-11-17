import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { json, route, uuidParam } from "@/lib/api/handler";
import { enrollInCourse } from "@/lib/enrollment/service";

/** "Enroll for Free". Idempotent: enrolling twice is a success, not an error. */
export const POST = route<{ courseId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  await enforceRateLimit(db, { scope: "enroll", subject: user.id, limit: 20, windowSeconds: 60 });
  const { outcome, enrollment } = await enrollInCourse(db, {
    userId: user.id,
    courseId: uuidParam(params.courseId),
  });
  return json(
    { outcome, enrollmentId: enrollment.id, status: enrollment.status },
    outcome === "ALREADY_ENROLLED" ? 200 : 201,
  );
});
