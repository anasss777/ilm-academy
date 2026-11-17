// lib/eligibility/loader.ts
//
// The database layer around the pure functions in ./eligibility.ts.
//
// IMPORTANT: nothing here checks permissions. Route handlers / server actions must verify
//   - certificate.review  before decideCertificate
//   - certificate.export  before exportCertificates
//   - certificate.configure before publishCertificateRequirement
// and that the actor may act on this course.
//
// Call syncCertificateReviews(db, courseId) after anything that can change a result:
// attendance saved, submission graded/released/excused, exam graded/reopened,
// enrollment withdrawn/re-activated, lecture published or deleted.
// (publishCertificateRequirement already does it for you.)

// ADJUST this import to your generator `output` path (same as prisma/seed.ts).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  decideReview,
  evaluateEligibility,
  reconcileReview,
  type AttendanceStatus,
  type EligibilityResult,
  type ExamAttemptInput,
  type RequirementInput,
  type ReviewState,
} from "./eligibility";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Interactive transactions run many sequential round trips. Against a remote database
 * (or from a distant dev machine) Prisma's 5s default timeout is too tight, so every
 * transaction in the app uses these options.
 */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

const toNum = (d: { toNumber(): number }) => d.toNumber();
const toNumOrNull = (d: { toNumber(): number } | null | undefined) =>
  d == null ? null : d.toNumber();

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Course context (loaded once per course, shared by every student)
// ---------------------------------------------------------------------------

export interface CourseEligibilityContext {
  courseId: string;
  certificateEnabled: boolean;
  /** 0 when the course has no certificate requirement row yet */
  requirementVersion: number;
  /** Thresholds with the course's feature toggles applied (disabled feature => null) */
  requirement: RequirementInput;
  partialWeight: number;
  heldLectureIds: string[];
  questions: { id: string; lectureId: string; points: number }[];
  exam: { id: string; maxScore: number } | null;
}

