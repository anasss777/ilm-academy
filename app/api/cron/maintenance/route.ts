import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { PRIVATE, json, route } from "@/lib/api/handler";
import { isAuthorizedCron } from "@/lib/maintenance/cron";
import { runMaintenance } from "@/lib/maintenance/service";

// Vercel Cron calls with GET; other schedulers usually use POST. Both need the bearer secret.
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    throw new ApiError(401, "UNAUTHORIZED");
  }
  return json(await runMaintenance(db), 200, PRIVATE);
}

export const GET = route(async (req) => handle(req));
export const POST = route(async (req) => handle(req));
