// lib/grading/service.ts
//
// Database layer for lecture-question submissions and grading.
//
// IMPORTANT: nothing here checks permissions. Route handlers must verify:
//   - student routes:  the signed-in user is the `userId` passed to submitAnswer
//   - submission.grade   before gradeSubmission / releaseGrades
//   - submission.extend  before setExcuse / grantDeadlineExtension / reopenSubmission
// and that the actor may act on this course.
//
// Every successful change re-syncs certificate reviews for the affected students.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { syncCertificateReviews, TX_OPTIONS } from "../eligibility/loader";
import {
  GradingError,
  MAX_ANSWER_LENGTH,
  computeFinalScore,
  effectiveDueAt,
  getSubmissionWindow,
  gradeObjective,
  isLateAt,
  normalizePenalty,
  validateScore,
  type PenaltyType,
} from "./grading";

const toNum = (d: { toNumber(): number }) => d.toNumber();
const toNumOrNull = (d: { toNumber(): number } | null | undefined) =>
  d == null ? null : d.toNumber();

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string } | null)?.code === "P2002";

/** All transactions use the app-wide generous timeout (see TX_OPTIONS). */
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
    console.error("[grading] certificate sync failed", { courseId, err });
  }
}

const snapshot = (s: {
  rawScore: { toNumber(): number } | null;
  finalScore: { toNumber(): number } | null;
  penaltyType: PenaltyType;
  penaltyValue: { toNumber(): number };
  releasedAt: Date | null;
}) => ({
  rawScore: toNumOrNull(s.rawScore),
  finalScore: toNumOrNull(s.finalScore),
  penaltyType: s.penaltyType,
  penaltyValue: toNum(s.penaltyValue),
  released: s.releasedAt != null,
});

// ---------------------------------------------------------------------------
// Student: submit (or edit before grading / before the deadline)
// ---------------------------------------------------------------------------

