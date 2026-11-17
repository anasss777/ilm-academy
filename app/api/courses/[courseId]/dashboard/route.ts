import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PRIVATE, json, route, uuidParam } from "@/lib/api/handler";
import { getCourseDashboard } from "@/lib/read/service";

export const GET = route<{ courseId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const data = await getCourseDashboard(db, { userId: user.id, courseId: uuidParam(params.courseId) });
  return json(data, 200, PRIVATE);
});
