import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { assertCourseExists } from "@/lib/api/resolve";
import { enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { uploadRequestSchema } from "@/lib/validation/staff";
import { MATERIAL_BUCKET, buildStoragePath, validateUpload } from "@/lib/storage/rules";
import { createUploadUrl } from "@/lib/storage/supabase";

/**
 * Step 1 of attaching a file: get a signed upload URL for a PDF or Word/PowerPoint document.
 * Step 2 is POST /api/admin/courses/[courseId]/materials with the returned `path` as storagePath.
 * The browser then uploads directly to Supabase with the returned token
 * (supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)).
 */
export const POST = route<{ courseId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const courseId = uuidParam(params.courseId);
  await assertCourseExists(courseId);
  await requirePermission(user, "material.manage", courseId);
  await enforceRateLimit(db, { scope: "upload-url", subject: user.id, limit: 20, windowSeconds: 60 });

  const { contentType, size } = await parseJson(req, uploadRequestSchema);
  const { ext, materialType } = validateUpload("material", contentType, size);
  const path = buildStoragePath("material", courseId, crypto.randomUUID(), ext);
  const upload = await createUploadUrl(MATERIAL_BUCKET, path);

  return json({ bucket: MATERIAL_BUCKET, ...upload, materialType: materialType ?? null }, 201, PRIVATE);
});
