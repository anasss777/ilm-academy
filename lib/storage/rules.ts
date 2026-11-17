// lib/storage/rules.ts
// Pure rules for file uploads. Files go straight from the browser to Supabase Storage through
// a short-lived signed upload URL, so the server never handles the bytes, but it decides
// which files are allowed and where they may be stored.
//
//  - The storage path is generated here (course id + random id + extension), never taken from
//    the user, and it is pure ASCII. Display names live in the material's title.
//  - The extension comes from the content type. ALSO set allowed MIME types and a size limit
//    on the bucket itself in Supabase: a client can claim any content type.

import { GradingError } from "../grading/grading";
import { isSafeStoragePath } from "../staff/rules";

export const MATERIAL_BUCKET = "course-materials"; // private
export const COVER_BUCKET = "course-covers"; // public: cover images are shown on the public page

export type UploadKind = "material" | "cover";
export type MaterialKind = "PDF" | "DOC" | "OTHER";

const MATERIAL_TYPES: Record<string, { ext: string; materialType: MaterialKind }> = {
  "application/pdf": { ext: "pdf", materialType: "PDF" },
  "application/msword": { ext: "doc", materialType: "DOC" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", materialType: "DOC" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", materialType: "OTHER" },
};
const COVER_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

const bad = (message: string) => new GradingError("INVALID_UPLOAD", message);

export function validateUpload(
  kind: UploadKind,
  contentType: string,
  size: number,
): { ext: string; materialType?: MaterialKind } {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (!Number.isInteger(size) || size <= 0) throw bad("File size must be a positive whole number of bytes");

  if (kind === "material") {
    const t = MATERIAL_TYPES[type];
    if (!t) throw bad("Only PDF, Word (doc, docx) and PowerPoint (pptx) files are allowed");
    if (size > MAX_MATERIAL_BYTES) throw bad("Files can be at most 25 MB");
    return { ext: t.ext, materialType: t.materialType };
  }

  const ext = COVER_TYPES[type];
  if (!ext) throw bad("Cover images must be PNG, JPEG or WebP");
  if (size > MAX_COVER_BYTES) throw bad("Cover images can be at most 5 MB");
  return { ext };
}

const prefixFor = (kind: UploadKind, courseId: string) =>
  kind === "material" ? `courses/${courseId}/` : `covers/${courseId}/`;

export function buildStoragePath(kind: UploadKind, courseId: string, id: string, ext: string): string {
  return `${prefixFor(kind, courseId)}${id}.${ext}`;
}

/** A stored path may only point into its own course's folder (never someone else's files). */
export function isStoragePathForCourse(kind: UploadKind, path: string, courseId: string): boolean {
  return path.startsWith(prefixFor(kind, courseId)) && isSafeStoragePath(path);
}

/** Public URL of a cover image (the cover bucket is public). */
export function coverImageUrl(supabaseUrl: string, path: string | null): string | null {
  return path ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${COVER_BUCKET}/${path}` : null;
}
