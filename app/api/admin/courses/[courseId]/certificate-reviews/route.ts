import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { z } from "zod";
import { PRIVATE, json, parseQuery, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { listCertificateReviews } from "@/lib/staff/queues";

const query = z.object({
  status: z.enum(["PENDING", "AUTO_ELIGIBLE", "AUTO_INELIGIBLE", "APPROVED", "REJECTED"]).optional(),
  needsReReview: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Every active student with the stored review status and the live numbers behind it. */
export const GET = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "certificate.view", courseId);
  const input = parseQuery(req, query);
  return json(await listCertificateReviews(db, { courseId, ...input }), 200, PRIVATE);
});
