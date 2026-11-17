import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PRIVATE, json, route, uuidParam } from "@/lib/api/handler";
import { getQuestionForStudent } from "@/lib/read/service";

/** A lecture question as the student may see it: no answer key unless the reveal rules allow. */
export const GET = route<{ questionId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const data = await getQuestionForStudent(db, { userId: user.id, questionId: uuidParam(params.questionId) });
  return json(data, 200, PRIVATE);
});
