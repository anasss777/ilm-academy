// lib/exams/service.ts
//
// Database layer for exam attempts, answers and grading.
//
// IMPORTANT: nothing here checks permissions. Route handlers must verify:
//   - student routes:  the signed-in user is the `userId` passed in
//   - exam.grade     before gradeExamAnswer / releaseExamAttempts
//   - exam.reopen    before grantExamAttempt   (instructors only, per the agreed rules)
//   - finalizeExpiredAttempts is safe to call from a cron job or from the grading screen
//
// Writes are batched (delete + createMany) because every statement is a network round trip.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { syncCertificateReviews, TX_OPTIONS } from "../eligibility/loader";
import { GradingError, validateScore } from "../grading/grading";
import {
  allowedAttempts,
  assertCanStartAttempt,
  checkExamWindow,
  effectiveExamDueAt,
  gradeAttempt,
  summarizeScores,
  validateAnswerShape,
} from "./exam";

const toNum = (d: { toNumber(): number }) => d.toNumber();
const toNumOrNull = (d: { toNumber(): number } | null | undefined) =>
  d == null ? null : d.toNumber();
const isUniqueViolation = (e: unknown) =>
  (e as { code?: string } | null)?.code === "P2002";

const inTx = <T>(
  db: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) => db.$transaction(fn, TX_OPTIONS);

/** A failed sync must never fail the action that already succeeded. */
async function safeSync(db: PrismaClient, courseId: string, userIds: string[]) {
  if (userIds.length === 0) return;
  try {
    await syncCertificateReviews(db, courseId, { userIds });
  } catch (err) {
    console.error("[exams] certificate sync failed", { courseId, err });
  }
}

// ---------------------------------------------------------------------------
// Shared: grade and close an in-progress attempt
// ---------------------------------------------------------------------------

async function finalizeAttempt(
  tx: Prisma.TransactionClient,
  args: { attemptId: string; examId: string; submittedAt: Date; now: Date },
) {
  const { attemptId, examId, submittedAt, now } = args;

  const questions = await tx.question.findMany({
    where: { examId, deletedAt: null, status: "PUBLISHED" },
    select: {
      id: true,
      type: true,
      points: true,
      options: { select: { id: true, isCorrect: true } },
    },
  });
  const saved = await tx.examAnswer.findMany({
    where: { attemptId },
    select: { questionId: true, selectedOptionId: true, answerText: true },
  });

  const graded = gradeAttempt(
    questions.map((q) => ({
      id: q.id,
      type: q.type,
      points: toNum(q.points),
      options: q.options,
    })),
    saved,
  );

  // The attempt is still IN_PROGRESS, so its answers are ungraded drafts: replace them wholesale
  await tx.examAnswer.deleteMany({ where: { attemptId } });
  await tx.examAnswer.createMany({
    data: graded.rows.map((r) => ({
      attemptId,
      questionId: r.questionId,
      selectedOptionId: r.selectedOptionId,
      answerText: r.answerText,
      isCorrect: r.isCorrect,
      score: r.score,
      gradedById: null,
      gradedAt: r.score != null ? now : null,
    })),
  });

  const done = graded.status === "GRADED";
  return tx.examAttempt.update({
    where: { id: attemptId },
    data: {
      status: graded.status,
      submittedAt,
      totalScore: graded.totalScore,
      gradedAt: done ? now : null,
      releasedAt: done ? now : null, // nothing left to wait for, so results are visible
    },
  });
}

// ---------------------------------------------------------------------------
// Student: start, save, submit
// ---------------------------------------------------------------------------

