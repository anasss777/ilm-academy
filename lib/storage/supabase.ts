// lib/storage/supabase.ts
// Server-side Supabase Storage access with the SERVICE ROLE key.
//
// SUPABASE_SERVICE_ROLE_KEY bypasses every security rule: it must only ever exist in server
// environment variables (never NEXT_PUBLIC_, never in client code, never committed).
//
// Setup in the Supabase dashboard (Storage):
//   course-materials  PRIVATE, file size limit 25 MB, allowed MIME types: pdf, doc, docx, pptx
//   course-covers     PUBLIC,  file size limit 5 MB,  allowed MIME types: png, jpeg, webp

import { createClient } from "@supabase/supabase-js";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STORAGE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A one-time URL the browser uploads to directly (valid for about two hours). */
export async function createUploadUrl(bucket: string, path: string) {
  const { data, error } = await admin().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[storage] signed upload url failed", error);
    throw new Error("STORAGE_FAILED");
  }
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/** A short-lived download URL for a private file. */
export async function createDownloadUrl(bucket: string, path: string, seconds: number, downloadName?: string) {
  const { data, error } = await admin()
    .storage.from(bucket)
    .createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) {
    console.error("[storage] signed download url failed", error);
    throw new Error("STORAGE_FAILED");
  }
  return data.signedUrl;
}
