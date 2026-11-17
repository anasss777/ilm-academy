// lib/staff/queues.ts
// Read-only staff views: what needs grading, and who is heading for a certificate.
// Routes verify submission.view / exam.grade / certificate.view / certificate.export first.
// Staff DO see answer keys and every student's answers here: that is their job.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { evaluateStudents, loadCourseContext } from "../eligibility/loader";
import { GradingError } from "../grading/grading";
import { audit } from "./common";
import { toCsv } from "./csv";

const num = (d: { toNumber(): number }) => d.toNumber();
const numOrNull = (d: { toNumber(): number } | null | undefined) => (d == null ? null : d.toNumber());
const ci = "insensitive" as const;
const nameOrEmail = (q: string) => ({
  OR: [{ fullName: { contains: q, mode: ci } }, { email: { contains: q, mode: ci } }],
});

// ---------------------------------------------------------------------------
// Lecture-question submissions
// ---------------------------------------------------------------------------

/** Oldest-first when looking for work (UNGRADED), newest-first otherwise. */
export async function listSubmissionQueue(
  db: PrismaClient,
  args: {
    courseId: string;
    status: "UNGRADED" | "GRADED" | "ALL";
    questionId?: string;
    lectureId?: string;
    q?: string;
    page: number;
    pageSize: number;
  },
) {
  const { courseId, status, questionId, lectureId, q, page, pageSize } = args;

  const where: Prisma.QuestionSubmissionWhereInput = {
    question: {
      courseId,
      deletedAt: null,
      ...(questionId ? { id: questionId } : {}),
      ...(lectureId ? { lectureId } : {}),
    },
    ...(status === "UNGRADED" ? { gradedAt: null } : status === "GRADED" ? { gradedAt: { not: null } } : {}),
    ...(q ? { user: nameOrEmail(q) } : {}),
  };
  const direction = status === "UNGRADED" ? ("asc" as const) : ("desc" as const);

  const [total, rows] = await Promise.all([
    db.questionSubmission.count({ where }),
    db.questionSubmission.findMany({
      where,
      orderBy: { submittedAt: direction },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, userId: true, submittedAt: true, isLate: true, excuseGranted: true, excuseReason: true,
        answerText: true, rawScore: true, finalScore: true, penaltyType: true, penaltyValue: true,
        feedback: true, gradedAt: true, releasedAt: true,
        selectedOption: { select: { text: true, isCorrect: true } },
        user: { select: { fullName: true, email: true } },
        question: {
          select: {
            id: true, type: true, body: true, points: true, dueAt: true,
            lecture: { select: { number: true, titleAr: true, titleEn: true } },
          },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      student: { id: r.userId, fullName: r.user.fullName, email: r.user.email },
      question: {
        id: r.question.id,
        type: r.question.type,
        body: r.question.body,
        points: num(r.question.points),
        dueAt: r.question.dueAt,
        lectureNumber: r.question.lecture?.number ?? null,
        lectureTitleAr: r.question.lecture?.titleAr ?? null,
        lectureTitleEn: r.question.lecture?.titleEn ?? null,
      },
      submittedAt: r.submittedAt,
      isLate: r.isLate,
      excuse: { granted: r.excuseGranted, reason: r.excuseReason },
      answerText: r.answerText,
      selectedOption: r.selectedOption,
      rawScore: numOrNull(r.rawScore),
      finalScore: numOrNull(r.finalScore),
      penaltyType: r.penaltyType,
      penaltyValue: num(r.penaltyValue),
      feedback: r.feedback,
      gradedAt: r.gradedAt,
      releasedAt: r.releasedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Exam attempts
// ---------------------------------------------------------------------------

export async function listExamAttempts(
  db: PrismaClient,
  args: {
    examId: string;
    status?: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
    q?: string;
    page: number;
    pageSize: number;
  },
) {
  const { examId, status, q, page, pageSize } = args;
  const where: Prisma.ExamAttemptWhereInput = {
    examId,
    ...(status ? { status } : {}),
    ...(q ? { user: nameOrEmail(q) } : {}),
  };

  const [total, rows] = await Promise.all([
    db.examAttempt.count({ where }),
    db.examAttempt.findMany({
      where,
      orderBy: [{ submittedAt: { sort: "asc", nulls: "last" } }, { startedAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, userId: true, attemptNumber: true, status: true, startedAt: true, submittedAt: true,
        totalScore: true, gradedAt: true, releasedAt: true,
        user: { select: { fullName: true, email: true } },
      },
    }),
  ]);

  // How many written answers in each attempt still wait for a grader
  const waiting = rows.length
    ? await db.examAnswer.findMany({
        where: { attemptId: { in: rows.map((r) => r.id) }, score: null },
        select: { attemptId: true },
      })
    : [];
  const pending = new Map<string, number>();
  for (const w of waiting) pending.set(w.attemptId, (pending.get(w.attemptId) ?? 0) + 1);

  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      student: { id: r.userId, fullName: r.user.fullName, email: r.user.email },
      attemptNumber: r.attemptNumber,
      status: r.status,
      startedAt: r.startedAt,
      submittedAt: r.submittedAt,
      totalScore: numOrNull(r.totalScore),
      pendingManual: pending.get(r.id) ?? 0,
      gradedAt: r.gradedAt,
      releasedAt: r.releasedAt,
    })),
  };
}

/** One attempt as the grader sees it: every answer next to its question and the answer key. */
export async function getAttemptForGrader(db: PrismaClient, attemptId: string) {
  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, examId: true, attemptNumber: true, status: true, startedAt: true, submittedAt: true,
      totalScore: true, gradedAt: true, releasedAt: true,
      user: { select: { id: true, fullName: true, email: true } },
      exam: { select: { titleAr: true, titleEn: true, courseId: true } },
      answers: {
        select: {
          id: true, questionId: true, selectedOptionId: true, answerText: true, isCorrect: true,
          score: true, feedback: true, gradedById: true, gradedAt: true,
          question: {
            select: {
              id: true, type: true, body: true, points: true, position: true, explanation: true,
              options: { orderBy: { position: "asc" }, select: { id: true, text: true, isCorrect: true } },
            },
          },
        },
      },
    },
  });
  if (!attempt) throw new GradingError("NOT_FOUND");

  const answers = [...attempt.answers]
    .sort((a, b) => a.question.position - b.question.position)
    .map((a) => ({
      id: a.id,
      selectedOptionId: a.selectedOptionId,
      answerText: a.answerText,
      isCorrect: a.isCorrect,
      score: numOrNull(a.score),
      needsGrading: a.score == null,
      autoGraded: a.gradedAt != null && a.gradedById == null,
      feedback: a.feedback,
      question: {
        id: a.question.id,
        type: a.question.type,
        body: a.question.body,
        points: num(a.question.points),
        explanation: a.question.explanation,
        options: a.question.options,
      },
    }));

  return {
    id: attempt.id,
    examId: attempt.examId,
    exam: attempt.exam,
    student: attempt.user,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    totalScore: numOrNull(attempt.totalScore),
    gradedAt: attempt.gradedAt,
    releasedAt: attempt.releasedAt,
    answers,
  };
}

