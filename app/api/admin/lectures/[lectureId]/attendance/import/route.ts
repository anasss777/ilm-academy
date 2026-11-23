import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { applyAttendanceImport, planAttendanceImport, previewOf } from "@/lib/staff/attendance-import-service";
import { importAttendanceSchema } from "@/lib/validation/attendance-import";

/**
 * Import attendance from a file.
 *   dryRun: true  -> returns what WOULD be recorded (nothing is written)
 *   dryRun: false -> records it
 * Needs the attendance.import permission for the lecture's course.
 */
export const POST = route<{ lectureId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const lectureId = uuidParam(params.lectureId);
  const input = await parseJson(req, importAttendanceSchema);

  const lecture = await db.lecture.findFirst({ where: { id: lectureId, deletedAt: null }, select: { courseId: true } });
  if (!lecture) throw new ApiError(404, "NOT_FOUND");
  await requirePermission(user, "attendance.import", lecture.courseId);

  const options = {
    presentPercent: input.presentPercent,
    partialPercent: input.partialPercent,
    absentMissing: input.absentMissing,
    overwriteManual: input.overwriteManual,
  };

  if (input.dryRun) {
    const { parsed, plan } = await planAttendanceImport(db, { lectureId, csv: input.csv, options });
    return json(previewOf(parsed, plan), 200, PRIVATE);
  }
  return json(await applyAttendanceImport(db, { lectureId, csv: input.csv, options, actorId: user.id }), 200, PRIVATE);
});