/** Start a new attempt, or resume the in-progress one. */
export async function startAttempt(
  db: PrismaClient,
  args: { examId: string; userId: string; now?: Date },
) {
  const { examId, userId } = args;
  const now = args.now ?? new Date();

  try {
    return await inTx(db, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id: examId, deletedAt: null, status: "PUBLISHED" },
        include: { course: { select: { examEnabled: true } } },
      });
      if (!exam || !exam.course.examEnabled)
        throw new GradingError("EXAM_NOT_AVAILABLE");

      const enrollment = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: exam.courseId } },
      });
      if (!enrollment || enrollment.status !== "ACTIVE")
        throw new GradingError("NOT_ENROLLED");

      const questionCount = await tx.question.count({
        where: { examId, deletedAt: null, status: "PUBLISHED" },
      });
      if (questionCount === 0) throw new GradingError("EXAM_NOT_AVAILABLE");

      const grants = await tx.examAttemptGrant.findMany({
        where: { examId, userId },
      });
      const attempts = await tx.examAttempt.findMany({
        where: { examId, userId },
        orderBy: { attemptNumber: "desc" },
      });

      checkExamWindow({
        now,
        opensAt: exam.opensAt,
        effectiveDueAt: effectiveExamDueAt(exam.dueAt, grants),
      });

      const inProgress = attempts.find((a) => a.status === "IN_PROGRESS");
      if (inProgress) return { attempt: inProgress, resumed: true };

      assertCanStartAttempt(
        attempts.length,
        allowedAttempts(exam.attemptLimit, grants),
      );

      const attempt = await tx.examAttempt.create({
        data: {
          examId,
          userId,
          attemptNumber: (attempts[0]?.attemptNumber ?? 0) + 1,
          startedAt: now,
        },
      });
      return { attempt, resumed: false };
    });
  } catch (e) {
    // Two tabs starting at once collide on (examId, userId, attemptNumber)
    if (isUniqueViolation(e)) throw new GradingError("ATTEMPT_CONFLICT");
    throw e;
  }
}

