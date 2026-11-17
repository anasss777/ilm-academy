import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { uploadRequestSchema } from "@/lib/validation/staff";
import { COVER_BUCKET, buildStoragePath, validateUpload } from "@/lib/storage/rules";
import { createUploadUrl } from "@/lib/storage/supabase";

/**
 * Step 1 of setting a course cover: get a signed upload URL for a PNG, JPEG or WebP image.
 * Step 2 is PATCH /api/admin/courses/[courseId] with the returned `path` as coverImagePath.
 * The browser then uploads directly to Supabase with the returned token
 * (supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)).
 */
export const POST = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "course.edit", courseId);
  await enforceRateLimit(db, { scope: "upload-url", subject: user.id, limit: 20, windowSeconds: 60 });

  const { contentType, size } = await parseJson(req, uploadRequestSchema);
  const { ext, materialType } = validateUpload("cover", contentType, size);
  const path = buildStoragePath("cover", courseId, crypto.randomUUID(), ext);
  const upload = await createUploadUrl(COVER_BUCKET, path);

  return json({ bucket: COVER_BUCKET, ...upload, materialType: materialType ?? null }, 201, PRIVATE);
});
