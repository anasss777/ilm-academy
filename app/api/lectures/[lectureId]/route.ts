import { db } from "@/lib/db";
import { getOptionalUser } from "@/lib/auth/session";
import { clientIp, enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { PRIVATE, json, route, uuidParam } from "@/lib/api/handler";
import { getLectureDetail } from "@/lib/read/service";

/** Lecture page. Recordings follow their visibility; zoom details only for enrolled students. */
export const GET = route<{ lectureId: string }>(async (req, { params }) => {
  const viewer = await getOptionalUser();
  await enforceRateLimit(db, { scope: "lecture-page", subject: viewer?.id ?? clientIp(req), limit: 120, windowSeconds: 60 });
  const data = await getLectureDetail(db, {
    lectureId: uuidParam(params.lectureId),
    viewerId: viewer?.id ?? null,
  });
  return json(data, 200, PRIVATE);
});
