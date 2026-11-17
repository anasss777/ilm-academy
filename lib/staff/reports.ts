// lib/staff/reports.ts
// Numbers for the reports screens. Everything is a database aggregate (counts and averages);
// no per-student loop, so a report stays quick as a course grows.
//
// Certificate figures come from the stored review rows (kept up to date as work is graded),
// not from re-running the eligibility rules for every student.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "../api/errors";
import { attendanceRate, average, histogram, percentOf, weeklyCounts, type AttendanceCounts } from "./report-math";

const DAY = 86_400_000;
const num = (v: unknown): number => (v == null ? 0 : Number(v));

const emptyAttendance = (): AttendanceCounts => ({ PRESENT: 0, PARTIAL: 0, ABSENT: 0, EXCUSED: 0 });

/** Which courses a person may see reports for: all of them, or only some. */
export async function reportScope(db: PrismaClient, userId: string): Promise<{ all: boolean; courseIds: string[] }> {
  const rows = await db.userRole.findMany({
    where: { userId, role: { permissions: { some: { permission: { key: "report.view" } } } } },
    select: { courseId: true },
  });
  if (rows.some((r) => r.courseId === null)) return { all: true, courseIds: [] };
  return { all: false, courseIds: [...new Set(rows.map((r) => r.courseId as string))] };
}

// ---------------------------------------------------------------------------
// Platform overview
// ---------------------------------------------------------------------------

