import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, route, uuidParam } from "@/lib/api/handler";
import { withdrawFromCourse } from "@/lib/enrollment/service";

/** Withdraw. History (attendance, grades) is kept; re-enrolling restores it. */
export const DELETE = route<{ courseId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { outcome, enrollment } = await withdrawFromCourse(db, {
    userId: user.id,
    courseId: uuidParam(params.courseId),
  });
  return json({ outcome, status: enrollment.status });
});