export async function submitAnswer(
  db: PrismaClient,
  args: {
    questionId: string;
    userId: string;
    answerText?: string | null;
    selectedOptionId?: string | null;
    now?: Date;
  },
) {
  const { questionId, userId } = args;
  const now = args.now ?? new Date();

  const { submission, courseId } = await inTx(db, async (tx) => {
    const q = await tx.question.findFirst({
      where: {
        id: questionId,
        deletedAt: null,
        status: "PUBLISHED",
        lectureId: { not: null },
      },
      include: {
        options: { select: { id: true, isCorrect: true } },
        lecture: { select: { status: true, deletedAt: true } },
        course: { include: { settings: true } },
      },
    });
    if (
      !q ||
      !q.lecture ||
      q.lecture.status !== "PUBLISHED" ||
      q.lecture.deletedAt
    ) {
      throw new GradingError("QUESTION_NOT_AVAILABLE");
    }
    if (!q.course.questionsEnabled)
      throw new GradingError("COURSE_FEATURE_DISABLED");

    const enrollment = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: q.courseId } },
    });
    if (!enrollment || enrollment.status !== "ACTIVE")
      throw new GradingError("NOT_ENROLLED");

    // Validate the answer shape for the question type
    let answerText: string | null = null;
    let selectedOptionId: string | null = null;
    if (q.type === "OPEN") {
      answerText = args.answerText?.trim() || null;
      if (!answerText || answerText.length > MAX_ANSWER_LENGTH)
        throw new GradingError("INVALID_ANSWER");
    } else {
      selectedOptionId = args.selectedOptionId ?? null;
      if (
        !selectedOptionId ||
        !q.options.some((o) => o.id === selectedOptionId)
      ) {
        throw new GradingError("INVALID_ANSWER");
      }
    }

    const extension = await tx.deadlineExtension.findUnique({
      where: { questionId_userId: { questionId, userId } },
    });
    const existing = await tx.questionSubmission.findUnique({
      where: { questionId_userId: { questionId, userId } },
    });

    const allowLate =
      q.allowLate ?? q.course.settings?.allowLateSubmissions ?? true;
    const window = getSubmissionWindow({
      now,
      dueAt: q.dueAt,
      lateCutoffAt: q.lateCutoffAt,
      extensionDueAt: extension?.newDueAt ?? null,
      allowLate,
    });

    // One submission per student per question. It can be edited only until it is graded
    // and only while the (extended) deadline has not passed.
    if (existing) {
      if (existing.gradedAt) throw new GradingError("ALREADY_GRADED");
      if (window.isLate) throw new GradingError("DEADLINE_PASSED");
    }

    // Objective questions are graded and released immediately, using the course's default penalty
    let grade: Partial<Prisma.QuestionSubmissionUncheckedCreateInput> = {};
    if (q.type !== "OPEN") {
      const rawScore = gradeObjective(
        q.options,
        selectedOptionId as string,
        toNum(q.points),
      ).rawScore;
      const defaults = normalizePenalty(
        (q.course.settings?.defaultPenaltyType ?? "NONE") as PenaltyType,
        q.course.settings ? toNum(q.course.settings.defaultPenaltyValue) : 0,
      );
      const penalty = window.isLate
        ? defaults
        : { type: "NONE" as const, value: 0 };
      grade = {
        rawScore,
        penaltyType: penalty.type,
        penaltyValue: penalty.value,
        finalScore: computeFinalScore({
          rawScore,
          isLate: window.isLate,
          excuseGranted: false,
          penaltyType: penalty.type,
          penaltyValue: penalty.value,
        }),
        gradedAt: now,
        gradedById: null,
        releasedAt: now,
      };
    }

    const common = {
      answerText,
      selectedOptionId,
      submittedAt: now,
      isLate: window.isLate,
    };
    try {
      const saved = existing
        ? await tx.questionSubmission.update({
            where: { id: existing.id },
            data: { ...common, ...grade },
          })
        : await tx.questionSubmission.create({
            data: {
              questionId,
              userId,
              ...common,
              ...grade,
            },
          });
      return { submission: saved, courseId: q.courseId };
    } catch (e) {
      // Double-click / two tabs racing on the unique (questionId, userId)
      if (isUniqueViolation(e)) throw new GradingError("ALREADY_SUBMITTED");
      throw e;
    }
  });

  await safeSync(db, courseId, [userId]);
  return submission;
}

// ---------------------------------------------------------------------------
// Grader: score a submission
// ---------------------------------------------------------------------------

