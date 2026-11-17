import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { z } from "zod";
import { PRIVATE, json, parseQuery, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { listSubmissionQueue } from "@/lib/staff/queues";

const query = z.object({
  status: z.enum(["UNGRADED", "GRADED", "ALL"]).default("UNGRADED"),
  questionId: z.string().uuid().optional(),
  lectureId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** The grading queue: oldest ungraded answers first. */
export const GET = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "submission.view", courseId);
  const input = parseQuery(req, query);
  return json(await listSubmissionQueue(db, { courseId, ...input }), 200, PRIVATE);
});
