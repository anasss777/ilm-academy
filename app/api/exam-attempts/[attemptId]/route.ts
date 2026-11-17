import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PRIVATE, json, route, uuidParam } from "@/lib/api/handler";
import { getAttemptForStudent } from "@/lib/read/service";

/** In progress: questions without keys. Submitted: status only. Released: results. */
export const GET = route<{ attemptId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const data = await getAttemptForStudent(db, { userId: user.id, attemptId: uuidParam(params.attemptId) });
  return json(data, 200, PRIVATE);
});
