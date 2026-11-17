import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { listCertificateExports } from "@/lib/staff/queues";

/** Past exports, newest first. Creating one is POST /api/courses/[courseId]/certificate-exports. */
export const GET = route<{ courseId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "certificate.view", courseId);
  return json(await listCertificateExports(db, courseId), 200, PRIVATE);
});
