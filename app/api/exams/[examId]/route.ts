import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PRIVATE, json, route, uuidParam } from "@/lib/api/handler";
import { getExamForStudent } from "@/lib/read/service";

/** Exam information and the student's attempts. Questions are never served from here. */
export const GET = route<{ examId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const data = await getExamForStudent(db, { userId: user.id, examId: uuidParam(params.examId) });
  return json(data, 200, PRIVATE);
});