export async function loadCourseContext(
  db: Db,
  courseId: string,
  now: Date = new Date(),
): Promise<CourseEligibilityContext> {
  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    include: {
      settings: true,
      certificateRequirements: { where: { isCurrent: true }, take: 1 },
    },
  });
  const req = course.certificateRequirements[0];

  // "Held" = published, not deleted, already ended
  const lectures = await db.lecture.findMany({
    where: {
      courseId,
      status: "PUBLISHED",
      deletedAt: null,
      endsAt: { lte: now },
    },
    select: { id: true },
  });
  const heldLectureIds = lectures.map((l) => l.id);

  const questionRows =
    course.questionsEnabled && heldLectureIds.length > 0
      ? await db.question.findMany({
          where: {
            courseId,
            lectureId: { in: heldLectureIds },
            status: "PUBLISHED",
            deletedAt: null,
          },
          select: { id: true, lectureId: true, points: true },
        })
      : [];

  // One exam per course is assumed (the oldest published one)
  const examRow = course.examEnabled
    ? await db.exam.findFirst({
        where: { courseId, status: "PUBLISHED", deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          questions: {
            where: { status: "PUBLISHED", deletedAt: null },
            select: { points: true },
          },
        },
      })
    : null;

  return {
    courseId,
    certificateEnabled: course.certificateEnabled,
    requirementVersion: req?.version ?? 0,
    requirement: {
      minAttendancePercent: course.attendanceEnabled
        ? toNumOrNull(req?.minAttendancePercent)
        : null,
      minQuestionScorePercent: course.questionsEnabled
        ? toNumOrNull(req?.minQuestionScorePercent)
        : null,
      minExamPercent: course.examEnabled
        ? toNumOrNull(req?.minExamPercent)
        : null,
    },
    partialWeight: course.settings ? toNum(course.settings.partialWeight) : 1,
    heldLectureIds,
    questions: questionRows.map((q) => ({
      id: q.id,
      lectureId: q.lectureId as string,
      points: toNum(q.points),
    })),
    exam: examRow
      ? {
          id: examRow.id,
          maxScore: examRow.questions.reduce((s, q) => s + toNum(q.points), 0),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Live evaluation for many students (batched, no per-student queries)
// ---------------------------------------------------------------------------

export async function evaluateStudents(
  db: Db,
  ctx: CourseEligibilityContext,
  userIds: string[],
): Promise<Map<string, EligibilityResult>> {
  const results = new Map<string, EligibilityResult>();
  const questionIds = ctx.questions.map((q) => q.id);

  for (const ids of chunk(userIds, 500)) {
    // Sequential on purpose: when `db` is a transaction client, concurrent queries share one
    // connection, which `pg` warns about and will reject in a future major version.
    const attendance =
      ctx.heldLectureIds.length > 0
        ? await db.attendanceRecord.findMany({
            where: {
              courseId: ctx.courseId,
              userId: { in: ids },
              lectureId: { in: ctx.heldLectureIds },
            },
            select: { userId: true, lectureId: true, status: true },
          })
        : [];
    const submissions =
      questionIds.length > 0
        ? await db.questionSubmission.findMany({
            where: { userId: { in: ids }, questionId: { in: questionIds } },
            select: { userId: true, questionId: true, finalScore: true },
          })
        : [];
    const attempts = ctx.exam
      ? await db.examAttempt.findMany({
          where: { examId: ctx.exam.id, userId: { in: ids } },
          select: { userId: true, status: true, totalScore: true },
        })
      : [];

    const attByUser = new Map<string, Map<string, AttendanceStatus>>();
    for (const a of attendance) {
      let m = attByUser.get(a.userId);
      if (!m) attByUser.set(a.userId, (m = new Map()));
      m.set(a.lectureId, a.status);
    }
    const subByUser = new Map<string, Map<string, number | null>>();
    for (const s of submissions) {
      let m = subByUser.get(s.userId);
      if (!m) subByUser.set(s.userId, (m = new Map()));
      m.set(s.questionId, toNumOrNull(s.finalScore));
    }
    const attemptsByUser = new Map<string, ExamAttemptInput[]>();
    for (const a of attempts) {
      const list = attemptsByUser.get(a.userId) ?? [];
      list.push({ status: a.status, totalScore: toNumOrNull(a.totalScore) });
      attemptsByUser.set(a.userId, list);
    }

    for (const userId of ids) {
      const att = attByUser.get(userId);
      const subs = subByUser.get(userId);
      results.set(
        userId,
        evaluateEligibility({
          requirement: ctx.requirement,
          partialWeight: ctx.partialWeight,
          lectures: ctx.heldLectureIds.map((id) => ({
            status: att?.get(id) ?? null,
          })),
          questions: ctx.questions.map((q) => ({
            points: q.points,
            excused: att?.get(q.lectureId) === "EXCUSED",
            submission: subs?.has(q.id)
              ? { finalScore: subs.get(q.id) ?? null }
              : null,
          })),
          exam: ctx.exam
            ? {
                maxScore: ctx.exam.maxScore,
                attempts: attemptsByUser.get(userId) ?? [],
              }
            : null,
        }),
      );
    }
  }
  return results;
}

/** Student dashboard: live result plus the stored review status. */
export async function getStudentEligibility(
  db: Db,
  courseId: string,
  userId: string,
) {
  const ctx = await loadCourseContext(db, courseId);
  const result = (await evaluateStudents(db, ctx, [userId])).get(userId)!;
  const review = await db.certificateReview.findUnique({
    where: { courseId_userId: { courseId, userId } },
    select: { status: true, needsReReview: true },
  });
  return {
    requirement: ctx.requirement,
    requirementVersion: ctx.requirementVersion,
    result,
    review,
  };
}

// ---------------------------------------------------------------------------
// Keep certificate_reviews in sync with live results
// ---------------------------------------------------------------------------

const sameState = (a: ReviewState, b: ReviewState) =>
  a.status === b.status &&
  a.requirementVersion === b.requirementVersion &&
  a.needsReReview === b.needsReReview &&
  a.overrideReason === b.overrideReason;

export async function syncCertificateReviews(
  db: Db,
  courseId: string,
  opts: { userIds?: string[]; now?: Date } = {},
) {
  const ctx = await loadCourseContext(db, courseId, opts.now);
  if (!ctx.certificateEnabled) return { evaluated: 0, created: 0, updated: 0 };

  const userIds =
    opts.userIds ??
    (
      await db.enrollment.findMany({
        where: { courseId, status: "ACTIVE" },
        select: { userId: true },
      })
    ).map((e) => e.userId);

  const results = await evaluateStudents(db, ctx, userIds);
  const existing = await db.certificateReview.findMany({ where: { courseId } });
  const byUser = new Map(existing.map((r) => [r.userId, r]));

  const toCreate: Prisma.CertificateReviewCreateManyInput[] = [];
  const toUpdate: { id: string; next: ReviewState }[] = [];

  for (const userId of userIds) {
    const row = byUser.get(userId);
    const current: ReviewState = row
      ? {
          status: row.status,
          requirementVersion: row.requirementVersion,
          needsReReview: row.needsReReview,
          overrideReason: row.overrideReason,
        }
      : {
          status: "PENDING",
          requirementVersion: null,
          needsReReview: false,
          overrideReason: null,
        };

    const next = reconcileReview(
      current,
      results.get(userId)!.status,
      ctx.requirementVersion,
    );

    if (!row) toCreate.push({ courseId, userId, ...next });
    else if (!sameState(current, next)) toUpdate.push({ id: row.id, next });
  }

  if (toCreate.length) {
    await db.certificateReview.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }
  for (const batch of chunk(toUpdate, 25)) {
    await Promise.all(
      batch.map((u) =>
        db.certificateReview.update({ where: { id: u.id }, data: u.next }),
      ),
    );
  }
  return {
    evaluated: userIds.length,
    created: toCreate.length,
    updated: toUpdate.length,
  };
}

// ---------------------------------------------------------------------------
// Instructor decision
// ---------------------------------------------------------------------------

export async function decideCertificate(
  db: PrismaClient,
  args: {
    courseId: string;
    userId: string;
    decision: "APPROVED" | "REJECTED";
    reason?: string | null;
    actorId: string;
  },
) {
  const { courseId, userId, decision, actorId } = args;
  return db.$transaction(async (tx) => {
    const ctx = await loadCourseContext(tx, courseId);
    if (!ctx.certificateEnabled) throw new Error("CERTIFICATES_DISABLED");

    const enrollment = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment || enrollment.status !== "ACTIVE")
      throw new Error("NOT_ENROLLED");

    const live = (await evaluateStudents(tx, ctx, [userId])).get(userId)!;
    // Throws OVERRIDE_REASON_REQUIRED when the decision contradicts the auto result
    const next = decideReview({
      auto: live.status,
      decision,
      currentVersion: ctx.requirementVersion,
      reason: args.reason,
    });

    const now = new Date();
    const review = await tx.certificateReview.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: {
        courseId,
        userId,
        ...next,
        decidedById: actorId,
        decidedAt: now,
      },
      update: { ...next, decidedById: actorId, decidedAt: now },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "certificate.decide",
        entityType: "CertificateReview",
        entityId: review.id,
        metadata: {
          courseId,
          studentId: userId,
          decision,
          autoStatus: live.status,
          requirementVersion: ctx.requirementVersion,
          overrideReason: next.overrideReason,
        },
      },
    });
    return review;
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Requirements: versioned, then re-sync so decided reviews get flagged
// ---------------------------------------------------------------------------

export async function publishCertificateRequirement(
  db: PrismaClient,
  args: {
    courseId: string;
    thresholds: RequirementInput; // null = requirement disabled
    actorId: string;
  },
) {
  const { courseId, thresholds, actorId } = args;

  const created = await db.$transaction(async (tx) => {
    const latest = await tx.certificateRequirement.findFirst({
      where: { courseId },
      orderBy: { version: "desc" },
    });
    // Retire the old row first: the partial unique index allows only one current row
    await tx.certificateRequirement.updateMany({
      where: { courseId, isCurrent: true },
      data: { isCurrent: false },
    });
    const row = await tx.certificateRequirement.create({
      data: {
        courseId,
        version: (latest?.version ?? 0) + 1,
        isCurrent: true,
        minAttendancePercent: thresholds.minAttendancePercent,
        minQuestionScorePercent: thresholds.minQuestionScorePercent,
        minExamPercent: thresholds.minExamPercent,
        createdById: actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "certificate.requirements.update",
        entityType: "CertificateRequirement",
        entityId: row.id,
        metadata: { courseId, version: row.version, thresholds },
      },
    });
    return row;
  }, TX_OPTIONS);

  // Outside the transaction: this can touch every student in the course
  const sync = await syncCertificateReviews(db, courseId);
  return { requirement: created, sync };
}

// ---------------------------------------------------------------------------
// Export: snapshot of approved, current, consenting candidates
// ---------------------------------------------------------------------------

export async function exportCertificates(
  db: PrismaClient,
  args: { courseId: string; actorId: string },
) {
  const { courseId, actorId } = args;
  return db.$transaction(async (tx) => {
    const ctx = await loadCourseContext(tx, courseId);
    if (!ctx.certificateEnabled) throw new Error("CERTIFICATES_DISABLED");

    const approved = await tx.certificateReview.findMany({
      where: { courseId, status: "APPROVED", needsReReview: false },
      include: { user: true },
    });
    const active = new Set(
      (
        await tx.enrollment.findMany({
          where: { courseId, status: "ACTIVE" },
          select: { userId: true },
        })
      ).map((e) => e.userId),
    );

    const candidates = approved.filter(
      (r) => active.has(r.userId) && r.user.deletedAt == null,
    );
    const exportable = candidates.filter(
      (r) => r.user.dataSharingConsentAt != null,
    );
    const skippedNoConsent = candidates
      .filter((r) => r.user.dataSharingConsentAt == null)
      .map((r) => r.userId);

    if (exportable.length === 0) throw new Error("NOTHING_TO_EXPORT");

    const results = await evaluateStudents(
      tx,
      ctx,
      exportable.map((r) => r.userId),
    );

    const exportRow = await tx.certificateExport.create({
      data: {
        courseId,
        exportedById: actorId,
        requirementVersion: ctx.requirementVersion,
        itemCount: exportable.length,
        rulesSnapshot: {
          requirementVersion: ctx.requirementVersion,
          thresholds: ctx.requirement,
          partialWeight: ctx.partialWeight,
          heldLecturesAtExport: ctx.heldLectureIds.length,
          exportedAt: new Date().toISOString(),
        },
        items: {
          create: exportable.map((r) => {
            const res = results.get(r.userId)!;
            return {
              userId: r.userId,
              fullName: r.user.fullName,
              email: r.user.email,
              phone: r.user.phone,
              country: r.user.country,
              totalLectures: res.attendance.heldLectures,
              attendedLectures: res.attendance.attended,
              requiredLectures: res.attendance.requiredLectures,
              attendancePercent: res.attendance.percent,
              questionScorePercent: res.questions.percent,
              examPercent: res.exam.percent,
            };
          }),
        },
      },
      include: { items: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "certificate.export",
        entityType: "CertificateExport",
        entityId: exportRow.id,
        metadata: {
          courseId,
          count: exportable.length,
          skippedNoConsent: skippedNoConsent.length,
          requirementVersion: ctx.requirementVersion,
        },
      },
    });

    return { export: exportRow, skippedNoConsent };
  }, TX_OPTIONS);
}