// ---------------------------------------------------------------------------
// Certificate review list and export download
// ---------------------------------------------------------------------------

type ReviewStatus = "PENDING" | "AUTO_ELIGIBLE" | "AUTO_INELIGIBLE" | "APPROVED" | "REJECTED";

/**
 * The instructor's review screen: every ACTIVE student with the stored review status AND the
 * live numbers behind it. Filtering by status or "needs re-review" pages over review rows;
 * without a filter it pages over enrollments, so students without a row still appear.
 */
export async function listCertificateReviews(
  db: PrismaClient,
  args: {
    courseId: string;
    status?: ReviewStatus;
    needsReReview?: boolean;
    q?: string;
    page: number;
    pageSize: number;
  },
) {
  const { courseId, status, needsReReview, q, page, pageSize } = args;
  const ctx = await loadCourseContext(db, courseId);
  const skip = (page - 1) * pageSize;

  let total: number;
  let userIds: string[];

  if (status !== undefined || needsReReview !== undefined) {
    const active = await db.enrollment.findMany({ where: { courseId, status: "ACTIVE" }, select: { userId: true } });
    const where: Prisma.CertificateReviewWhereInput = {
      courseId,
      userId: { in: active.map((a) => a.userId) },
      ...(status ? { status } : {}),
      ...(needsReReview !== undefined ? { needsReReview } : {}),
      ...(q ? { user: nameOrEmail(q) } : {}),
    };
    total = await db.certificateReview.count({ where });
    const rows = await db.certificateReview.findMany({
      where, orderBy: { user: { fullName: "asc" } }, skip, take: pageSize, select: { userId: true },
    });
    userIds = rows.map((r) => r.userId);
  } else {
    const where: Prisma.EnrollmentWhereInput = {
      courseId,
      status: "ACTIVE",
      ...(q ? { user: nameOrEmail(q) } : {}),
    };
    total = await db.enrollment.count({ where });
    const rows = await db.enrollment.findMany({
      where, orderBy: { user: { fullName: "asc" } }, skip, take: pageSize, select: { userId: true },
    });
    userIds = rows.map((r) => r.userId);
  }

  const [live, reviews, users] = await Promise.all([
    evaluateStudents(db, ctx, userIds),
    db.certificateReview.findMany({ where: { courseId, userId: { in: userIds } } }),
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true, phone: true, country: true, dataSharingConsentAt: true },
    }),
  ]);
  const reviewBy = new Map(reviews.map((r) => [r.userId, r]));
  const userBy = new Map(users.map((u) => [u.id, u]));

  return {
    total,
    page,
    pageSize,
    requirementVersion: ctx.requirementVersion,
    thresholds: ctx.requirement,
    items: userIds.map((id) => {
      const u = userBy.get(id)!;
      const r = reviewBy.get(id);
      const l = live.get(id)!;
      return {
        userId: id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        country: u.country,
        dataSharingConsent: u.dataSharingConsentAt != null,
        review: r
          ? {
              status: r.status,
              needsReReview: r.needsReReview,
              overrideReason: r.overrideReason,
              requirementVersion: r.requirementVersion,
              decidedAt: r.decidedAt,
            }
          : null,
        live: {
          status: l.status,
          reasons: l.reasons,
          attendance: {
            state: l.attendance.state,
            percent: l.attendance.percent,
            attended: l.attendance.attended,
            required: l.attendance.requiredLectures,
            heldLectures: l.attendance.heldLectures,
          },
          questions: { state: l.questions.state, percent: l.questions.percent },
          exam: { state: l.exam.state, percent: l.exam.percent },
        },
      };
    }),
  };
}