export async function gradeSubmission(
  db: PrismaClient,
  args: {
    submissionId: string;
    actorId: string;
    rawScore: number;
    feedback?: string | null;
    /** Chosen by the grader for late submissions. Omit to keep the previous / course-default penalty. */
    penaltyType?: PenaltyType;
    penaltyValue?: number;
    /** Default true. Pass false to grade now and publish a batch later with releaseGrades. */
    release?: boolean;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();

  const { updated, courseId, userId } = await inTx(db, async (tx) => {
    const sub = await tx.questionSubmission.findUnique({
      where: { id: args.submissionId },
      include: {
        question: { include: { course: { include: { settings: true } } } },
      },
    });
    if (!sub) throw new GradingError("NOT_FOUND");

    const rawScore = validateScore(args.rawScore, toNum(sub.question.points));

    // Penalty only matters for late submissions; it is stored even if excused so that
    // revoking the excuse later can re-apply it.
    let penalty: { type: PenaltyType; value: number } = {
      type: "NONE",
      value: 0,
    };
    if (sub.isLate) {
      const settings = sub.question.course.settings;
      if (args.penaltyType !== undefined) {
        penalty = normalizePenalty(args.penaltyType, args.penaltyValue ?? 0);
      } else if (sub.gradedAt) {
        penalty = { type: sub.penaltyType, value: toNum(sub.penaltyValue) };
      } else {
        penalty = normalizePenalty(
          (settings?.defaultPenaltyType ?? "NONE") as PenaltyType,
          settings ? toNum(settings.defaultPenaltyValue) : 0,
        );
      }
    }

    const finalScore = computeFinalScore({
      rawScore,
      isLate: sub.isLate,
      excuseGranted: sub.excuseGranted,
      penaltyType: penalty.type,
      penaltyValue: penalty.value,
    });

    const release = args.release ?? true;
    const updated = await tx.questionSubmission.update({
      where: { id: sub.id },
      data: {
        rawScore,
        penaltyType: penalty.type,
        penaltyValue: penalty.value,
        finalScore,
        feedback: args.feedback?.trim() || null,
        gradedById: args.actorId,
        gradedAt: now,
        releasedAt: release ? (sub.releasedAt ?? now) : sub.releasedAt,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: "submission.grade",
        entityType: "QuestionSubmission",
        entityId: sub.id,
        metadata: {
          questionId: sub.questionId,
          studentId: sub.userId,
          isLate: sub.isLate,
          excuseGranted: sub.excuseGranted,
          before: snapshot(sub),
          after: snapshot(updated),
        },
      },
    });
    return { updated, courseId: sub.question.courseId, userId: sub.userId };
  });

  await safeSync(db, courseId, [userId]);
  return updated;
}

/** Publish every graded-but-unreleased grade for a question (batch release). */
export async function releaseGrades(
  db: PrismaClient,
  args: { questionId: string; actorId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const { count, userIds, courseId } = await inTx(db, async (tx) => {
    const question = await tx.question.findUnique({
      where: { id: args.questionId },
      select: { courseId: true },
    });
    if (!question) throw new GradingError("NOT_FOUND");

    const pending = await tx.questionSubmission.findMany({
      where: {
        questionId: args.questionId,
        gradedAt: { not: null },
        releasedAt: null,
      },
      select: { id: true, userId: true },
    });
    if (pending.length > 0) {
      await tx.questionSubmission.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { releasedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: args.actorId,
          action: "submission.release",
          entityType: "Question",
          entityId: args.questionId,
          metadata: { count: pending.length },
        },
      });
    }
    return {
      count: pending.length,
      userIds: pending.map((p) => p.userId),
      courseId: question.courseId,
    };
  });

  await safeSync(db, courseId, userIds);
  return { released: count };
}

// ---------------------------------------------------------------------------
// Excuses (waive the late penalty)
// ---------------------------------------------------------------------------

