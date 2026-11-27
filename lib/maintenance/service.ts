// lib/maintenance/service.ts
// The scheduled job. Safe to run as often as you like; once a day is enough.
//
//  1. Re-sync certificate reviews. Reviews update when something CHANGES, but time passing
//     (a lecture ending) changes every student's attendance denominator without any event.
//  2. Submit exam attempts left in progress after their time ran out (their own time limit or the
//     exam deadline), using their saved answers.
//  3. Delete old rate-limit counters.
//
// One course failing never stops the others.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { syncCertificateReviews } from "../eligibility/loader";
import { finalizeExpiredAttempts } from "../exams/service";

export async function runMaintenance(db: PrismaClient, now: Date = new Date()) {
  const summary = {
    coursesSynced: 0,
    attemptsFinalized: 0,
    rateLimitRowsDeleted: 0,
    errors: [] as { step: string; id: string }[],
  };

  const courses = await db.course.findMany({
    where: { status: "PUBLISHED", certificateEnabled: true },
    select: { id: true },
  });
  for (const c of courses) {
    try {
      await syncCertificateReviews(db, c.id, { now });
      summary.coursesSynced++;
    } catch (err) {
      console.error("[maintenance] sync failed", c.id, err);
      summary.errors.push({ step: "sync", id: c.id });
    }
  }

  const exams = await db.exam.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      // attempts can now also run out on their own time limit, even when the exam has no deadline
      attempts: { some: { status: "IN_PROGRESS" } },
      course: { status: { in: ["PUBLISHED", "ARCHIVED"] } },
    },
    select: { id: true },
  });
  for (const e of exams) {
    try {
      const r = await finalizeExpiredAttempts(db, { examId: e.id, now });
      summary.attemptsFinalized += r.finalized;
    } catch (err) {
      console.error("[maintenance] finalize failed", e.id, err);
      summary.errors.push({ step: "finalize", id: e.id });
    }
  }

  try {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const del = await db.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
    summary.rateLimitRowsDeleted = del.count;
  } catch (err) {
    console.error("[maintenance] rate-limit cleanup failed", err);
    summary.errors.push({ step: "cleanup", id: "rate_limits" });
  }

  return summary;
}