/** Save (replace) answers for the questions included. Blank answers clear a saved answer. */
export async function saveAnswers(
  db: PrismaClient,
  args: {
    attemptId: string;
    userId: string;
    answers: {
      questionId: string;
      selectedOptionId?: string | null;
      answerText?: string | null;
    }[];
    now?: Date;
  },
) {
  const now = args.now ?? new Date();

  return inTx(db, async (tx) => {
    const attempt = await tx.examAttempt.findUnique({
      where: { id: args.attemptId },
      include: { exam: { select: { dueAt: true } } },
    });
    if (!attempt || attempt.userId !== args.userId)
      throw new GradingError("NOT_FOUND");
    if (attempt.status !== "IN_PROGRESS")
      throw new GradingError("ATTEMPT_NOT_IN_PROGRESS");

    const grants = await tx.examAttemptGrant.findMany({
      where: { examId: attempt.examId, userId: args.userId },
    });
    checkExamWindow({
      now,
      opensAt: null,
      effectiveDueAt: effectiveExamDueAt(attempt.exam.dueAt, grants),
    });

    const questions = await tx.question.findMany({
      where: { examId: attempt.examId, deletedAt: null, status: "PUBLISHED" },
      select: { id: true, type: true, options: { select: { id: true } } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));

    // Last answer per question wins; unknown questions are rejected
    const normalized = new Map<
      string,
      { selectedOptionId: string | null; answerText: string | null } | null
    >();
    for (const a of args.answers) {
      const q = byId.get(a.questionId);
      if (!q)
        throw new GradingError(
          "INVALID_ANSWER",
          "Question is not part of this exam",
        );
      normalized.set(a.questionId, validateAnswerShape(q, a));
    }

    const ids = [...normalized.keys()];
    if (ids.length > 0) {
      await tx.examAnswer.deleteMany({
        where: { attemptId: attempt.id, questionId: { in: ids } },
      });
      const rows = [...normalized.entries()]
        .filter(([, v]) => v !== null)
        .map(([questionId, v]) => ({
          attemptId: attempt.id,
          questionId,
          selectedOptionId: v!.selectedOptionId,
          answerText: v!.answerText,
        }));
      if (rows.length > 0) await tx.examAnswer.createMany({ data: rows });
    }
    return { saved: ids.length };
  });
}

/** Submit: grade objective answers now; open answers wait for the grader. */
export async function submitAttempt(
  db: PrismaClient,
  args: { attemptId: string; userId: string; now?: Date },
) {
  const now = args.now ?? new Date();

  const { attempt, courseId } = await inTx(db, async (tx) => {
    const a = await tx.examAttempt.findUnique({
      where: { id: args.attemptId },
      include: { exam: { select: { dueAt: true, courseId: true } } },
    });
    if (!a || a.userId !== args.userId) throw new GradingError("NOT_FOUND");
    if (a.status !== "IN_PROGRESS")
      throw new GradingError("ATTEMPT_NOT_IN_PROGRESS");

    const grants = await tx.examAttemptGrant.findMany({
      where: { examId: a.examId, userId: args.userId },
    });
    checkExamWindow({
      now,
      opensAt: null,
      effectiveDueAt: effectiveExamDueAt(a.exam.dueAt, grants),
    });

    const updated = await finalizeAttempt(tx, {
      attemptId: a.id,
      examId: a.examId,
      submittedAt: now,
      now,
    });
    return { attempt: updated, courseId: a.exam.courseId };
  });

  await safeSync(db, courseId, [args.userId]);
  return attempt;
}

/**
 * Submit attempts left in progress after their deadline, using whatever answers were saved.
 * Call this from a scheduled job or when an instructor opens the grading screen.
 */
export async function finalizeExpiredAttempts(
  db: PrismaClient,
  args: { examId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const exam = await db.exam.findUnique({
    where: { id: args.examId },
    select: { dueAt: true, courseId: true },
  });
  if (!exam) throw new GradingError("NOT_FOUND");
  if (!exam.dueAt) return { finalized: 0 };

  const open = await db.examAttempt.findMany({
    where: { examId: args.examId, status: "IN_PROGRESS" },
    select: { id: true, userId: true },
  });
  if (open.length === 0) return { finalized: 0 };

  const grants = await db.examAttemptGrant.findMany({
    where: { examId: args.examId },
  });
  const grantsByUser = new Map<string, { newDueAt: Date | null }[]>();
  for (const g of grants) {
    const list = grantsByUser.get(g.userId) ?? [];
    list.push({ newDueAt: g.newDueAt });
    grantsByUser.set(g.userId, list);
  }

  const finalizedUsers: string[] = [];
  for (const o of open) {
    const due = effectiveExamDueAt(
      exam.dueAt,
      grantsByUser.get(o.userId) ?? [],
    );
    if (!due || now.getTime() <= due.getTime()) continue;

    // One transaction per attempt so a failure on one student never blocks the rest
    const done = await inTx(db, async (tx) => {
      const fresh = await tx.examAttempt.findUnique({
        where: { id: o.id },
        select: { status: true },
      });
      if (fresh?.status !== "IN_PROGRESS") return false; // submitted in the meantime
      await finalizeAttempt(tx, {
        attemptId: o.id,
        examId: args.examId,
        submittedAt: due,
        now,
      });
      return true;
    });
    if (done) finalizedUsers.push(o.userId);
  }

  await safeSync(db, exam.courseId, finalizedUsers);
  return { finalized: finalizedUsers.length };
}

// ---------------------------------------------------------------------------
// Grader: score open answers, release results
// ---------------------------------------------------------------------------

export async function gradeExamAnswer(
  db: PrismaClient,
  args: {
    answerId: string;
    actorId: string;
    score: number;
    feedback?: string | null;
    /** Default true: results become visible once the whole attempt is graded. */
    release?: boolean;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();

  const { attempt, courseId, userId } = await inTx(db, async (tx) => {
    const answer = await tx.examAnswer.findUnique({
      where: { id: args.answerId },
      include: {
        question: { select: { points: true } },
        attempt: { include: { exam: { select: { courseId: true } } } },
      },
    });
    if (!answer) throw new GradingError("NOT_FOUND");
    if (answer.attempt.status === "IN_PROGRESS")
      throw new GradingError("ATTEMPT_NOT_IN_PROGRESS");

    const score = validateScore(args.score, toNum(answer.question.points));
    await tx.examAnswer.update({
      where: { id: answer.id },
      data: {
        score,
        feedback: args.feedback?.trim() || null,
        gradedById: args.actorId,
        gradedAt: now,
      },
    });

    // Recompute the attempt from all of its answers
    const all = await tx.examAnswer.findMany({
      where: { attemptId: answer.attemptId },
      select: { score: true },
    });
    const { total, pending } = summarizeScores(
      all.map((a) => toNumOrNull(a.score)),
    );

    const attemptData: Prisma.ExamAttemptUncheckedUpdateInput =
      pending > 0
        ? { status: "SUBMITTED", totalScore: null, gradedAt: null }
        : {
            status: "GRADED",
            totalScore: total,
            gradedAt: now,
            releasedAt:
              answer.attempt.releasedAt ??
              (args.release === false ? null : now),
          };
    const attempt = await tx.examAttempt.update({
      where: { id: answer.attemptId },
      data: attemptData,
    });

    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: "exam.grade",
        entityType: "ExamAnswer",
        entityId: answer.id,
        metadata: {
          attemptId: answer.attemptId,
          questionId: answer.questionId,
          studentId: answer.attempt.userId,
          before: toNumOrNull(answer.score),
          after: score,
          attemptStatus: attempt.status,
          attemptTotal: toNumOrNull(attempt.totalScore),
        },
      },
    });
    return {
      attempt,
      courseId: answer.attempt.exam.courseId,
      userId: answer.attempt.userId,
    };
  });

  await safeSync(db, courseId, [userId]);
  return attempt;
}

