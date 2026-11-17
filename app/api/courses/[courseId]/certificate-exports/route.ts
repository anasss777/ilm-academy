import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { json, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { exportCertificates } from "@/lib/eligibility/loader";

/**
 * Snapshot the approved, up-to-date, consenting candidates. Returns the export id; a
 * download endpoint (CSV/XLSX) will read the stored snapshot rather than recompute it.
 */
export const POST = route<{ courseId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "certificate.export", courseId);
  const { export: exp, skippedNoConsent } = await exportCertificates(db, {
    courseId,
    actorId: user.id,
  });
  return json(
    {
      exportId: exp.id,
      itemCount: exp.itemCount,
      requirementVersion: exp.requirementVersion,
      skippedNoConsent: skippedNoConsent.length,
    },
    201,
  );
});
