import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { json, parseQuery, route } from "@/lib/api/handler";
import { listPublishedCourses } from "@/lib/read/service";

const query = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

/** Public catalog. Identical for everyone, so it may be cached briefly. */
export const GET = route(async (req) => {
  await enforceRateLimit(db, { scope: "catalog", subject: clientIp(req), limit: 60, windowSeconds: 60 });
  const input = parseQuery(req, query);
  return json(await listPublishedCourses(db, input), 200, {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  });
});
