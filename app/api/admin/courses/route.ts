import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route } from "@/lib/api/handler";
import { createCourseSchema } from "@/lib/validation/staff";
import { createCourse } from "@/lib/staff/courses";

/** Create a draft course. The creator becomes its first instructor unless instructorIds is sent. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await requirePermission(user, "course.create"); // organization-wide permission
  const input = await parseJson(req, createCourseSchema);
  return json(
    await createCourse(db, { input, actorId: user.id }),
    201,
    PRIVATE,
  );
});
