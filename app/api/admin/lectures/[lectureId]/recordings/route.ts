import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfLecture } from "@/lib/api/resolve";
import { createRecordingSchema } from "@/lib/validation/staff";
import { createRecording } from "@/lib/staff/media";

export const POST = route<{ lectureId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const lectureId = uuidParam(params.lectureId);
  await requirePermission(user, "recording.manage", await courseIdOfLecture(lectureId));
  const input = await parseJson(req, createRecordingSchema);
  return json(await createRecording(db, { lectureId, input, actorId: user.id }), 201, PRIVATE);
});
