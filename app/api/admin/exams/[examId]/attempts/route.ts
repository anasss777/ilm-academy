import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { z } from "zod";
import { PRIVATE, json, parseQuery, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfExam } from "@/lib/api/resolve";
import { listExamAttempts } from "@/lib/staff/queues";

const query = z.object({
  status: z.enum(["IN_PROGRESS", "SUBMITTED", "GRADED"]).optional(),
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Exam grading queue: filter by SUBMITTED to see attempts that still need a grader. */
export const GET = route<{ examId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const examId = uuidParam(params.examId);
  await requirePermission(user, "exam.grade", await courseIdOfExam(examId));
  const input = parseQuery(req, query);
  return json(await listExamAttempts(db, { examId, ...input }), 200, PRIVATE);
});