export async function listCertificateExports(db: PrismaClient, courseId: string) {
  const rows = await db.certificateExport.findMany({
    where: { courseId },
    orderBy: { exportedAt: "desc" },
    take: 50,
    select: {
      id: true, requirementVersion: true, itemCount: true, exportedAt: true,
      exportedBy: { select: { fullName: true } },
    },
  });
  return {
    items: rows.map((r) => ({
      id: r.id,
      requirementVersion: r.requirementVersion,
      itemCount: r.itemCount,
      exportedAt: r.exportedAt,
      exportedBy: r.exportedBy.fullName,
    })),
  };
}

/** The stored snapshot as a spreadsheet, not a fresh calculation. Downloads are audit-logged. */
export async function getCertificateExportCsv(db: PrismaClient, args: { exportId: string; actorId: string }) {
  const exp = await db.certificateExport.findUnique({
    where: { id: args.exportId },
    select: {
      id: true, courseId: true, requirementVersion: true, exportedAt: true,
      items: {
        orderBy: { fullName: "asc" },
        select: {
          fullName: true, email: true, phone: true, country: true, totalLectures: true,
          attendedLectures: true, requiredLectures: true, attendancePercent: true,
          questionScorePercent: true, examPercent: true,
        },
      },
    },
  });
  if (!exp) throw new GradingError("NOT_FOUND");

  const csv = toCsv(
    [
      "Full name", "Email", "Phone", "Country", "Lectures held", "Lectures attended",
      "Lectures required", "Attendance %", "Question score %", "Exam %", "Requirement version", "Exported at",
    ],
    exp.items.map((i) => [
      i.fullName, i.email, i.phone, i.country, i.totalLectures, num(i.attendedLectures),
      i.requiredLectures, numOrNull(i.attendancePercent), numOrNull(i.questionScorePercent),
      numOrNull(i.examPercent), exp.requirementVersion, exp.exportedAt.toISOString(),
    ]),
  );

  // Personal data leaves the system here
  await audit(db, {
    actorId: args.actorId, action: "certificate.export.download", entityType: "CertificateExport",
    entityId: exp.id, metadata: { items: exp.items.length },
  });

  return {
    csv,
    filename: `certificates-${exp.courseId.slice(0, 8)}-v${exp.requirementVersion}-${exp.exportedAt.toISOString().slice(0, 10)}.csv`,
  };
}