export async function platformOverview(
  db: PrismaClient,
  scope: { all: boolean; courseIds: string[] },
  now: Date = new Date(),
) {
  const courses = await db.course.findMany({
    where: scope.all ? {} : { id: { in: scope.courseIds } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, titleAr: true, titleEn: true, status: true, settings: { select: { partialWeight: true } } },
  });
  const ids = courses.map((c) => c.id);
  const inScope = { courseId: { in: ids } };

  const [enr, att, rev, held, ungraded, examsWaiting, newEnrollments, students, upcoming, exports30] = await Promise.all([
    db.enrollment.groupBy({ by: ["courseId", "status"], where: inScope, _count: { _all: true } }),
    db.attendanceRecord.groupBy({ by: ["courseId", "status"], where: inScope, _count: { _all: true } }),
    db.certificateReview.groupBy({ by: ["courseId", "status"], where: inScope, _count: { _all: true } }),
    db.lecture.groupBy({
      by: ["courseId"],
      where: { ...inScope, status: "PUBLISHED", deletedAt: null, endsAt: { lt: now } },
      _count: { _all: true },
    }),
    db.questionSubmission.count({ where: { gradedAt: null, question: { ...inScope, deletedAt: null } } }),
    db.examAttempt.count({ where: { status: "SUBMITTED", exam: inScope } }),
    db.enrollment.count({ where: { ...inScope, enrolledAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    db.enrollment.findMany({ where: { ...inScope, status: "ACTIVE" }, distinct: ["userId"], select: { userId: true } }),
    db.lecture.count({
      where: { ...inScope, status: "PUBLISHED", deletedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY) } },
    }),
    db.certificateExport.count({ where: { ...inScope, exportedAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
  ]);

  const rows = courses.map((c) => {
    const count = (list: { courseId: string; status: string; _count: { _all: number } }[], status: string) =>
      list.find((r) => r.courseId === c.id && r.status === status)?._count._all ?? 0;
    const attendance = emptyAttendance();
    for (const k of Object.keys(attendance) as (keyof AttendanceCounts)[]) attendance[k] = count(att, k);
    return {
      id: c.id,
      titleAr: c.titleAr,
      titleEn: c.titleEn,
      status: c.status,
      active: count(enr, "ACTIVE"),
      withdrawn: count(enr, "WITHDRAWN"),
      heldLectures: held.find((h) => h.courseId === c.id)?._count._all ?? 0,
      attendanceRate: attendanceRate(attendance, num(c.settings?.partialWeight ?? 1)),
      eligible: count(rev, "AUTO_ELIGIBLE"),
      approved: count(rev, "APPROVED"),
    };
  });

  const byStatus = (s: string) => courses.filter((c) => c.status === s).length;
  return {
    totals: {
      courses: courses.length,
      published: byStatus("PUBLISHED"),
      draft: byStatus("DRAFT"),
      archived: byStatus("ARCHIVED"),
      students: students.length,
      newEnrollments,
      upcomingLectures: upcoming,
      ungradedAnswers: ungraded,
      examsWaiting,
      approvedCertificates: rows.reduce((a, r) => a + r.approved, 0),
      exports30,
    },
    courses: rows,
  };
}

// ---------------------------------------------------------------------------
// One course
// ---------------------------------------------------------------------------

export async function courseReport(db: PrismaClient, courseId: string, now: Date = new Date()) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, settings: { select: { partialWeight: true } } },
  });
  if (!course) throw new ApiError(404, "NOT_FOUND");
  const partialWeight = num(course.settings?.partialWeight ?? 1);

  const [enrollByStatus, recent, lectures, attRows, questions, subAll, subGraded, subLate, reviews, needsReview, exportAgg, exam] =
    await Promise.all([
      db.enrollment.groupBy({ by: ["status"], where: { courseId }, _count: { _all: true } }),
      db.enrollment.findMany({
        where: { courseId, enrolledAt: { gte: new Date(now.getTime() - 13 * 7 * DAY) } },
        select: { enrolledAt: true },
      }),
      db.lecture.findMany({
        where: { courseId, status: "PUBLISHED", deletedAt: null, endsAt: { lt: now } },
        orderBy: { number: "asc" },
        select: { id: true, number: true, titleAr: true, titleEn: true },
      }),
      db.attendanceRecord.groupBy({ by: ["lectureId", "status"], where: { courseId }, _count: { _all: true } }),
      db.question.findMany({
        where: { courseId, lectureId: { not: null }, deletedAt: null, status: "PUBLISHED" },
        orderBy: [{ lecture: { number: "asc" } }, { position: "asc" }],
        select: { id: true, type: true, body: true, points: true, lecture: { select: { number: true } } },
      }),
      db.questionSubmission.groupBy({
        by: ["questionId"],
        where: { question: { courseId } },
        _count: { _all: true },
        _avg: { finalScore: true },
      }),
      db.questionSubmission.groupBy({
        by: ["questionId"],
        where: { question: { courseId }, gradedAt: { not: null } },
        _count: { _all: true },
      }),
      db.questionSubmission.groupBy({
        by: ["questionId"],
        where: { question: { courseId }, isLate: true },
        _count: { _all: true },
      }),
      db.certificateReview.groupBy({ by: ["status"], where: { courseId }, _count: { _all: true } }),
      db.certificateReview.count({ where: { courseId, needsReReview: true } }),
      db.certificateExport.aggregate({ where: { courseId }, _count: { _all: true }, _max: { exportedAt: true } }),
      db.exam.findFirst({
        where: { courseId, deletedAt: null },
        select: { id: true, titleAr: true, titleEn: true, passingPercent: true, status: true },
      }),
    ]);

  const active = enrollByStatus.find((r) => r.status === "ACTIVE")?._count._all ?? 0;
  const withdrawn = enrollByStatus.find((r) => r.status === "WITHDRAWN")?._count._all ?? 0;

  const lectureRows = lectures.map((l) => {
    const counts = emptyAttendance();
    for (const r of attRows) if (r.lectureId === l.id) counts[r.status as keyof AttendanceCounts] = r._count._all;
    const recorded = counts.PRESENT + counts.PARTIAL + counts.ABSENT + counts.EXCUSED;
    return {
      id: l.id,
      number: l.number,
      titleAr: l.titleAr,
      titleEn: l.titleEn,
      ...counts,
      unrecorded: Math.max(0, active - recorded),
      rate: attendanceRate(counts, partialWeight),
    };
  });

  const questionRows = questions.map((q) => {
    const all = subAll.find((s) => s.questionId === q.id);
    const points = num(q.points);
    const avg = all?._avg.finalScore;
    return {
      id: q.id,
      type: q.type,
      body: q.body,
      lectureNumber: q.lecture?.number ?? 0,
      points,
      submitted: all?._count._all ?? 0,
      graded: subGraded.find((s) => s.questionId === q.id)?._count._all ?? 0,
      late: subLate.find((s) => s.questionId === q.id)?._count._all ?? 0,
      averagePercent: avg != null && points > 0 ? (num(avg) / points) * 100 : null,
    };
  });

  let examReport: null | {
    id: string;
    titleAr: string;
    titleEn: string | null;
    status: string;
    passingPercent: number;
    participants: number;
    submittedAttempts: number;
    awaitingGrading: number;
    scored: number;
    averagePercent: number | null;
    passRate: number | null;
    distribution: { from: number; to: number; count: number }[];
  } = null;

  if (exam) {
    const [attemptRows, maxAgg, graded] = await Promise.all([
      db.examAttempt.groupBy({ by: ["status"], where: { examId: exam.id }, _count: { _all: true } }),
      db.question.aggregate({ where: { examId: exam.id, deletedAt: null, status: "PUBLISHED" }, _sum: { points: true } }),
      db.examAttempt.findMany({ where: { examId: exam.id, status: "GRADED" }, select: { userId: true, totalScore: true } }),
    ]);
    const maxScore = num(maxAgg._sum.points);
    const best = new Map<string, number>();
    for (const a of graded) best.set(a.userId, Math.max(best.get(a.userId) ?? 0, num(a.totalScore)));
    const percents = maxScore > 0 ? [...best.values()].map((s) => (s / maxScore) * 100) : [];
    const passing = num(exam.passingPercent);
    const attemptCount = (s: string) => attemptRows.find((r) => r.status === s)?._count._all ?? 0;
    const participants = await db.examAttempt.findMany({ where: { examId: exam.id }, distinct: ["userId"], select: { userId: true } });

    examReport = {
      id: exam.id,
      titleAr: exam.titleAr,
      titleEn: exam.titleEn,
      status: exam.status,
      passingPercent: passing,
      participants: participants.length,
      submittedAttempts: attemptCount("SUBMITTED") + attemptCount("GRADED"),
      awaitingGrading: attemptCount("SUBMITTED"),
      scored: percents.length,
      averagePercent: average(percents),
      passRate: percentOf(percents.filter((p) => p >= passing).length, percents.length),
      distribution: histogram(percents),
    };
  }

  return {
    enrollment: {
      active,
      withdrawn,
      weekly: weeklyCounts(recent.map((r) => r.enrolledAt), now, 12),
    },
    lectures: lectureRows,
    questions: questionRows,
    exam: examReport,
    certificates: {
      byStatus: Object.fromEntries(reviews.map((r) => [r.status, r._count._all])) as Record<string, number>,
      needsReReview: needsReview,
      exports: exportAgg._count._all,
      lastExportAt: exportAgg._max.exportedAt,
    },
  };
}
