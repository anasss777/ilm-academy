import { z } from "zod";
import { db } from "@/lib/db";
import { getOptionalUser } from "@/lib/auth/session";
import { clientIp, enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { PRIVATE, json, route } from "@/lib/api/handler";
import { getCourseOverviewBySlug } from "@/lib/read/service";

const slugSchema = z.string().trim().min(1).max(200);

/** Public course page. Works signed out; when signed in it also says whether you are enrolled. */
export const GET = route<{ slug: string }>(async (req, { params }) => {
  let raw = params.slug;
  try {
    raw = decodeURIComponent(raw); // Arabic slugs arrive percent-encoded
  } catch {
    /* already decoded */
  }
  const viewer = await getOptionalUser();
  await enforceRateLimit(db, { scope: "course-page", subject: viewer?.id ?? clientIp(req), limit: 120, windowSeconds: 60 });
  const overview = await getCourseOverviewBySlug(db, {
    slug: slugSchema.parse(raw),
    viewerId: viewer?.id ?? null,
  });
  return json(overview, 200, PRIVATE);
});
