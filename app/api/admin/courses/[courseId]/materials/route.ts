import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { createMaterialSchema } from "@/lib/validation/staff";
import { createMaterial } from "@/lib/staff/media";

/** Attach a PDF/document to the course, or to one lecture via lectureId. */
export const POST = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "material.manage", courseId);
  const input = await parseJson(req, createMaterialSchema);
  return json(await createMaterial(db, { courseId, input, actorId: user.id }), 201, PRIVATE);
});
