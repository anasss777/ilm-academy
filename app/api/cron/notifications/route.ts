import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { PRIVATE, json, route } from "@/lib/api/handler";
import { isAuthorizedCron } from "@/lib/maintenance/cron";
import { runNotificationJobs } from "@/lib/notifications/jobs";

// Same bearer-secret rule as /api/cron/maintenance. Call it every 15-30 minutes so the
// "lecture starts within the hour" reminder arrives in time (see the setup notes).
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    throw new ApiError(401, "UNAUTHORIZED");
  }
  return json(await runNotificationJobs(db), 200, PRIVATE);
}

export const GET = route(async (req) => handle(req));
export const POST = route(async (req) => handle(req));
