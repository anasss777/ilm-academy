// lib/ratelimit/ratelimit.ts
// Fixed-window rate limiting backed by the existing Postgres database: no extra service, works
// across serverless instances. One atomic upsert per limited request.
//
//  - Fails OPEN: if the counter cannot be updated, the request goes through (and is logged).
//    A broken limiter must never lock students out of their exam.
//  - Keys are "scope:subject". Use the user id when signed in, the client IP otherwise.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "../api/errors";

export function windowStartFor(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export function rateLimitDecision(args: { count: number; limit: number; now: Date; windowSeconds: number }) {
  const { count, limit, now, windowSeconds } = args;
  const resetsAt = windowStartFor(now, windowSeconds).getTime() + windowSeconds * 1000;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetsAt - now.getTime()) / 1000)),
  };
}

/** Behind a trusted proxy (Vercel and similar) the first x-forwarded-for entry is the client. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

async function hit(db: PrismaClient, key: string, windowSeconds: number, now: Date): Promise<number> {
  const windowStart = windowStartFor(now, windowSeconds);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = rate_limits."count" + 1
    RETURNING "count"`;
  return Number(rows[0].count);
}

/** Throws 429 (with Retry-After) once `limit` requests have been made in the current window. */
export async function enforceRateLimit(
  db: PrismaClient,
  args: { scope: string; subject: string; limit: number; windowSeconds: number; now?: Date },
): Promise<void> {
  const now = args.now ?? new Date();
  let count: number;
  try {
    count = await hit(db, `${args.scope}:${args.subject}`, args.windowSeconds, now);
  } catch (err) {
    console.error("[ratelimit] counter failed, allowing the request", err);
    return;
  }
  const decision = rateLimitDecision({ count, limit: args.limit, now, windowSeconds: args.windowSeconds });
  if (!decision.allowed) {
    throw new ApiError(429, "RATE_LIMITED", undefined, undefined, {
      "Retry-After": String(decision.retryAfterSeconds),
    });
  }
}
