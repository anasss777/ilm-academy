import { db } from "@/lib/db";
import { getOptionalUser } from "@/lib/auth/session";
import { route, uuidParam } from "@/lib/api/handler";
import { clientIp, enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { getMaterialAccess } from "@/lib/read/materials";
import { MATERIAL_BUCKET } from "@/lib/storage/rules";
import { createDownloadUrl } from "@/lib/storage/supabase";

/**
 * Redirects to the file. Private files get a signed URL that expires in a minute, so a copied
 * link stops working; the visibility check happens here, on every download.
 */
export const GET = route<{ materialId: string }>(async (req, { params }) => {
  const viewer = await getOptionalUser();
  await enforceRateLimit(db, {
    scope: "material-download",
    subject: viewer?.id ?? clientIp(req),
    limit: 60,
    windowSeconds: 60,
  });

  const access = await getMaterialAccess(db, {
    materialId: uuidParam(params.materialId),
    viewerId: viewer?.id ?? null,
  });
  const location =
    access.kind === "storage"
      ? await createDownloadUrl(MATERIAL_BUCKET, access.path, 60, access.downloadName)
      : access.url;

  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "private, no-store" },
  });
});
