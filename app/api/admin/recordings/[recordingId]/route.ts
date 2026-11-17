import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfRecording } from "@/lib/api/resolve";
import { updateRecordingSchema } from "@/lib/validation/staff";
import { deleteRecording, updateRecording } from "@/lib/staff/media";

export const PATCH = route<{ recordingId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const recordingId = uuidParam(params.recordingId);
  await requirePermission(user, "recording.manage", await courseIdOfRecording(recordingId));
  const input = await parseJson(req, updateRecordingSchema);
  return json(await updateRecording(db, { recordingId, input, actorId: user.id }), 200, PRIVATE);
});

export const DELETE = route<{ recordingId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const recordingId = uuidParam(params.recordingId);
  await requirePermission(user, "recording.manage", await courseIdOfRecording(recordingId));
  return json(await deleteRecording(db, { recordingId, actorId: user.id }), 200, PRIVATE);
});