export async function setExcuse(
  db: PrismaClient,
  args: {
    submissionId: string;
    actorId: string;
    granted: boolean;
    reason?: string | null;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const reason = args.reason?.trim() || null;
  if (args.granted && !reason) throw new GradingError("EXCUSE_REASON_REQUIRED");

  const { updated, courseId, userId } = await inTx(db, async (tx) => {
    const sub = await tx.questionSubmission.findUnique({
      where: { id: args.submissionId },
      include: { question: { select: { courseId: true } } },
    });
    if (!sub) throw new GradingError("NOT_FOUND");

    // If already graded, the final score must be recomputed with/without the penalty
    const finalScore =
      sub.rawScore != null
        ? computeFinalScore({
            rawScore: toNum(sub.rawScore),
            isLate: sub.isLate,
            excuseGranted: args.granted,
            penaltyType: sub.penaltyType,
            penaltyValue: toNum(sub.penaltyValue),
          })
        : null;

    const updated = await tx.questionSubmission.update({
      where: { id: sub.id },
      data: {
        excuseGranted: args.granted,
        excuseReason: args.granted ? reason : null,
        excuseGrantedById: args.granted ? args.actorId : null,
        excuseGrantedAt: args.granted ? now : null,
        ...(finalScore != null ? { finalScore } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: args.granted ? "submission.excuse" : "submission.excuse.revoke",
        entityType: "QuestionSubmission",
        entityId: sub.id,
        metadata: {
          studentId: sub.userId,
          reason,
          before: snapshot(sub),
          after: snapshot(updated),
        },
      },
    });
    return { updated, courseId: sub.question.courseId, userId: sub.userId };
  });

  await safeSync(db, courseId, [userId]);
  return updated;
}

// ---------------------------------------------------------------------------
// Deadline extensions and reopening
// ---------------------------------------------------------------------------

export async function grantDeadlineExtension(
  db: PrismaClient,
  args: {
    questionId: string;
    userId: string;
    newDueAt: Date;
    reason?: string | null;
    actorId: string;
    /** true = also clear the existing grade so the student can edit and be regraded */
    reopen?: boolean;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const { questionId, userId, newDueAt } = args;
  if (Number.isNaN(newDueAt.getTime()) || newDueAt.getTime() <= now.getTime()) {
    throw new GradingError(
      "INVALID_DATE",
      "New deadline must be in the future",
    );
  }

  const { extension, courseId } = await inTx(db, async (tx) => {
    const question = await tx.question.findFirst({
      where: { id: questionId, deletedAt: null, lectureId: { not: null } },
      select: { courseId: true, dueAt: true },
    });
    if (!question) throw new GradingError("NOT_FOUND");
    if (question.dueAt && newDueAt.getTime() <= question.dueAt.getTime()) {
      throw new GradingError(
        "INVALID_DATE",
        "An extension must be later than the question deadline",
      );
    }

    const enrollment = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: question.courseId } },
    });
    if (!enrollment) throw new GradingError("NOT_ENROLLED");

    const extension = await tx.deadlineExtension.upsert({
      where: { questionId_userId: { questionId, userId } },
      create: {
        questionId,
        userId,
        newDueAt,
        reason: args.reason?.trim() || null,
        grantedById: args.actorId,
      },
      update: {
        newDueAt,
        reason: args.reason?.trim() || null,
        grantedById: args.actorId,
      },
    });

    // If the student already submitted, re-evaluate lateness against the new deadline
    const sub = await tx.questionSubmission.findUnique({
      where: { questionId_userId: { questionId, userId } },
    });
    if (sub) {
      const due = effectiveDueAt(question.dueAt, newDueAt);
      const isLate = isLateAt(sub.submittedAt, due);

      let data: Prisma.QuestionSubmissionUncheckedUpdateInput;
      if (args.reopen) {
        data = {
          isLate,
          rawScore: null,
          finalScore: null,
          penaltyType: "NONE",
          penaltyValue: 0,
          gradedAt: null,
          gradedById: null,
          releasedAt: null,
        };
      } else if (sub.rawScore != null && isLate !== sub.isLate) {
        data = {
          isLate,
          finalScore: computeFinalScore({
            rawScore: toNum(sub.rawScore),
            isLate,
            excuseGranted: sub.excuseGranted,
            penaltyType: sub.penaltyType,
            penaltyValue: toNum(sub.penaltyValue),
          }),
        };
      } else {
        data = { isLate };
      }
      await tx.questionSubmission.update({ where: { id: sub.id }, data });
    }

    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: args.reopen ? "submission.reopen" : "submission.extend",
        entityType: "Question",
        entityId: questionId,
        metadata: {
          studentId: userId,
          newDueAt: newDueAt.toISOString(),
          reason: args.reason?.trim() || null,
          previousGrade: sub ? snapshot(sub) : null,
        },
      },
    });
    return { extension, courseId: question.courseId };
  });

  await safeSync(db, courseId, [userId]);
  return extension;
}

/** Instructor "reopen": new deadline for the student and their old grade cleared. */
export function reopenSubmission(
  db: PrismaClient,
  args: Omit<Parameters<typeof grantDeadlineExtension>[1], "reopen">,
) {
  return grantDeadlineExtension(db, { ...args, reopen: true });
}
