// lib/read/service.ts
// Student- and visitor-facing reads. Every function:
//   * selects an explicit list of columns (never `include` a whole row),
//   * decides visibility with the pure rules in ./visibility,
//   * builds its response from explicit fields, so a new database column can never leak.
// Nothing here checks staff permissions: staff use other endpoints.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { studentAttemptDto, studentSubmissionDto } from "../api/dto";
import { allowedAttempts, effectiveExamDueAt } from "../exams/exam";
import {
  GradingError,
  effectiveDueAt,
  shouldRevealAnswers,
  type AnswerRevealMode,
} from "../grading/grading";
import { projectQuestionForStudent } from "./project";
import {
  canSeeByVisibility,
  canSeeZoom,
  examAvailability,
  lectureState,
  questionSubmissionState,
  shouldRevealExamKeys,
  type Visibility,
} from "./visibility";

type Dec = { toNumber(): number };
const num = (d: Dec) => d.toNumber();
const numOrNull = (d: Dec | null | undefined) => (d == null ? null : d.toNumber());
const blankToNull = (s: string | null) => (s && s.trim() ? s : null);
const DEFAULT_REVEAL: AnswerRevealMode = "AFTER_GRADE_AND_DEADLINE";

async function isActivelyEnrolled(db: PrismaClient, userId: string | null, courseId: string) {
  if (!userId) return false;
  const e = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { status: true },
  });
  return e?.status === "ACTIVE";
}

async function requireEnrolled(db: PrismaClient, userId: string, courseId: string) {
  if (!(await isActivelyEnrolled(db, userId, courseId))) throw new GradingError("NOT_ENROLLED");
}

function zoomFor(
  l: { zoomUrl: string | null; zoomMeetingId: string | null; zoomPassword: string | null; endsAt: Date },
  enrolled: boolean,
  now: Date,
) {
  if (!l.zoomUrl || !canSeeZoom({ enrolled, now, endsAt: l.endsAt })) return null;
  return { url: l.zoomUrl, meetingId: l.zoomMeetingId, password: l.zoomPassword };
}

// ---------------------------------------------------------------------------
// Public: catalog and course overview
// ---------------------------------------------------------------------------

