import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { z } from "zod";
import { PRIVATE, json, parseJson, parseQuery, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfLecture } from "@/lib/api/resolve";
import { saveAttendanceSchema } from "@/lib/validation/staff";
import { listRoster, saveAttendance } from "@/lib/staff/attendance";

const query = z.object({
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** The class list for one lecture with each student's recorded status (null = not recorded). */
export const GET = route<{ lectureId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const lectureId = uuidParam(params.lectureId);
  await requirePermission(user, "attendance.view", await courseIdOfLecture(lectureId));
  const input = parseQuery(req, query);
  return json(await listRoster(db, { lectureId, ...input }), 200, PRIVATE);
});

/** Save many students at once. `status: null` clears a record. */
export const PUT = route<{ lectureId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const lectureId = uuidParam(params.lectureId);
  await requirePermission(user, "attendance.edit", await courseIdOfLecture(lectureId));
  const { entries } = await parseJson(req, saveAttendanceSchema);
  return json(await saveAttendance(db, { lectureId, entries, actorId: user.id }), 200, PRIVATE);
});
