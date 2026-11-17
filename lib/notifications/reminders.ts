// lib/notifications/reminders.ts
// Time-based notifications. Nothing "happens" when a lecture gets close, so the scheduled job
// looks for them. Safe to run as often as you like: each row has a unique dedupeKey, so a
// student never gets the same reminder twice.
//
//   lecture.upcoming_24h   a lecture starting between 1 and 24 hours from now
//   lecture.upcoming_1h    a lecture starting within the next hour
//   question.due_soon      a lecture question due within 24 hours, not answered yet
//   exam.closing_soon      the exam closing within 24 hours, no attempt submitted yet
//
// The two lecture windows do not overlap, so a lecture created late only gets the one that fits.
// For the 1-hour reminder to be useful the job must run at least every 15-30 minutes.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

const HOUR = 3_600_000;

type Row = { userId: string; type: string; payload: Record<string, string>; dedupeKey: string };

async function insertRows(db: PrismaClient, rows: Row[]): Promise<number> {
  let created = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const result = await db.notification.createMany({
      data: rows.slice(i, i + 500).map((r) => ({
        userId: r.userId,
        type: r.type,
        payload: r.payload,
        dedupeKey: r.dedupeKey,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
}

/** ACTIVE students of a course whose accounts are active; `extra` narrows further. */
async function activeEnrollees(db: PrismaClient, courseId: string, extra: Prisma.UserWhereInput = {}) {
  const rows = await db.enrollment.findMany({
    where: { courseId, status: "ACTIVE", user: { status: "ACTIVE", deletedAt: null, ...extra } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/** Optional narrowing: only these courses (used by tests; the scheduled job passes nothing). */
export type ReminderScope = { courseIds?: string[] };
const inScope = (scope?: ReminderScope) => (scope?.courseIds ? { courseId: { in: scope.courseIds } } : {});

async function lectureReminders(
  db: PrismaClient,
  type: "lecture.upcoming_24h" | "lecture.upcoming_1h",
  from: Date,
  to: Date,
  scope?: ReminderScope,
) {
  const lectures = await db.lecture.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      startsAt: { gt: from, lte: to },
      course: { status: "PUBLISHED" },
      ...inScope(scope),
    },
    select: { id: true, courseId: true },
  });
  const rows: Row[] = [];
  for (const lecture of lectures) {
    for (const userId of await activeEnrollees(db, lecture.courseId)) {
      rows.push({
        userId,
        type,
        payload: { courseId: lecture.courseId, lectureId: lecture.id },
        dedupeKey: `${type}:${lecture.id}:${userId}`,
      });
    }
  }
  return insertRows(db, rows);
}

async function questionDueReminders(db: PrismaClient, now: Date, scope?: ReminderScope) {
  const questions = await db.question.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      lectureId: { not: null },
      dueAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
      course: { status: "PUBLISHED", questionsEnabled: true },
      lecture: { status: "PUBLISHED", deletedAt: null },
      ...inScope(scope),
    },
    select: { id: true, courseId: true, lectureId: true },
  });
  const rows: Row[] = [];
  for (const q of questions) {
    // Not answered, and no personal deadline extension (which would make this date wrong for them)
    const userIds = await activeEnrollees(db, q.courseId, {
      submissions: { none: { questionId: q.id } },
      extensionsReceived: { none: { questionId: q.id } },
    });
    for (const userId of userIds) {
      rows.push({
        userId,
        type: "question.due_soon",
        payload: { courseId: q.courseId, lectureId: q.lectureId as string, questionId: q.id },
        dedupeKey: `question.due_soon:${q.id}:${userId}`,
      });
    }
  }
  return insertRows(db, rows);
}

async function examClosingReminders(db: PrismaClient, now: Date, scope?: ReminderScope) {
  const exams = await db.exam.findMany({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      dueAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
      course: { status: "PUBLISHED", examEnabled: true },
      ...inScope(scope),
    },
    select: { id: true, courseId: true },
  });
  const rows: Row[] = [];
  for (const exam of exams) {
    const userIds = await activeEnrollees(db, exam.courseId, {
      examAttempts: { none: { examId: exam.id, status: { in: ["SUBMITTED", "GRADED"] } } },
    });
    for (const userId of userIds) {
      rows.push({
        userId,
        type: "exam.closing_soon",
        payload: { courseId: exam.courseId, examId: exam.id },
        dedupeKey: `exam.closing_soon:${exam.id}:${userId}`,
      });
    }
  }
  return insertRows(db, rows);
}

export async function generateReminders(db: PrismaClient, now: Date = new Date(), scope?: ReminderScope) {
  return {
    lectures24h: await lectureReminders(db, "lecture.upcoming_24h", new Date(now.getTime() + HOUR), new Date(now.getTime() + 24 * HOUR), scope),
    lectures1h: await lectureReminders(db, "lecture.upcoming_1h", now, new Date(now.getTime() + HOUR), scope),
    questionsDue: await questionDueReminders(db, now, scope),
    examsClosing: await examClosingReminders(db, now, scope),
  };
}