export async function listPublishedCourses(
  db: PrismaClient,
  args: { q?: string; page: number; pageSize: number },
) {
  const { q, page, pageSize } = args;
  const ci = "insensitive" as const;
  const where = {
    status: "PUBLISHED" as const,
    ...(q
      ? {
          OR: [
            { titleAr: { contains: q, mode: ci } },
            { titleEn: { contains: q, mode: ci } },
            { shortDescAr: { contains: q, mode: ci } },
            { shortDescEn: { contains: q, mode: ci } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.course.count({ where }),
    db.course.findMany({
      where,
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        titleAr: true,
        titleEn: true,
        shortDescAr: true,
        shortDescEn: true,
        coverImagePath: true,
        language: true,
        enrollmentOpen: true,
        certificateEnabled: true,
        instructors: {
          orderBy: { displayOrder: "asc" },
          select: { user: { select: { fullName: true } } },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    items: rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      titleAr: c.titleAr,
      titleEn: c.titleEn,
      shortDescAr: c.shortDescAr,
      shortDescEn: c.shortDescEn,
      coverImagePath: c.coverImagePath,
      language: c.language,
      enrollmentOpen: c.enrollmentOpen,
      certificateEnabled: c.certificateEnabled,
      instructors: c.instructors.map((i) => i.user.fullName),
    })),
  };
}

export async function getCourseOverviewBySlug(
  db: PrismaClient,
  args: { slug: string; viewerId: string | null; now?: Date },
) {
  const now = args.now ?? new Date();
  const course = await db.course.findFirst({
    where: { slug: args.slug },
    select: {
      id: true,
      slug: true,
      status: true,
      titleAr: true,
      titleEn: true,
      shortDescAr: true,
      shortDescEn: true,
      descriptionAr: true,
      descriptionEn: true,
      coverImagePath: true,
      language: true,
      enrollmentOpen: true,
      targetAudienceAr: true,
      targetAudienceEn: true,
      prerequisitesAr: true,
      prerequisitesEn: true,
      formatAr: true,
      formatEn: true,
      lectureFrequencyAr: true,
      lectureFrequencyEn: true,
      attendanceEnabled: true,
      questionsEnabled: true,
      examEnabled: true,
      certificateEnabled: true,
      recordingsEnabled: true,
      publishedAt: true,
      objectives: { orderBy: { position: "asc" }, select: { textAr: true, textEn: true } },
      faqs: {
        orderBy: { position: "asc" },
        select: { questionAr: true, questionEn: true, answerAr: true, answerEn: true },
      },
      instructors: {
        orderBy: { displayOrder: "asc" },
        select: { user: { select: { fullName: true, bioAr: true, bioEn: true, avatarPath: true } } },
      },
    },
  });
  // Drafts do not exist for the public
  if (!course || course.status === "DRAFT") throw new GradingError("NOT_FOUND");

  const enrolled = await isActivelyEnrolled(db, args.viewerId, course.id);
  // Archived courses stay reachable only for the students who are in them
  if (course.status === "ARCHIVED" && !enrolled) throw new GradingError("NOT_FOUND");

  const nextLecture = await db.lecture.findFirst({
    where: { courseId: course.id, status: "PUBLISHED", deletedAt: null, endsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    select: { number: true, titleAr: true, titleEn: true, startsAt: true, endsAt: true, timezone: true },
  });
  const requirement = course.certificateEnabled
    ? await db.certificateRequirement.findFirst({
        where: { courseId: course.id, isCurrent: true },
        select: { minAttendancePercent: true, minQuestionScorePercent: true, minExamPercent: true },
      })
    : null;

  return {
    id: course.id,
    slug: course.slug,
    status: course.status,
    titleAr: course.titleAr,
    titleEn: course.titleEn,
    shortDescAr: course.shortDescAr,
    shortDescEn: course.shortDescEn,
    descriptionAr: course.descriptionAr,
    descriptionEn: course.descriptionEn,
    coverImagePath: course.coverImagePath,
    language: course.language,
    enrollmentOpen: course.enrollmentOpen,
    targetAudienceAr: course.targetAudienceAr,
    targetAudienceEn: course.targetAudienceEn,
    // Hidden entirely when the course has no prerequisites
    prerequisitesAr: blankToNull(course.prerequisitesAr),
    prerequisitesEn: blankToNull(course.prerequisitesEn),
    formatAr: course.formatAr,
    formatEn: course.formatEn,
    lectureFrequencyAr: course.lectureFrequencyAr,
    lectureFrequencyEn: course.lectureFrequencyEn,
    features: {
      attendance: course.attendanceEnabled,
      questions: course.questionsEnabled,
      exam: course.examEnabled,
      certificate: course.certificateEnabled,
      recordings: course.recordingsEnabled,
    },
    certificate: course.certificateEnabled
      ? {
          minAttendancePercent: numOrNull(requirement?.minAttendancePercent),
          minQuestionScorePercent: numOrNull(requirement?.minQuestionScorePercent),
          minExamPercent: numOrNull(requirement?.minExamPercent),
        }
      : null,
    objectives: course.objectives,
    faqs: course.faqs,
    instructors: course.instructors.map((i) => i.user),
    // No zoom details here: the public page only announces that a lecture exists
    nextLecture,
    viewer: { signedIn: args.viewerId != null, enrolled },
  };
}

// ---------------------------------------------------------------------------
// Student: course home, lectures, lecture detail
// ---------------------------------------------------------------------------

export async function getCourseDashboard(
  db: PrismaClient,
  args: { userId: string; courseId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  await requireEnrolled(db, args.userId, args.courseId);

  const course = await db.course.findUnique({
    where: { id: args.courseId },
    select: {
      id: true,
      slug: true,
      status: true,
      titleAr: true,
      titleEn: true,
      attendanceEnabled: true,
      questionsEnabled: true,
      examEnabled: true,
      certificateEnabled: true,
      recordingsEnabled: true,
    },
  });
  if (!course || course.status === "DRAFT") throw new GradingError("NOT_FOUND");

  const next = await db.lecture.findFirst({
    where: { courseId: course.id, status: "PUBLISHED", deletedAt: null, endsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true, number: true, titleAr: true, titleEn: true, startsAt: true, endsAt: true,
      timezone: true, zoomUrl: true, zoomMeetingId: true, zoomPassword: true,
    },
  });
  const materials = await db.material.findMany({
    where: { courseId: course.id, lectureId: null, status: "PUBLISHED", deletedAt: null },
    orderBy: { position: "asc" },
    select: { id: true, titleAr: true, titleEn: true, type: true, storagePath: true, externalUrl: true },
  });
  const exam = course.examEnabled
    ? await db.exam.findFirst({
        where: { courseId: course.id, status: "PUBLISHED", deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    : null;

  return {
    course: {
      id: course.id,
      slug: course.slug,
      status: course.status,
      titleAr: course.titleAr,
      titleEn: course.titleEn,
      features: {
        attendance: course.attendanceEnabled,
        questions: course.questionsEnabled,
        exam: course.examEnabled,
        certificate: course.certificateEnabled,
        recordings: course.recordingsEnabled,
      },
    },
    nextLecture: next
      ? {
          id: next.id,
          number: next.number,
          titleAr: next.titleAr,
          titleEn: next.titleEn,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
          timezone: next.timezone,
          state: lectureState(now, next.startsAt, next.endsAt),
          zoom: zoomFor(next, true, now),
        }
      : null,
    materials,
    examId: exam?.id ?? null,
  };
}

interface QuestionSummary {
  id: string;
  type: string;
  points: number;
  /** The student's own deadline (their extension, if any) */
  dueAt: Date | null;
  status: "NOT_SUBMITTED" | "SUBMITTED" | "GRADED";
  /** Visible only once the grade has been released */
  score: number | null;
}

async function questionSummaries(db: PrismaClient, userId: string, lectureIds: string[]) {
  const out = new Map<string, QuestionSummary[]>();
  if (lectureIds.length === 0) return out;

  const questions = await db.question.findMany({
    where: { lectureId: { in: lectureIds }, status: "PUBLISHED", deletedAt: null },
    orderBy: { position: "asc" },
    select: { id: true, lectureId: true, type: true, points: true, dueAt: true },
  });
  if (questions.length === 0) return out;

  const ids = questions.map((q) => q.id);
  const subs = await db.questionSubmission.findMany({
    where: { userId, questionId: { in: ids } },
    select: { questionId: true, releasedAt: true, finalScore: true },
  });
  const exts = await db.deadlineExtension.findMany({
    where: { userId, questionId: { in: ids } },
    select: { questionId: true, newDueAt: true },
  });
  const subBy = new Map(subs.map((s) => [s.questionId, s]));
  const extBy = new Map(exts.map((e) => [e.questionId, e.newDueAt]));

  for (const q of questions) {
    const s = subBy.get(q.id);
    const released = s?.releasedAt != null;
    const summary: QuestionSummary = {
      id: q.id,
      type: q.type,
      points: num(q.points),
      dueAt: effectiveDueAt(q.dueAt, extBy.get(q.id) ?? null),
      status: !s ? "NOT_SUBMITTED" : released ? "GRADED" : "SUBMITTED",
      score: released ? numOrNull(s!.finalScore) : null,
    };
    const list = out.get(q.lectureId as string) ?? [];
    list.push(summary);
    out.set(q.lectureId as string, list);
  }
  return out;
}

export async function getLecturesForStudent(
  db: PrismaClient,
  args: { userId: string; courseId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  await requireEnrolled(db, args.userId, args.courseId);

  const lectures = await db.lecture.findMany({
    where: { courseId: args.courseId, status: "PUBLISHED", deletedAt: null },
    orderBy: { startsAt: "asc" },
    select: {
      id: true, number: true, titleAr: true, titleEn: true, startsAt: true, endsAt: true,
      timezone: true, zoomUrl: true, zoomMeetingId: true, zoomPassword: true,
    },
  });
  const ids = lectures.map((l) => l.id);

  const attendance = ids.length
    ? await db.attendanceRecord.findMany({
        where: { userId: args.userId, lectureId: { in: ids } },
        select: { lectureId: true, status: true },
      })
    : [];
  const recordings = ids.length
    ? await db.recording.findMany({
        where: { lectureId: { in: ids }, status: "PUBLISHED" },
        select: { lectureId: true },
      })
    : [];
  const summaries = await questionSummaries(db, args.userId, ids);

  const attBy = new Map(attendance.map((a) => [a.lectureId, a.status]));
  const recCount = new Map<string, number>();
  for (const r of recordings) recCount.set(r.lectureId, (recCount.get(r.lectureId) ?? 0) + 1);

  return {
    lectures: lectures.map((l) => ({
      id: l.id,
      number: l.number,
      titleAr: l.titleAr,
      titleEn: l.titleEn,
      startsAt: l.startsAt,
      endsAt: l.endsAt,
      timezone: l.timezone,
      state: lectureState(now, l.startsAt, l.endsAt),
      zoom: zoomFor(l, true, now),
      // null = staff have not recorded it (not the same as absent)
      attendance: attBy.get(l.id) ?? null,
      recordingCount: recCount.get(l.id) ?? 0,
      questions: summaries.get(l.id) ?? [],
    })),
  };
}

export async function getLectureDetail(
  db: PrismaClient,
  args: { lectureId: string; viewerId: string | null; now?: Date },
) {
  const now = args.now ?? new Date();
  const lecture = await db.lecture.findFirst({
    where: { id: args.lectureId, status: "PUBLISHED", deletedAt: null },
    select: {
      id: true, courseId: true, number: true, titleAr: true, titleEn: true,
      descriptionAr: true, descriptionEn: true, startsAt: true, endsAt: true, timezone: true,
      zoomUrl: true, zoomMeetingId: true, zoomPassword: true,
      course: { select: { status: true, recordingsEnabled: true } },
    },
  });
  if (!lecture || lecture.course.status === "DRAFT") throw new GradingError("NOT_FOUND");

  const enrolled = await isActivelyEnrolled(db, args.viewerId, lecture.courseId);
  if (lecture.course.status === "ARCHIVED" && !enrolled) throw new GradingError("NOT_FOUND");
  const viewer = { signedIn: args.viewerId != null, enrolled };

  const recordings = lecture.course.recordingsEnabled
    ? await db.recording.findMany({
        where: { lectureId: lecture.id, status: "PUBLISHED" },
        orderBy: { position: "asc" },
        select: {
          id: true, titleAr: true, titleEn: true, provider: true, url: true, embedUrl: true,
          durationSeconds: true, visibility: true,
        },
      })
    : [];
  const materials = await db.material.findMany({
    where: { lectureId: lecture.id, status: "PUBLISHED", deletedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true, titleAr: true, titleEn: true, type: true, storagePath: true, externalUrl: true,
      visibility: true,
    },
  });

  let attendance: string | null = null;
  let questions: QuestionSummary[] = [];
  if (enrolled && args.viewerId) {
    const rec = await db.attendanceRecord.findUnique({
      where: { lectureId_userId: { lectureId: lecture.id, userId: args.viewerId } },
      select: { status: true },
    });
    attendance = rec?.status ?? null;
    questions = (await questionSummaries(db, args.viewerId, [lecture.id])).get(lecture.id) ?? [];
  }

  const visible = <T extends { visibility: Visibility }>(rows: T[]) =>
    rows
      .filter((r) => canSeeByVisibility(r.visibility, viewer))
      .map(({ visibility: _v, ...rest }) => rest);

  return {
    id: lecture.id,
    courseId: lecture.courseId,
    number: lecture.number,
    titleAr: lecture.titleAr,
    titleEn: lecture.titleEn,
    descriptionAr: lecture.descriptionAr,
    descriptionEn: lecture.descriptionEn,
    startsAt: lecture.startsAt,
    endsAt: lecture.endsAt,
    timezone: lecture.timezone,
    state: lectureState(now, lecture.startsAt, lecture.endsAt),
    zoom: zoomFor(lecture, enrolled, now),
    recordings: visible(recordings),
    materials: visible(materials),
    attendance,
    questions,
    viewer,
  };
}

// ---------------------------------------------------------------------------
// Student: one lecture question
// ---------------------------------------------------------------------------

export async function getQuestionForStudent(
  db: PrismaClient,
  args: { userId: string; questionId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const q = await db.question.findFirst({
    where: { id: args.questionId, status: "PUBLISHED", deletedAt: null, lectureId: { not: null } },
    select: {
      id: true, courseId: true, type: true, body: true, points: true, explanation: true,
      dueAt: true, lateCutoffAt: true, allowLate: true,
      options: { select: { id: true, text: true, position: true, isCorrect: true } },
      lecture: { select: { status: true, deletedAt: true } },
      course: {
        select: {
          questionsEnabled: true,
          settings: { select: { answerRevealMode: true, allowLateSubmissions: true } },
        },
      },
    },
  });
  if (!q || !q.lecture || q.lecture.status !== "PUBLISHED" || q.lecture.deletedAt || !q.course.questionsEnabled) {
    throw new GradingError("NOT_FOUND");
  }
  await requireEnrolled(db, args.userId, q.courseId);

  const ext = await db.deadlineExtension.findUnique({
    where: { questionId_userId: { questionId: q.id, userId: args.userId } },
    select: { newDueAt: true },
  });
  const sub = await db.questionSubmission.findUnique({
    where: { questionId_userId: { questionId: q.id, userId: args.userId } },
    select: {
      id: true, questionId: true, submittedAt: true, isLate: true, excuseGranted: true,
      rawScore: true, finalScore: true, penaltyType: true, penaltyValue: true, feedback: true,
      gradedAt: true, releasedAt: true, answerText: true, selectedOptionId: true,
    },
  });

  const due = effectiveDueAt(q.dueAt, ext?.newDueAt ?? null);
  const allowLate = q.allowLate ?? q.course.settings?.allowLateSubmissions ?? true;
  const state = questionSubmissionState({
    now,
    dueAt: q.dueAt,
    lateCutoffAt: q.lateCutoffAt,
    extensionDueAt: ext?.newDueAt ?? null,
    allowLate,
    existing: sub ? { gradedAt: sub.gradedAt } : null,
  });
  const reveal = shouldRevealAnswers({
    mode: q.course.settings?.answerRevealMode ?? DEFAULT_REVEAL,
    gradeReleased: sub?.releasedAt != null,
    effectiveDueAt: due,
    now,
  });

  return {
    question: projectQuestionForStudent({ ...q, points: num(q.points) }, reveal),
    dueAt: due,
    lateCutoffAt: q.lateCutoffAt,
    allowLate,
    state,
    // The student's own answer and (released) grade
    submission: sub
      ? {
          ...studentSubmissionDto(sub),
          answerText: sub.answerText,
          selectedOptionId: sub.selectedOptionId,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Student: exams
// ---------------------------------------------------------------------------

/** The exam page. Questions are NOT included: they are only served inside an in-progress attempt. */
export async function getExamForStudent(
  db: PrismaClient,
  args: { userId: string; examId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const exam = await db.exam.findFirst({
    where: { id: args.examId, status: "PUBLISHED", deletedAt: null },
    select: {
      id: true, courseId: true, titleAr: true, titleEn: true, descriptionAr: true,
      descriptionEn: true, opensAt: true, dueAt: true, attemptLimit: true, passingPercent: true,
      course: { select: { examEnabled: true } },
      questions: { where: { status: "PUBLISHED", deletedAt: null }, select: { points: true } },
    },
  });
  if (!exam || !exam.course.examEnabled) throw new GradingError("NOT_FOUND");
  await requireEnrolled(db, args.userId, exam.courseId);

  const grants = await db.examAttemptGrant.findMany({
    where: { examId: exam.id, userId: args.userId },
    select: { extraAttempts: true, newDueAt: true },
  });
  const attempts = await db.examAttempt.findMany({
    where: { examId: exam.id, userId: args.userId },
    orderBy: { attemptNumber: "asc" },
    select: {
      id: true, examId: true, attemptNumber: true, status: true, startedAt: true,
      submittedAt: true, totalScore: true, releasedAt: true,
    },
  });

  const due = effectiveExamDueAt(exam.dueAt, grants);
  const allowed = allowedAttempts(exam.attemptLimit, grants);
  const avail = examAvailability({
    now,
    opensAt: exam.opensAt,
    effectiveDueAt: due,
    attemptsUsed: attempts.length,
    allowed,
    hasInProgress: attempts.some((a) => a.status === "IN_PROGRESS"),
  });

  return {
    id: exam.id,
    titleAr: exam.titleAr,
    titleEn: exam.titleEn,
    descriptionAr: exam.descriptionAr,
    descriptionEn: exam.descriptionEn,
    opensAt: exam.opensAt,
    dueAt: due,
    maxScore: exam.questions.reduce((s, q) => s + num(q.points), 0),
    passingPercent: num(exam.passingPercent),
    attemptsAllowed: allowed,
    attemptsUsed: attempts.length,
    state: avail.state,
    canStart: avail.canStart,
    attempts: attempts.map(studentAttemptDto),
  };
}

/**
 * One attempt, shaped by where it is in its life:
 *   IN_PROGRESS -> the questions (no keys) and the answers saved so far
 *   PENDING     -> submitted, nothing to see until results are released
 *   RESULTS     -> scores and feedback; answer keys only if the reveal rules allow
 */
export async function getAttemptForStudent(
  db: PrismaClient,
  args: { userId: string; attemptId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const attempt = await db.examAttempt.findUnique({
    where: { id: args.attemptId },
    select: {
      id: true, examId: true, userId: true, attemptNumber: true, status: true, startedAt: true,
      submittedAt: true, totalScore: true, releasedAt: true,
      exam: {
        select: {
          courseId: true, dueAt: true, opensAt: true, attemptLimit: true, passingPercent: true,
          course: { select: { settings: { select: { answerRevealMode: true } } } },
        },
      },
    },
  });
  // Someone else's attempt looks exactly like a missing one
  if (!attempt || attempt.userId !== args.userId) throw new GradingError("NOT_FOUND");
  await requireEnrolled(db, args.userId, attempt.exam.courseId);

  const grants = await db.examAttemptGrant.findMany({
    where: { examId: attempt.examId, userId: args.userId },
    select: { extraAttempts: true, newDueAt: true },
  });
  const mine = await db.examAttempt.findMany({
    where: { examId: attempt.examId, userId: args.userId },
    select: { status: true },
  });
  const due = effectiveExamDueAt(attempt.exam.dueAt, grants);
  const avail = examAvailability({
    now,
    opensAt: attempt.exam.opensAt,
    effectiveDueAt: due,
    attemptsUsed: mine.length,
    allowed: allowedAttempts(attempt.exam.attemptLimit, grants),
    hasInProgress: mine.some((a) => a.status === "IN_PROGRESS"),
  });
  const base = studentAttemptDto(attempt);

  const questions = await db.question.findMany({
    where: { examId: attempt.examId, status: "PUBLISHED", deletedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true, type: true, body: true, points: true, explanation: true,
      options: { select: { id: true, text: true, position: true, isCorrect: true } },
    },
  });

  if (attempt.status === "IN_PROGRESS") {
    const saved = await db.examAnswer.findMany({
      where: { attemptId: attempt.id },
      select: { questionId: true, selectedOptionId: true, answerText: true },
    });
    return {
      mode: "IN_PROGRESS" as const,
      attempt: base,
      dueAt: due,
      expired: avail.state === "CLOSED",
      questions: questions.map((q) => projectQuestionForStudent({ ...q, points: num(q.points) }, false)),
      answers: saved,
    };
  }

  // Submitted, but results are not released yet: reveal nothing beyond the status
  if (!attempt.releasedAt) return { mode: "PENDING" as const, attempt: base };

  const answers = await db.examAnswer.findMany({
    where: { attemptId: attempt.id },
    select: { questionId: true, selectedOptionId: true, answerText: true, score: true, feedback: true },
  });
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const reveal = shouldRevealExamKeys({
    mode: attempt.exam.course.settings?.answerRevealMode ?? DEFAULT_REVEAL,
    gradeReleased: true,
    effectiveDueAt: due,
    now,
    canStillAttempt: avail.canStillAttempt,
  });
  const maxScore = questions.reduce((s, q) => s + num(q.points), 0);
  const total = numOrNull(attempt.totalScore);
  const passingPercent = num(attempt.exam.passingPercent);

  return {
    mode: "RESULTS" as const,
    attempt: base,
    maxScore,
    passingPercent,
    passed: total != null && maxScore > 0 ? (total / maxScore) * 100 >= passingPercent : null,
    revealed: reveal,
    results: questions.map((q) => {
      const a = byQuestion.get(q.id);
      return {
        question: projectQuestionForStudent({ ...q, points: num(q.points) }, reveal),
        myAnswer: a ? { selectedOptionId: a.selectedOptionId, answerText: a.answerText } : null,
        score: a ? numOrNull(a.score) : null,
        feedback: a?.feedback ?? null,
      };
    }),
  };
}