/** Publish every fully graded but unreleased attempt for an exam. */
export async function releaseExamAttempts(
  db: PrismaClient,
  args: { examId: string; actorId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  return inTx(db, async (tx) => {
    const exam = await tx.exam.findUnique({
      where: { id: args.examId },
      select: { id: true },
    });
    if (!exam) throw new GradingError("NOT_FOUND");

    const result = await tx.examAttempt.updateMany({
      where: { examId: args.examId, status: "GRADED", releasedAt: null },
      data: { releasedAt: now },
    });
    if (result.count > 0) {
      await tx.auditLog.create({
        data: {
          actorId: args.actorId,
          action: "exam.release",
          entityType: "Exam",
          entityId: args.examId,
          metadata: { count: result.count },
        },
      });
    }
    return { released: result.count };
  });
}

// ---------------------------------------------------------------------------
// Instructor: reopen (extra attempts and/or a new deadline for one student)
// ---------------------------------------------------------------------------

export async function grantExamAttempt(
  db: PrismaClient,
  args: {
    examId: string;
    userId: string;
    actorId: string;
    extraAttempts?: number; // default 1
    newDueAt?: Date | null;
    reason?: string | null;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const extraAttempts = args.extraAttempts ?? 1;
  const newDueAt = args.newDueAt ?? null;

  if (
    !Number.isInteger(extraAttempts) ||
    extraAttempts < 0 ||
    extraAttempts > 10
  ) {
    throw new GradingError(
      "INVALID_ATTEMPT_GRANT",
      "extraAttempts must be an integer from 0 to 10",
    );
  }
  if (
    newDueAt &&
    (Number.isNaN(newDueAt.getTime()) || newDueAt.getTime() <= now.getTime())
  ) {
    throw new GradingError(
      "INVALID_DATE",
      "New deadline must be in the future",
    );
  }
  if (extraAttempts === 0 && !newDueAt) {
    throw new GradingError(
      "INVALID_ATTEMPT_GRANT",
      "Grant extra attempts, a new deadline, or both",
    );
  }

  return inTx(db, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { id: args.examId, deletedAt: null },
      select: { id: true, dueAt: true, courseId: true },
    });
    if (!exam) throw new GradingError("NOT_FOUND");

    const enrollment = await tx.enrollment.findUnique({
      where: {
        userId_courseId: { userId: args.userId, courseId: exam.courseId },
      },
    });
    if (!enrollment) throw new GradingError("NOT_ENROLLED");

    // If the deadline already passed, extra attempts are useless without a new deadline
    const existing = await tx.examAttemptGrant.findMany({
      where: { examId: exam.id, userId: args.userId },
    });
    const due = effectiveExamDueAt(exam.dueAt, existing);
    if (due && due.getTime() < now.getTime() && !newDueAt) {
      throw new GradingError(
        "INVALID_DATE",
        "The deadline has passed: provide a new deadline",
      );
    }

    const grant = await tx.examAttemptGrant.create({
      data: {
        examId: exam.id,
        userId: args.userId,
        extraAttempts,
        newDueAt,
        reason: args.reason?.trim() || null,
        grantedById: args.actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: "exam.reopen",
        entityType: "Exam",
        entityId: exam.id,
        metadata: {
          studentId: args.userId,
          extraAttempts,
          newDueAt: newDueAt?.toISOString() ?? null,
          reason: args.reason?.trim() || null,
        },
      },
    });
    return grant;
  });
}
