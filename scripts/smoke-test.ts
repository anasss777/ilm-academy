// scripts/smoke-test.ts
//
// End-to-end smoke test of the eligibility + grading services against your REAL database.
// It creates a throwaway course ("smoke-test-<timestamp>") with 4 throwaway users
// ("smoke-...@example.test"), walks the main workflow, then deletes everything it created.
//
// Run:      npx tsx scripts/smoke-test.ts
// Clean up after a crashed run:   npx tsx scripts/smoke-test.ts --cleanup
//
// Only run this against a development database.

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
// ADJUST these two imports if your alias / generator output differ
import { PrismaClient } from "@/generated/prisma/client";
import {
  decideCertificate,
  exportCertificates,
  getStudentEligibility,
  publishCertificateRequirement,
  syncCertificateReviews,
} from "@/lib/eligibility/loader";
import {
  gradeSubmission,
  grantDeadlineExtension,
  releaseGrades,
  reopenSubmission,
  setExcuse,
  submitAnswer,
} from "@/lib/grading/service";
import {
  finalizeExpiredAttempts,
  gradeExamAnswer,
  grantExamAttempt,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "@/lib/exams/service";
import { enrollInCourse, withdrawFromCourse } from "@/lib/enrollment/service";
import {
  getAttemptForStudent,
  getCourseDashboard,
  getCourseOverviewBySlug,
  getExamForStudent,
  getLectureDetail,
  getLecturesForStudent,
  getQuestionForStudent,
  listPublishedCourses,
} from "@/lib/read/service";
import {
  createCourse,
  replaceCourseContent,
  setCourseInstructors,
  transitionCourse,
  updateCourse,
  updateCourseSettings,
} from "@/lib/staff/courses";
import { createLecture, deleteLecture } from "@/lib/staff/lectures";
import { createMaterial, createRecording } from "@/lib/staff/media";
import { listRoster, saveAttendance } from "@/lib/staff/attendance";
import {
  listCourseStudents,
  staffEnrollStudent,
  staffSetEnrollment,
} from "@/lib/staff/students";
import {
  createQuestion,
  getQuestionForStaff,
  listQuestionsForStaff,
  updateQuestion,
} from "@/lib/staff/questions";
import {
  createExam,
  deleteExam,
  getExamForStaff,
  updateExam,
} from "@/lib/staff/exams";
import {
  getAttemptForGrader,
  getCertificateExportCsv,
  listCertificateExports,
  listCertificateReviews,
  listExamAttempts,
  listSubmissionQueue,
} from "@/lib/staff/queues";
import { runMaintenance } from "@/lib/maintenance/service";
import { enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { getMaterialAccess } from "@/lib/read/materials";
import { GradingError } from "@/lib/grading/grading";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
});

// ---------------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(
      `  FAIL  ${name}${detail !== undefined ? `  -> ${String(detail)}` : ""}`,
    );
  }
}

async function expectError(
  name: string,
  fn: () => Promise<unknown>,
  code?: string,
) {
  try {
    await fn();
    check(name, false, "no error was thrown");
  } catch (e) {
    const got =
      e instanceof GradingError
        ? e.code
        : e instanceof Error
          ? e.message
          : String(e);
    check(name, code ? got === code : true, `got: ${got.slice(0, 160)}`);
  }
}

const section = (title: string) => console.log(`\n== ${title}`);
const n = (d: unknown) => (d == null ? null : Number(d));
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);

// ---------------------------------------------------------------------------
// Cleanup (also used by --cleanup). Finds everything by name prefix.
// ---------------------------------------------------------------------------

async function cleanup() {
  const courses = await prisma.course.findMany({
    where: { slug: { startsWith: "smoke-test-" } },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "smoke-" } },
    select: { id: true },
  });
  const courseIds = courses.map((c) => c.id);
  const userIds = users.map((u) => u.id);

  if (userIds.length)
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.rateLimit.deleteMany({
    where: { key: { startsWith: "smoke-" } },
  });
  if (courseIds.length) {
    const inCourse = { in: courseIds };
    await prisma.certificateExport.deleteMany({
      where: { courseId: inCourse },
    }); // items cascade
    await prisma.certificateReview.deleteMany({
      where: { courseId: inCourse },
    });
    await prisma.certificateRequirement.deleteMany({
      where: { courseId: inCourse },
    });
    await prisma.examAnswer.deleteMany({
      where: { attempt: { exam: { courseId: inCourse } } },
    });
    await prisma.examAttempt.deleteMany({
      where: { exam: { courseId: inCourse } },
    });
    await prisma.examAttemptGrant.deleteMany({
      where: { exam: { courseId: inCourse } },
    });
    await prisma.deadlineExtension.deleteMany({
      where: { question: { courseId: inCourse } },
    });
    await prisma.questionSubmission.deleteMany({
      where: { question: { courseId: inCourse } },
    });
    await prisma.question.deleteMany({ where: { courseId: inCourse } }); // options cascade
    await prisma.exam.deleteMany({ where: { courseId: inCourse } });
    await prisma.attendanceRecord.deleteMany({ where: { courseId: inCourse } });
    await prisma.material.deleteMany({ where: { courseId: inCourse } });
    await prisma.lecture.deleteMany({ where: { courseId: inCourse } });
    await prisma.enrollment.deleteMany({ where: { courseId: inCourse } });
    await prisma.course.deleteMany({ where: { id: inCourse } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const id of userIds) {
      await prisma.$executeRaw`DELETE FROM auth.users WHERE id = ${id}::uuid`;
    }
  }
  await prisma.$executeRaw`DELETE FROM auth.users WHERE email LIKE 'smoke-%@example.test'`;
  console.log(
    `Cleaned up ${courseIds.length} course(s) and ${userIds.length} user(s).`,
  );
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

async function createUser(label: string, consent: boolean) {
  const id = randomUUID();
  const email = `smoke-${label}-${Date.now()}@example.test`;
  // Same path as a real signup: only the auth row is inserted, and the database trigger
  // (profile_trigger.sql) creates the public.users profile from the metadata.
  const meta = JSON.stringify({
    full_name: `Smoke ${label}`,
    phone: "+21600000000",
    country: "TN",
    locale: "ar",
    data_sharing_consent: consent,
  });
  await prisma.$executeRaw`
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
    VALUES (${id}::uuid, 'authenticated', 'authenticated', ${email}, ${meta}::jsonb)`;
  return id;
}

async function run() {
  section("Setup");
  const ins = await createUser("instructor", false);
  const A = await createUser("studentA", true);
  const B = await createUser("studentB", true);
  const C = await createUser("studentC", false);
  const profiles = await prisma.user.findMany({
    where: { id: { in: [ins, A, B, C] } },
  });
  check(
    "the signup trigger created a profile row for each auth user",
    profiles.length === 4,
    profiles.length,
  );
  check(
    "profile data came from the signup metadata",
    profiles.length === 4 &&
      profiles.every(
        (p) =>
          p.country === "TN" && p.phone === "+21600000000" && p.locale === "ar",
      ),
  );
  check(
    "data-sharing consent was honoured (A yes, C no)",
    profiles.find((p) => p.id === A)?.dataSharingConsentAt != null &&
      profiles.find((p) => p.id === C)?.dataSharingConsentAt == null,
  );
  await expectError(
    "signup with invalid metadata is rejected by the trigger",
    () =>
      prisma.$executeRaw`
      INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
      VALUES (${randomUUID()}::uuid, 'authenticated', 'authenticated',
              ${`smoke-bad-${Date.now()}@example.test`}, ${'{"full_name":"X"}'}::jsonb)`,
  );

  const course = await prisma.course.create({
    data: {
      slug: `smoke-test-${Date.now()}`,
      titleAr: "دورة اختبار",
      status: "PUBLISHED",
      attendanceEnabled: true,
      questionsEnabled: true,
      examEnabled: false,
      certificateEnabled: true,
      settings: {
        create: {
          partialWeight: 1,
          allowLateSubmissions: true,
          defaultPenaltyType: "PERCENT",
          defaultPenaltyValue: 20,
        },
      },
    },
  });
  const courseId = course.id;

  await prisma.enrollment.createMany({
    data: [
      { userId: A, courseId, status: "ACTIVE" },
      { userId: B, courseId, status: "ACTIVE" },
      { userId: C, courseId, status: "WITHDRAWN", withdrawnAt: new Date() },
    ],
  });

  // 5 lectures, all already ended ("held")
  const lectures: Awaited<ReturnType<typeof prisma.lecture.create>>[] = [];
  for (let i = 1; i <= 5; i++) {
    const startsAt = at(-(7 - i));
    lectures.push(
      await prisma.lecture.create({
        data: {
          courseId,
          number: i,
          titleAr: `محاضرة ${i}`,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
          status: "PUBLISHED",
        },
      }),
    );
  }

  const mkQ = (idx: number, data: object) =>
    prisma.question.create({
      data: {
        courseId,
        lectureId: lectures[idx].id,
        body: `Question ${idx + 1}`,
        points: 10,
        status: "PUBLISHED",
        ...data,
      } as never,
      include: { options: true },
    });

  const q1 = await mkQ(0, {
    type: "MULTIPLE_CHOICE",
    dueAt: at(7),
    options: {
      create: [
        { text: "Wrong", isCorrect: false, position: 0 },
        { text: "Right", isCorrect: true, position: 1 },
      ],
    },
  });
  const q2 = await mkQ(1, {
    type: "TRUE_FALSE",
    dueAt: at(-2),
    options: {
      create: [
        { text: "True", isCorrect: true, position: 0 },
        { text: "False", isCorrect: false, position: 1 },
      ],
    },
  });
  const q3 = await mkQ(2, { type: "OPEN", dueAt: at(-2), allowLate: false });
  const q4 = await mkQ(3, {
    type: "OPEN",
    dueAt: at(-3),
    lateCutoffAt: at(-1),
  });
  const q5 = await mkQ(4, { type: "OPEN", dueAt: at(-2) });
  const rightOf = (q: typeof q1) => q.options.find((o) => o.isCorrect)!.id;
  const wrongOf = (q: typeof q1) => q.options.find((o) => !o.isCorrect)!.id;

  // ---- Enrollment -------------------------------------------------------------------------
  section("Enrollment");
  const mkCourse = (over: object) =>
    prisma.course.create({
      data: {
        slug: `smoke-test-enroll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        titleAr: "دورة",
        ...over,
      } as never,
    });
  const cDraft = await mkCourse({ status: "DRAFT" });
  const cClosed = await mkCourse({
    status: "PUBLISHED",
    enrollmentOpen: false,
  });
  const cOpen = await mkCourse({ status: "PUBLISHED" });

  await expectError(
    "a draft course looks like it does not exist",
    () => enrollInCourse(prisma, { userId: A, courseId: cDraft.id }),
    "NOT_FOUND",
  );
  await expectError(
    "enrollment closed -> ENROLLMENT_CLOSED",
    () => enrollInCourse(prisma, { userId: A, courseId: cClosed.id }),
    "ENROLLMENT_CLOSED",
  );

  const en1 = await enrollInCourse(prisma, { userId: A, courseId: cOpen.id });
  check(
    "first enrollment: ENROLLED and ACTIVE",
    en1.outcome === "ENROLLED" && en1.enrollment.status === "ACTIVE",
  );
  const en2 = await enrollInCourse(prisma, { userId: A, courseId: cOpen.id });
  check(
    "enrolling twice is idempotent (same row)",
    en2.outcome === "ALREADY_ENROLLED" &&
      en2.enrollment.id === en1.enrollment.id,
  );
  const notifCount = await prisma.notification.count({
    where: { userId: A, type: "enrollment.confirmed" },
  });
  check(
    "exactly one confirmation notification so far",
    notifCount === 1,
    notifCount,
  );

  const wd1 = await withdrawFromCourse(prisma, {
    userId: A,
    courseId: cOpen.id,
  });
  check(
    "withdraw keeps the row and marks it WITHDRAWN",
    wd1.outcome === "WITHDRAWN" &&
      wd1.enrollment.id === en1.enrollment.id &&
      wd1.enrollment.withdrawnAt !== null,
  );
  const wd2 = await withdrawFromCourse(prisma, {
    userId: A,
    courseId: cOpen.id,
  });
  check("withdrawing twice is harmless", wd2.outcome === "ALREADY_WITHDRAWN");
  await expectError(
    "a student who never enrolled cannot withdraw",
    () => withdrawFromCourse(prisma, { userId: B, courseId: cOpen.id }),
    "NOT_ENROLLED",
  );

  const en3 = await enrollInCourse(prisma, { userId: A, courseId: cOpen.id });
  check(
    "re-enrolling reactivates the SAME row (history is kept)",
    en3.outcome === "REENROLLED" &&
      en3.enrollment.id === en1.enrollment.id &&
      en3.enrollment.status === "ACTIVE" &&
      en3.enrollment.withdrawnAt === null,
  );

  await prisma.course.update({
    where: { id: cOpen.id },
    data: { status: "ARCHIVED" },
  });
  const en4 = await enrollInCourse(prisma, { userId: A, courseId: cOpen.id });
  check(
    "an archived course keeps its active students",
    en4.outcome === "ALREADY_ENROLLED",
  );
  await withdrawFromCourse(prisma, { userId: A, courseId: cOpen.id });
  await expectError(
    "after withdrawing from an archived course, re-enrolling is refused",
    () => enrollInCourse(prisma, { userId: A, courseId: cOpen.id }),
    "ENROLLMENT_CLOSED",
  );

  // ---- Database constraints -------------------------------------------------
  section("Database constraints");
  await expectError(
    "duplicate lecture number is rejected (partial unique index)",
    () =>
      prisma.lecture.create({
        data: {
          courseId,
          number: 1,
          titleAr: "dup",
          startsAt: at(-1),
          endsAt: at(-0.9),
          status: "DRAFT",
        },
      }),
  );
  await expectError(
    "question with no lecture AND no exam is rejected (CHECK)",
    () =>
      prisma.question.create({
        data: { courseId, type: "OPEN", body: "orphan", points: 1 },
      }),
  );
  await expectError("duplicate enrollment is rejected (unique)", () =>
    prisma.enrollment.create({ data: { userId: A, courseId } }),
  );

  // ---- Requirements + initial sync -------------------------------------------
  section("Requirements and initial sync");
  const pub1 = await publishCertificateRequirement(prisma, {
    courseId,
    actorId: ins,
    thresholds: {
      minAttendancePercent: 80,
      minQuestionScorePercent: 70,
      minExamPercent: null,
    },
  });
  check("requirement v1 created", pub1.requirement.version === 1);
  check(
    "sync evaluated the 2 active students",
    pub1.sync.evaluated === 2,
    pub1.sync.evaluated,
  );
  const reviewA0 = await prisma.certificateReview.findUnique({
    where: { courseId_userId: { courseId, userId: A } },
  });
  check(
    "student A starts AUTO_INELIGIBLE (no attendance yet)",
    reviewA0?.status === "AUTO_INELIGIBLE",
    reviewA0?.status,
  );
  const reviewC = await prisma.certificateReview.findUnique({
    where: { courseId_userId: { courseId, userId: C } },
  });
  check("withdrawn student C gets no review row", reviewC === null);

  // ---- Attendance ------------------------------------------------------------
  section("Attendance math");
  await prisma.attendanceRecord.createMany({
    data: [
      ...lectures.map((l) => ({
        courseId,
        lectureId: l.id,
        userId: A,
        status: "PRESENT" as const,
        recordedById: ins,
      })),
      {
        courseId,
        lectureId: lectures[0].id,
        userId: B,
        status: "PRESENT" as const,
        recordedById: ins,
      },
      {
        courseId,
        lectureId: lectures[1].id,
        userId: B,
        status: "PRESENT" as const,
        recordedById: ins,
      },
      {
        courseId,
        lectureId: lectures[2].id,
        userId: B,
        status: "PARTIAL" as const,
        recordedById: ins,
      },
      {
        courseId,
        lectureId: lectures[3].id,
        userId: B,
        status: "EXCUSED" as const,
        recordedById: ins,
      },
      // lecture 5 for B: no record => absent
    ],
  });
  const eB = await getStudentEligibility(prisma, courseId, B);
  check(
    "B: 5 held, 1 excused -> 4 counted",
    eB.result.attendance.countedLectures === 4,
    eB.result.attendance.countedLectures,
  );
  check(
    "B: required = ceil(80% x 4) = 4",
    eB.result.attendance.requiredLectures === 4,
    eB.result.attendance.requiredLectures,
  );
  check(
    "B: attended = 2 present + 1 partial = 3 -> NOT_MET",
    eB.result.attendance.attended === 3 &&
      eB.result.attendance.state === "NOT_MET",
  );
  const eA0 = await getStudentEligibility(prisma, courseId, A);
  check(
    "A: 5/5 attendance -> MET",
    eA0.result.attendance.state === "MET" &&
      eA0.result.attendance.percent === 100,
  );

  // ---- Submissions -------------------------------------------------------------
  section("Submissions");
  const sA1 = await submitAnswer(prisma, {
    questionId: q1.id,
    userId: A,
    selectedOptionId: rightOf(q1),
  });
  check(
    "A Q1 (on time, objective): auto-graded 10 and released",
    n(sA1.finalScore) === 10 && !!sA1.releasedAt && !sA1.isLate,
  );
  const sB1 = await submitAnswer(prisma, {
    questionId: q1.id,
    userId: B,
    selectedOptionId: wrongOf(q1),
  });
  check("B Q1 wrong answer scores 0", n(sB1.finalScore) === 0);

  await expectError(
    "empty open answer is rejected",
    () =>
      submitAnswer(prisma, { questionId: q3.id, userId: A, answerText: "   " }),
    "INVALID_ANSWER",
  );
  await expectError(
    "withdrawn student cannot submit",
    () =>
      submitAnswer(prisma, {
        questionId: q1.id,
        userId: C,
        selectedOptionId: rightOf(q1),
      }),
    "NOT_ENROLLED",
  );
  await expectError(
    "option from another question is rejected",
    () =>
      submitAnswer(prisma, {
        questionId: q1.id,
        userId: B,
        selectedOptionId: rightOf(q2),
      }),
    "INVALID_ANSWER",
  );

  const sA2 = await submitAnswer(prisma, {
    questionId: q2.id,
    userId: A,
    selectedOptionId: rightOf(q2),
  });
  check(
    "A Q2 (late objective): isLate, raw 10, final 8 (20% default penalty)",
    sA2.isLate && n(sA2.rawScore) === 10 && n(sA2.finalScore) === 8,
    `${sA2.isLate} ${n(sA2.rawScore)} ${n(sA2.finalScore)}`,
  );
  await expectError(
    "graded objective answer cannot be edited",
    () =>
      submitAnswer(prisma, {
        questionId: q1.id,
        userId: A,
        selectedOptionId: wrongOf(q1),
      }),
    "ALREADY_GRADED",
  );

  await expectError(
    "Q3 late not allowed -> DEADLINE_PASSED",
    () =>
      submitAnswer(prisma, {
        questionId: q3.id,
        userId: A,
        answerText: "my answer",
      }),
    "DEADLINE_PASSED",
  );
  await grantDeadlineExtension(prisma, {
    questionId: q3.id,
    userId: A,
    newDueAt: at(2),
    reason: "Illness",
    actorId: ins,
  });
  const sA3 = await submitAnswer(prisma, {
    questionId: q3.id,
    userId: A,
    answerText: "my answer",
  });
  check("A Q3 after extension: accepted and on time", !sA3.isLate);
  await expectError(
    "Q4 after the late cutoff -> SUBMISSIONS_CLOSED",
    () =>
      submitAnswer(prisma, {
        questionId: q4.id,
        userId: A,
        answerText: "too late",
      }),
    "SUBMISSIONS_CLOSED",
  );
  const sA5 = await submitAnswer(prisma, {
    questionId: q5.id,
    userId: A,
    answerText: "late but accepted",
  });
  check(
    "A Q5 (late open): isLate and ungraded",
    sA5.isLate && sA5.gradedAt === null,
  );

  const eA1 = await getStudentEligibility(prisma, courseId, A);
  check(
    "A is PENDING while open answers await grading",
    eA1.result.status === "PENDING",
    `${eA1.result.status} ${JSON.stringify(eA1.result.questions)}`,
  );

  // ---- Grading ---------------------------------------------------------------------
  section("Grading, penalties, excuses");
  await expectError(
    "score above the question's points is rejected",
    () =>
      gradeSubmission(prisma, {
        submissionId: sA5.id,
        actorId: ins,
        rawScore: 11,
      }),
    "SCORE_OUT_OF_RANGE",
  );
  const g3 = await gradeSubmission(prisma, {
    submissionId: sA3.id,
    actorId: ins,
    rawScore: 10,
    feedback: "Great",
  });
  check(
    "Q3 graded 10, released, no penalty (on time)",
    n(g3.finalScore) === 10 && !!g3.releasedAt,
  );
  const g5 = await gradeSubmission(prisma, {
    submissionId: sA5.id,
    actorId: ins,
    rawScore: 10,
    penaltyType: "POINTS",
    penaltyValue: 3,
  });
  check(
    "Q5 late: raw 10, 3-point penalty -> final 7",
    n(g5.rawScore) === 10 && n(g5.finalScore) === 7,
    n(g5.finalScore),
  );

  const eA2 = await getStudentEligibility(prisma, courseId, A);
  check(
    "A question score = 35/50 = 70% (exactly at threshold) -> MET",
    eA2.result.questions.percent === 70 && eA2.result.questions.state === "MET",
    JSON.stringify(eA2.result.questions),
  );
  check(
    "A overall ELIGIBLE",
    eA2.result.status === "ELIGIBLE",
    eA2.result.status,
  );

  await expectError(
    "excuse without a reason is rejected",
    () =>
      setExcuse(prisma, { submissionId: sA5.id, actorId: ins, granted: true }),
    "EXCUSE_REASON_REQUIRED",
  );
  const ex = await setExcuse(prisma, {
    submissionId: sA5.id,
    actorId: ins,
    granted: true,
    reason: "Documented illness",
  });
  check(
    "excuse waives the penalty: final back to 10",
    n(ex.finalScore) === 10 && ex.excuseGranted,
  );
  const exOff = await setExcuse(prisma, {
    submissionId: sA5.id,
    actorId: ins,
    granted: false,
  });
  check(
    "revoking the excuse re-applies the penalty: final 7",
    n(exOff.finalScore) === 7 && !exOff.excuseGranted,
  );

  // Batch release: grade now, publish later
  const sB5 = await submitAnswer(prisma, {
    questionId: q5.id,
    userId: B,
    answerText: "B answer",
  });
  const gB5 = await gradeSubmission(prisma, {
    submissionId: sB5.id,
    actorId: ins,
    rawScore: 5,
    penaltyType: "PERCENT",
    penaltyValue: 50,
    release: false,
  });
  check(
    "B Q5: graded with 50% penalty -> 2.5, NOT released",
    n(gB5.finalScore) === 2.5 && gB5.releasedAt === null,
    `${n(gB5.finalScore)} ${gB5.releasedAt}`,
  );
  const rel = await releaseGrades(prisma, { questionId: q5.id, actorId: ins });
  check(
    "releaseGrades published exactly 1 held grade",
    rel.released === 1,
    rel.released,
  );

  // Reopen
  section("Reopen");
  const reopened = await reopenSubmission(prisma, {
    questionId: q3.id,
    userId: A,
    newDueAt: at(4),
    reason: "Redo",
    actorId: ins,
  });
  check(
    "reopen stored the new deadline",
    reopened.newDueAt.getTime() > Date.now(),
  );
  const sA3b = await prisma.questionSubmission.findUniqueOrThrow({
    where: { id: sA3.id },
  });
  check(
    "reopen cleared the grade but kept the answer",
    sA3b.rawScore === null &&
      sA3b.gradedAt === null &&
      sA3b.answerText === "my answer",
  );
  const eA3 = await getStudentEligibility(prisma, courseId, A);
  check(
    "A is PENDING again after reopen",
    eA3.result.status === "PENDING",
    eA3.result.status,
  );
  const sA3c = await submitAnswer(prisma, {
    questionId: q3.id,
    userId: A,
    answerText: "improved answer",
  });
  check(
    "student can edit a reopened, ungraded submission",
    sA3c.answerText === "improved answer",
  );
  await gradeSubmission(prisma, {
    submissionId: sA3.id,
    actorId: ins,
    rawScore: 10,
  });

  await expectError("DB CHECK blocks finalScore > rawScore", () =>
    prisma.questionSubmission.update({
      where: { id: sA3.id },
      data: { rawScore: 1, finalScore: 99 },
    }),
  );

  // ---- Certificate workflow ----------------------------------------------------------
  section("Certificate review and export");
  await prisma.attendanceRecord.create({
    data: {
      courseId,
      lectureId: lectures[4].id,
      userId: B,
      status: "PRESENT",
      recordedById: ins,
    },
  });
  await syncCertificateReviews(prisma, courseId);
  const rA = await prisma.certificateReview.findUniqueOrThrow({
    where: { courseId_userId: { courseId, userId: A } },
  });
  const rB = await prisma.certificateReview.findUniqueOrThrow({
    where: { courseId_userId: { courseId, userId: B } },
  });
  check("A review is AUTO_ELIGIBLE", rA.status === "AUTO_ELIGIBLE", rA.status);
  check(
    "B review is AUTO_INELIGIBLE (low question score)",
    rB.status === "AUTO_INELIGIBLE",
    rB.status,
  );

  await expectError(
    "approving an ineligible student needs a reason",
    () =>
      decideCertificate(prisma, {
        courseId,
        userId: B,
        decision: "APPROVED",
        actorId: ins,
      }),
    "OVERRIDE_REASON_REQUIRED",
  );
  const dB = await decideCertificate(prisma, {
    courseId,
    userId: B,
    decision: "APPROVED",
    reason: "Instructor discretion",
    actorId: ins,
  });
  check(
    "B approved with an override reason",
    dB.status === "APPROVED" && dB.overrideReason === "Instructor discretion",
  );
  const dA = await decideCertificate(prisma, {
    courseId,
    userId: A,
    decision: "APPROVED",
    actorId: ins,
  });
  check(
    "A approved with no override",
    dA.status === "APPROVED" && dA.overrideReason === null && !dA.needsReReview,
  );

  await publishCertificateRequirement(prisma, {
    courseId,
    actorId: ins,
    thresholds: {
      minAttendancePercent: 80,
      minQuestionScorePercent: 75,
      minExamPercent: null,
    },
  });
  const rA2 = await prisma.certificateReview.findUniqueOrThrow({
    where: { courseId_userId: { courseId, userId: A } },
  });
  const rB2 = await prisma.certificateReview.findUniqueOrThrow({
    where: { courseId_userId: { courseId, userId: B } },
  });
  check(
    "requirement v2 flags A for re-review",
    rA2.needsReReview && rA2.status === "APPROVED",
  );
  check("requirement v2 flags B for re-review", rB2.needsReReview);
  await expectError(
    "export refuses flagged approvals",
    () => exportCertificates(prisma, { courseId, actorId: ins }),
    "NOTHING_TO_EXPORT",
  );

  await publishCertificateRequirement(prisma, {
    courseId,
    actorId: ins,
    thresholds: {
      minAttendancePercent: 80,
      minQuestionScorePercent: 70,
      minExamPercent: null,
    },
  });
  const rA3 = await prisma.certificateReview.findUniqueOrThrow({
    where: { courseId_userId: { courseId, userId: A } },
  });
  check(
    "the re-review flag is sticky until the instructor decides again",
    rA3.needsReReview,
  );
  const dA2 = await decideCertificate(prisma, {
    courseId,
    userId: A,
    decision: "APPROVED",
    actorId: ins,
  });
  check(
    "A re-approved at version 3, flag cleared",
    !dA2.needsReReview && dA2.requirementVersion === 3,
    `${dA2.needsReReview} v${dA2.requirementVersion}`,
  );

  await prisma.user.update({
    where: { id: A },
    data: { dataSharingConsentAt: null },
  });
  await expectError(
    "export skips students without data-sharing consent",
    () => exportCertificates(prisma, { courseId, actorId: ins }),
    "NOTHING_TO_EXPORT",
  );
  await prisma.user.update({
    where: { id: A },
    data: { dataSharingConsentAt: new Date() },
  });

  const exp = await exportCertificates(prisma, { courseId, actorId: ins });
  check(
    "export contains exactly 1 student (A)",
    exp.export.items.length === 1 && exp.export.items[0].userId === A,
    exp.export.items.length,
  );
  const item = exp.export.items[0];
  check(
    "export snapshot has A's numbers (5 lectures, 100% attendance, 70% questions)",
    item.totalLectures === 5 &&
      n(item.attendancePercent) === 100 &&
      n(item.questionScorePercent) === 70,
    `${item.totalLectures} ${n(item.attendancePercent)} ${n(item.questionScorePercent)}`,
  );
  check(
    "export snapshot stores requirement version 3",
    exp.export.requirementVersion === 3,
  );

  // ---- Exams ------------------------------------------------------------------------------
  section("Exams");
  await prisma.course.update({
    where: { id: courseId },
    data: { examEnabled: true },
  });
  const exam = await prisma.exam.create({
    data: {
      courseId,
      titleAr: "امتحان نهائي",
      opensAt: at(-1),
      dueAt: at(1),
      attemptLimit: 1,
      status: "PUBLISHED",
    },
  });
  const mkExamQ = (
    type: "MULTIPLE_CHOICE" | "OPEN",
    points: number,
    options?: object,
  ) =>
    prisma.question.create({
      data: {
        courseId,
        examId: exam.id,
        type,
        body: `Exam ${type}`,
        points,
        status: "PUBLISHED",
        ...(options ? { options: { create: options as never } } : {}),
      },
      include: { options: true },
    });
  const e1 = await mkExamQ("MULTIPLE_CHOICE", 5, [
    { text: "No", isCorrect: false, position: 0 },
    { text: "Yes", isCorrect: true, position: 1 },
  ]);
  const e2 = await mkExamQ("MULTIPLE_CHOICE", 5, [
    { text: "No", isCorrect: false, position: 0 },
    { text: "Yes", isCorrect: true, position: 1 },
  ]);
  const e3 = await mkExamQ("OPEN", 10);
  const eRight = (q: typeof e1) => q.options.find((o) => o.isCorrect)!.id;
  const eWrong = (q: typeof e1) => q.options.find((o) => !o.isCorrect)!.id;

  await publishCertificateRequirement(prisma, {
    courseId,
    actorId: ins,
    thresholds: {
      minAttendancePercent: 80,
      minQuestionScorePercent: 70,
      minExamPercent: 60,
    },
  });
  const eA4 = await getStudentEligibility(prisma, courseId, A);
  check(
    "exam requirement enabled: A is NOT_MET before any attempt",
    eA4.result.exam.state === "NOT_MET",
    eA4.result.exam.state,
  );

  const st1 = await startAttempt(prisma, { examId: exam.id, userId: A });
  check(
    "A starts attempt #1",
    !st1.resumed &&
      st1.attempt.attemptNumber === 1 &&
      st1.attempt.status === "IN_PROGRESS",
  );
  const st1b = await startAttempt(prisma, { examId: exam.id, userId: A });
  check(
    "starting again resumes the same attempt",
    st1b.resumed && st1b.attempt.id === st1.attempt.id,
  );
  await expectError(
    "withdrawn student cannot start the exam",
    () => startAttempt(prisma, { examId: exam.id, userId: C }),
    "NOT_ENROLLED",
  );
  await expectError(
    "answer for a question outside the exam is rejected",
    () =>
      saveAnswers(prisma, {
        attemptId: st1.attempt.id,
        userId: A,
        answers: [{ questionId: q1.id, selectedOptionId: rightOf(q1) }],
      }),
    "INVALID_ANSWER",
  );
  await expectError(
    "another student cannot save into A's attempt",
    () =>
      saveAnswers(prisma, {
        attemptId: st1.attempt.id,
        userId: B,
        answers: [],
      }),
    "NOT_FOUND",
  );

  await saveAnswers(prisma, {
    attemptId: st1.attempt.id,
    userId: A,
    answers: [
      { questionId: e1.id, selectedOptionId: eRight(e1) },
      { questionId: e2.id, selectedOptionId: eWrong(e2) },
      { questionId: e3.id, answerText: "My essay" },
    ],
  });
  const sub1 = await submitAttempt(prisma, {
    attemptId: st1.attempt.id,
    userId: A,
  });
  check(
    "submit with an open answer: SUBMITTED, no total yet",
    sub1.status === "SUBMITTED" &&
      sub1.totalScore === null &&
      sub1.releasedAt === null,
    `${sub1.status} ${n(sub1.totalScore)}`,
  );
  const ansRows = await prisma.examAnswer.findMany({
    where: { attemptId: st1.attempt.id },
  });
  const mcScore = ansRows
    .filter((r) => r.questionId !== e3.id)
    .reduce((t, r) => t + (n(r.score) ?? 0), 0);
  check(
    "objective answers were auto-graded (5 + 0)",
    ansRows.length === 3 && mcScore === 5,
    mcScore,
  );
  await expectError(
    "a submitted attempt cannot be edited",
    () =>
      saveAnswers(prisma, {
        attemptId: st1.attempt.id,
        userId: A,
        answers: [],
      }),
    "ATTEMPT_NOT_IN_PROGRESS",
  );
  const eA5 = await getStudentEligibility(prisma, courseId, A);
  check(
    "exam check is PENDING while the essay awaits grading",
    eA5.result.exam.state === "PENDING",
    eA5.result.exam.state,
  );

  const essay = ansRows.find((r) => r.questionId === e3.id)!;
  await expectError(
    "essay score above its points is rejected",
    () =>
      gradeExamAnswer(prisma, { answerId: essay.id, actorId: ins, score: 11 }),
    "SCORE_OUT_OF_RANGE",
  );
  const gradedAttempt = await gradeExamAnswer(prisma, {
    answerId: essay.id,
    actorId: ins,
    score: 8,
    feedback: "Good",
  });
  check(
    "grading the last open answer completes the attempt: 13/20",
    gradedAttempt.status === "GRADED" && n(gradedAttempt.totalScore) === 13,
    `${gradedAttempt.status} ${n(gradedAttempt.totalScore)}`,
  );
  check("completed attempt is released", gradedAttempt.releasedAt !== null);

  await expectError(
    "no attempts left after the limit of 1",
    () => startAttempt(prisma, { examId: exam.id, userId: A }),
    "NO_ATTEMPTS_LEFT",
  );
  await expectError(
    "reopen with nothing to grant is rejected",
    () =>
      grantExamAttempt(prisma, {
        examId: exam.id,
        userId: A,
        actorId: ins,
        extraAttempts: 0,
      }),
    "INVALID_ATTEMPT_GRANT",
  );
  await grantExamAttempt(prisma, {
    examId: exam.id,
    userId: A,
    actorId: ins,
    extraAttempts: 1,
    reason: "Retake",
  });
  const st2 = await startAttempt(prisma, { examId: exam.id, userId: A });
  check(
    "after a reopen grant A can start attempt #2",
    st2.attempt.attemptNumber === 2 && !st2.resumed,
  );
  await saveAnswers(prisma, {
    attemptId: st2.attempt.id,
    userId: A,
    answers: [{ questionId: e1.id, selectedOptionId: eWrong(e1) }],
  });
  const sub2 = await submitAttempt(prisma, {
    attemptId: st2.attempt.id,
    userId: A,
  });
  check(
    "attempt #2 (all wrong / blank) is GRADED with total 0 straight away",
    sub2.status === "GRADED" && n(sub2.totalScore) === 0,
    `${sub2.status} ${n(sub2.totalScore)}`,
  );

  const eA6 = await getStudentEligibility(prisma, courseId, A);
  check(
    "eligibility uses the BEST attempt: 65% -> MET",
    eA6.result.exam.percent === 65 && eA6.result.exam.state === "MET",
    `${eA6.result.exam.percent} ${eA6.result.exam.state}`,
  );

  // Expiry: B starts, saves one answer, then the deadline passes
  const stB = await startAttempt(prisma, { examId: exam.id, userId: B });
  await saveAnswers(prisma, {
    attemptId: stB.attempt.id,
    userId: B,
    answers: [{ questionId: e1.id, selectedOptionId: eRight(e1) }],
  });
  await prisma.exam.update({
    where: { id: exam.id },
    data: { dueAt: new Date(Date.now() - 3_600_000) },
  });
  await expectError(
    "saving after the deadline is rejected",
    () =>
      saveAnswers(prisma, {
        attemptId: stB.attempt.id,
        userId: B,
        answers: [{ questionId: e2.id, selectedOptionId: eRight(e2) }],
      }),
    "EXAM_CLOSED",
  );
  const fin = await finalizeExpiredAttempts(prisma, { examId: exam.id });
  check(
    "finalizeExpiredAttempts closed exactly 1 attempt",
    fin.finalized === 1,
    fin.finalized,
  );
  const attB = await prisma.examAttempt.findUniqueOrThrow({
    where: { id: stB.attempt.id },
  });
  check(
    "expired attempt graded from saved answers (5/20)",
    attB.status === "GRADED" && n(attB.totalScore) === 5,
    `${attB.status} ${n(attB.totalScore)}`,
  );
  await expectError(
    "starting after the deadline -> EXAM_CLOSED",
    () => startAttempt(prisma, { examId: exam.id, userId: B }),
    "EXAM_CLOSED",
  );

  // ---- Student read layer ----------------------------------------------------------------
  section("Student read layer");
  const leaks = (v: unknown) =>
    /isCorrect|correctOptionIds|"explanation"/.test(JSON.stringify(v));

  const live = await prisma.lecture.create({
    data: {
      courseId,
      number: 6,
      titleAr: "محاضرة قادمة",
      startsAt: at(1),
      endsAt: new Date(Date.now() + DAY + 3_600_000),
      status: "PUBLISHED",
      zoomUrl: "https://zoom.example/j/123",
      zoomPassword: "ZOOM-SECRET",
    },
  });

  // Catalog and overview
  const cat = await listPublishedCourses(prisma, {
    q: "دورة",
    page: 1,
    pageSize: 50,
  });
  check(
    "catalog lists published courses",
    cat.items.some((i) => i.id === courseId) &&
      cat.items.some((i) => i.id === cClosed.id),
  );
  check(
    "catalog hides draft and archived courses",
    !cat.items.some((i) => i.id === cDraft.id || i.id === cOpen.id),
  );
  const ovAnon = await getCourseOverviewBySlug(prisma, {
    slug: course.slug,
    viewerId: null,
  });
  check(
    "overview works signed out",
    ovAnon.viewer.signedIn === false && ovAnon.viewer.enrolled === false,
  );
  check(
    "overview never carries zoom details",
    !/zoom/i.test(JSON.stringify(ovAnon)),
    "zoom leaked",
  );
  const ovA = await getCourseOverviewBySlug(prisma, {
    slug: course.slug,
    viewerId: A,
  });
  check("overview knows the viewer is enrolled", ovA.viewer.enrolled === true);
  await expectError(
    "a draft course page is hidden",
    () =>
      getCourseOverviewBySlug(prisma, { slug: cDraft.slug, viewerId: null }),
    "NOT_FOUND",
  );
  await expectError(
    "an archived course page is hidden from non-members",
    () => getCourseOverviewBySlug(prisma, { slug: cOpen.slug, viewerId: B }),
    "NOT_FOUND",
  );

  // Lectures, zoom
  await expectError(
    "a withdrawn student cannot list lectures",
    () => getLecturesForStudent(prisma, { userId: C, courseId }),
    "NOT_ENROLLED",
  );
  const list = await getLecturesForStudent(prisma, { userId: A, courseId });
  const l1 = list.lectures.find((l) => l.number === 1)!;
  const l6 = list.lectures.find((l) => l.number === 6)!;
  check(
    "an upcoming lecture shows zoom to an enrolled student",
    l6.zoom?.url === "https://zoom.example/j/123" && l6.state === "UPCOMING",
  );
  check(
    "an ended lecture no longer shows zoom",
    l1.zoom === null && l1.state === "ENDED",
  );
  check(
    "A's own attendance is shown",
    l1.attendance === "PRESENT",
    l1.attendance,
  );
  check(
    "A's question progress shows the released score",
    l1.questions[0]?.status === "GRADED" && l1.questions[0]?.score === 10,
    JSON.stringify(l1.questions),
  );
  const dAnon = await getLectureDetail(prisma, {
    lectureId: live.id,
    viewerId: null,
  });
  check(
    "zoom details are hidden from visitors",
    dAnon.zoom === null &&
      !/zoom\.example|ZOOM-SECRET/.test(JSON.stringify(dAnon)),
    "zoom leaked",
  );
  const dLiveA = await getLectureDetail(prisma, {
    lectureId: live.id,
    viewerId: A,
  });
  check(
    "zoom details are shown to the enrolled student",
    dLiveA.zoom?.password === "ZOOM-SECRET",
  );
  const dash = await getCourseDashboard(prisma, { userId: A, courseId });
  check(
    "dashboard shows the next lecture with zoom",
    dash.nextLecture?.zoom?.url === "https://zoom.example/j/123",
  );
  await expectError(
    "dashboard needs an active enrollment",
    () => getCourseDashboard(prisma, { userId: C, courseId }),
    "NOT_ENROLLED",
  );

  // Recordings and materials follow their visibility
  await prisma.recording.createMany({
    data: [
      {
        lectureId: lectures[0].id,
        provider: "YOUTUBE",
        url: "https://youtu.be/pub",
        visibility: "PUBLIC",
        status: "PUBLISHED",
        position: 0,
      },
      {
        lectureId: lectures[0].id,
        provider: "GOOGLE_DRIVE",
        url: "https://drive.example/enrolled",
        visibility: "ENROLLED",
        status: "PUBLISHED",
        position: 1,
      },
      {
        lectureId: lectures[0].id,
        provider: "YOUTUBE",
        url: "https://youtu.be/draft",
        visibility: "PUBLIC",
        status: "DRAFT",
        position: 2,
      },
    ],
  });
  await prisma.material.createMany({
    data: [
      {
        courseId,
        lectureId: lectures[0].id,
        titleAr: "ملف عام",
        type: "PDF",
        externalUrl: "https://files.example/public.pdf",
        visibility: "PUBLIC",
        status: "PUBLISHED",
      },
      {
        courseId,
        lectureId: lectures[0].id,
        titleAr: "ملف للمسجلين",
        type: "PDF",
        externalUrl: "https://files.example/enrolled.pdf",
        visibility: "ENROLLED",
        status: "PUBLISHED",
      },
      {
        courseId,
        lectureId: lectures[0].id,
        titleAr: "مسودة",
        type: "PDF",
        externalUrl: "https://files.example/draft.pdf",
        visibility: "PUBLIC",
        status: "DRAFT",
      },
    ],
  });
  const rAnon = await getLectureDetail(prisma, {
    lectureId: lectures[0].id,
    viewerId: null,
  });
  const rC = await getLectureDetail(prisma, {
    lectureId: lectures[0].id,
    viewerId: C,
  });
  const rLecA = await getLectureDetail(prisma, {
    lectureId: lectures[0].id,
    viewerId: A,
  });
  check(
    "recordings: a visitor sees only PUBLIC ones",
    rAnon.recordings.length === 1,
    rAnon.recordings.length,
  );
  check(
    "recordings: a signed-in non-member sees only PUBLIC ones",
    rC.recordings.length === 1,
    rC.recordings.length,
  );
  check(
    "recordings: an enrolled student sees PUBLIC and ENROLLED, never drafts",
    rLecA.recordings.length === 2,
    rLecA.recordings.length,
  );
  check(
    "materials follow the same rules",
    rAnon.materials.length === 1 && rLecA.materials.length === 2,
    `${rAnon.materials.length}/${rLecA.materials.length}`,
  );

  // The answer key never leaks before the reveal rules allow it
  const vq1 = await getQuestionForStudent(prisma, {
    userId: A,
    questionId: q1.id,
  });
  check(
    "Q1: A sees their released grade",
    vq1.submission?.released === true && vq1.submission?.score?.final === 10,
  );
  check("Q1: no answer key before the deadline", !leaks(vq1), "key leaked");
  const vq2A = await getQuestionForStudent(prisma, {
    userId: A,
    questionId: q2.id,
  });
  check(
    "Q2: key revealed after release AND deadline",
    vq2A.question.correctOptionIds?.includes(rightOf(q2)) === true,
  );
  const vq2B = await getQuestionForStudent(prisma, {
    userId: B,
    questionId: q2.id,
  });
  check(
    "Q2: a student with no released grade gets no key",
    !leaks(vq2B),
    "key leaked",
  );
  await prisma.question.update({
    where: { id: q3.id },
    data: { explanation: "MODEL-ANSWER-Q3" },
  });
  await prisma.question.update({
    where: { id: q5.id },
    data: { explanation: "MODEL-ANSWER-Q5" },
  });
  const vq3A = await getQuestionForStudent(prisma, {
    userId: A,
    questionId: q3.id,
  });
  check(
    "Q3: explanation hidden while A's extended deadline is still open",
    !JSON.stringify(vq3A).includes("MODEL-ANSWER-Q3"),
    "explanation leaked",
  );
  check(
    "Q3: a graded submission is locked",
    vq3A.state.reason === "ALREADY_GRADED",
    vq3A.state.reason,
  );
  const vq5A = await getQuestionForStudent(prisma, {
    userId: A,
    questionId: q5.id,
  });
  check(
    "Q5: explanation shown after release and deadline",
    JSON.stringify(vq5A).includes("MODEL-ANSWER-Q5"),
  );
  await expectError(
    "a withdrawn student cannot open a question",
    () => getQuestionForStudent(prisma, { userId: C, questionId: q1.id }),
    "NOT_ENROLLED",
  );

  // Exams
  const exv = await getExamForStudent(prisma, { userId: A, examId: exam.id });
  check(
    "exam page: closed, two attempts, cannot start",
    exv.state === "CLOSED" &&
      exv.attempts.length === 2 &&
      exv.canStart === false,
    `${exv.state} ${exv.attempts.length}`,
  );
  check(
    "exam page never carries questions",
    !/Exam (MULTIPLE_CHOICE|OPEN)/.test(JSON.stringify(exv)),
    "questions leaked",
  );
  const att1 = await prisma.examAttempt.findFirstOrThrow({
    where: { examId: exam.id, userId: A, attemptNumber: 1 },
  });
  const res1 = await getAttemptForStudent(prisma, {
    userId: A,
    attemptId: att1.id,
  });
  check(
    "released attempt shows results: 13/20, passed",
    res1.mode === "RESULTS" &&
      res1.attempt.totalScore === 13 &&
      res1.passed === true,
    res1.mode,
  );
  check(
    "exam key revealed: no further attempt is possible",
    res1.mode === "RESULTS" &&
      res1.revealed === true &&
      JSON.stringify(res1).includes("correctOptionIds"),
  );
  await expectError(
    "another student cannot open A's attempt",
    () => getAttemptForStudent(prisma, { userId: B, attemptId: att1.id }),
    "NOT_FOUND",
  );

  // ---- Staff management ------------------------------------------------------------------
  section("Staff management");
  const aUser = await prisma.user.findUniqueOrThrow({ where: { id: A } });
  const sfSlug = `smoke-test-staff-${Date.now()}`;

  // Courses
  const sfCourse = await createCourse(prisma, {
    actorId: ins,
    input: {
      slug: sfSlug,
      titleAr: "دورة الموظفين",
      certificateEnabled: true,
      attendanceEnabled: true,
      questionsEnabled: false,
      examEnabled: false,
    },
  });
  check("a course is created as DRAFT", sfCourse.status === "DRAFT");
  const sfSettings = await prisma.courseSettings.findUnique({
    where: { courseId: sfCourse.id },
  });
  check("default settings are created with the course", sfSettings !== null);
  const sfInstr = await prisma.courseInstructor.findMany({
    where: { courseId: sfCourse.id },
  });
  check(
    "the creator is the first instructor",
    sfInstr.length === 1 && sfInstr[0].userId === ins,
  );
  await expectError(
    "a duplicate slug -> SLUG_TAKEN",
    () =>
      createCourse(prisma, {
        actorId: ins,
        input: { slug: sfSlug, titleAr: "نسخة" },
      }),
    "SLUG_TAKEN",
  );
  await expectError(
    "an invalid slug -> INVALID_SLUG",
    () =>
      createCourse(prisma, {
        actorId: ins,
        input: { slug: "Bad Slug!", titleAr: "نسخة" },
      }),
    "INVALID_SLUG",
  );
  await expectError(
    "publish is blocked while the description is missing",
    () =>
      transitionCourse(prisma, {
        courseId: sfCourse.id,
        action: "publish",
        actorId: ins,
      }),
    "COURSE_NOT_READY",
  );
  await updateCourse(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: { shortDescAr: "وصف قصير", descriptionAr: "وصف كامل للدورة" },
  });
  await expectError(
    "publish is blocked while certificate thresholds are missing",
    () =>
      transitionCourse(prisma, {
        courseId: sfCourse.id,
        action: "publish",
        actorId: ins,
      }),
    "COURSE_NOT_READY",
  );
  await publishCertificateRequirement(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    thresholds: {
      minAttendancePercent: 60,
      minQuestionScorePercent: null,
      minExamPercent: null,
    },
  });
  const sfPub = await transitionCourse(prisma, {
    courseId: sfCourse.id,
    action: "publish",
    actorId: ins,
  });
  check(
    "publish works once ready and stamps publishedAt",
    sfPub.status === "PUBLISHED" && sfPub.publishedAt !== null,
  );
  await expectError(
    "the slug is locked after publishing",
    () =>
      updateCourse(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: { slug: `${sfSlug}-renamed` },
      }),
    "SLUG_LOCKED",
  );
  await expectError(
    "a published course must keep an instructor",
    () =>
      setCourseInstructors(prisma, {
        courseId: sfCourse.id,
        userIds: [],
        actorId: ins,
      }),
    "COURSE_NOT_READY",
  );

  await replaceCourseContent(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: {
      objectives: [
        { textAr: "الهدف الأول" },
        { textAr: "الهدف الثاني", textEn: "Second" },
      ],
      faqs: [{ questionAr: "سؤال؟", answerAr: "جواب" }],
    },
  });
  const sfOv = await getCourseOverviewBySlug(prisma, {
    slug: sfSlug,
    viewerId: null,
  });
  check(
    "objectives and FAQs show on the public page, in order",
    sfOv.objectives.length === 2 &&
      sfOv.objectives[0].textAr === "الهدف الأول" &&
      sfOv.faqs.length === 1,
  );

  await expectError(
    "partialWeight above 1 is rejected",
    () =>
      updateCourseSettings(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: { partialWeight: 1.5 },
      }),
    "INVALID_SETTINGS",
  );
  await expectError(
    "a percentage penalty above 100 is rejected",
    () =>
      updateCourseSettings(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: { defaultPenaltyType: "PERCENT", defaultPenaltyValue: 120 },
      }),
    "INVALID_PENALTY",
  );
  await updateCourseSettings(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: {
      partialWeight: 0.5,
      defaultPenaltyType: "PERCENT",
      defaultPenaltyValue: 10,
    },
  });
  const sfSet2 = await prisma.courseSettings.findUniqueOrThrow({
    where: { courseId: sfCourse.id },
  });
  check(
    "valid settings are saved",
    Number(sfSet2.partialWeight) === 0.5 &&
      sfSet2.defaultPenaltyType === "PERCENT",
  );

  // Students
  await expectError(
    "enrolling an unknown email is refused",
    () =>
      staffEnrollStudent(prisma, {
        courseId: sfCourse.id,
        email: "nobody@example.test",
        actorId: ins,
      }),
    "NOT_FOUND",
  );
  const sfEn1 = await staffEnrollStudent(prisma, {
    courseId: sfCourse.id,
    email: aUser.email.toUpperCase(),
    actorId: ins,
  });
  check(
    "staff enroll by email, case-insensitively",
    sfEn1.outcome === "ENROLLED",
  );
  const sfEn2 = await staffEnrollStudent(prisma, {
    courseId: sfCourse.id,
    email: aUser.email,
    actorId: ins,
  });
  check(
    "enrolling the same student again is harmless",
    sfEn2.outcome === "ALREADY_ENROLLED",
  );
  const bUser = await prisma.user.findUniqueOrThrow({ where: { id: B } });
  await staffEnrollStudent(prisma, {
    courseId: sfCourse.id,
    email: bUser.email,
    actorId: ins,
  });
  const sfList = await listCourseStudents(prisma, {
    courseId: sfCourse.id,
    page: 1,
    pageSize: 50,
  });
  check(
    "the student list shows both, with consent flags",
    sfList.total === 2 &&
      sfList.items.find((i) => i.userId === A)?.dataSharingConsent === true,
  );
  const sfSearch = await listCourseStudents(prisma, {
    courseId: sfCourse.id,
    q: "studentA",
    page: 1,
    pageSize: 50,
  });
  check(
    "student search matches by name",
    sfSearch.total === 1 && sfSearch.items[0].userId === A,
  );

  // Lectures
  const sfLecture = (number: number | undefined, daysAgo: number) =>
    createLecture(prisma, {
      courseId: sfCourse.id,
      actorId: ins,
      input: {
        number,
        titleAr: `محاضرة ${number ?? "جديدة"}`,
        startsAt: at(-daysAgo),
        endsAt: new Date(at(-daysAgo).getTime() + 3_600_000),
        status: "PUBLISHED",
      },
    });
  const sfL1 = await sfLecture(undefined, 6);
  const sfL2 = await sfLecture(undefined, 5);
  const sfL3 = await sfLecture(undefined, 4);
  check(
    "lecture numbers are assigned automatically (1, 2, 3)",
    [sfL1.number, sfL2.number, sfL3.number].join() === "1,2,3",
  );
  await expectError(
    "a duplicate lecture number -> LECTURE_NUMBER_TAKEN",
    () => sfLecture(2, 3),
    "LECTURE_NUMBER_TAKEN",
  );
  await expectError(
    "a lecture that ends before it starts is rejected",
    () =>
      createLecture(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: { titleAr: "محاضرة", startsAt: at(-1), endsAt: at(-2) },
      }),
    "INVALID_DATE",
  );
  await deleteLecture(prisma, { lectureId: sfL3.id, actorId: ins });
  const sfL3b = await sfLecture(3, 4);
  check(
    "deleting a lecture frees its number",
    sfL3b.number === 3 && sfL3b.id !== sfL3.id,
  );

  // Attendance
  const sfRoster0 = await listRoster(prisma, {
    lectureId: sfL1.id,
    page: 1,
    pageSize: 50,
  });
  check(
    "the roster lists both students with nothing recorded",
    sfRoster0.total === 2 && sfRoster0.items.every((i) => i.status === null),
  );
  await expectError(
    "attendance for a non-member is rejected",
    () =>
      saveAttendance(prisma, {
        lectureId: sfL1.id,
        actorId: ins,
        entries: [{ userId: C, status: "PRESENT" }],
      }),
    "INVALID_ATTENDANCE",
  );
  await expectError(
    "duplicate attendance entries are rejected",
    () =>
      saveAttendance(prisma, {
        lectureId: sfL1.id,
        actorId: ins,
        entries: [
          { userId: A, status: "PRESENT" },
          { userId: A, status: "ABSENT" },
        ],
      }),
    "INVALID_ATTENDANCE",
  );
  await saveAttendance(prisma, {
    lectureId: sfL1.id,
    actorId: ins,
    entries: [
      { userId: A, status: "PRESENT" },
      { userId: B, status: "PRESENT" },
    ],
  });
  await saveAttendance(prisma, {
    lectureId: sfL2.id,
    actorId: ins,
    entries: [{ userId: A, status: "PRESENT" }],
  });
  await saveAttendance(prisma, {
    lectureId: sfL3b.id,
    actorId: ins,
    entries: [{ userId: A, status: "PRESENT" }],
  });
  const sfEA = await getStudentEligibility(prisma, sfCourse.id, A);
  const sfEB = await getStudentEligibility(prisma, sfCourse.id, B);
  check(
    "A: 3 of 3 lectures -> attendance MET",
    sfEA.result.attendance.heldLectures === 3 &&
      sfEA.result.attendance.state === "MET",
    JSON.stringify(sfEA.result.attendance),
  );
  check(
    "B: 1 of 3 lectures -> attendance NOT_MET",
    sfEB.result.attendance.attended === 1 &&
      sfEB.result.attendance.state === "NOT_MET",
  );
  const sfRevA = await prisma.certificateReview.findUnique({
    where: { courseId_userId: { courseId: sfCourse.id, userId: A } },
  });
  check(
    "saving attendance re-synced A's certificate review",
    sfRevA?.status === "AUTO_ELIGIBLE",
    sfRevA?.status,
  );
  await saveAttendance(prisma, {
    lectureId: sfL1.id,
    actorId: ins,
    entries: [{ userId: B, status: null }],
  });
  const sfRoster1 = await listRoster(prisma, {
    lectureId: sfL1.id,
    page: 1,
    pageSize: 50,
  });
  check(
    "clearing a record returns it to 'not recorded'",
    sfRoster1.items.find((i) => i.userId === B)?.status === null &&
      sfRoster1.items.find((i) => i.userId === A)?.status === "PRESENT",
  );

  // Status changes with students enrolled
  await expectError(
    "a course with students cannot be unpublished",
    () =>
      transitionCourse(prisma, {
        courseId: sfCourse.id,
        action: "unpublish",
        actorId: ins,
      }),
    "INVALID_STATUS_TRANSITION",
  );
  const sfArch = await transitionCourse(prisma, {
    courseId: sfCourse.id,
    action: "archive",
    actorId: ins,
  });
  check("archiving works", sfArch.status === "ARCHIVED");
  const sfUnarch = await transitionCourse(prisma, {
    courseId: sfCourse.id,
    action: "unarchive",
    actorId: ins,
  });
  check("unarchiving restores PUBLISHED", sfUnarch.status === "PUBLISHED");

  // Recordings and materials
  const sfYt = await createRecording(prisma, {
    lectureId: sfL1.id,
    actorId: ins,
    input: {
      provider: "YOUTUBE",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      status: "PUBLISHED",
    },
  });
  check(
    "a YouTube link gets a derived embed URL",
    sfYt.embedUrl === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" &&
      sfYt.status === "PUBLISHED",
    sfYt.embedUrl,
  );
  const sfYtRow = await prisma.recording.findUniqueOrThrow({
    where: { id: sfYt.id },
  });
  check("publishing stamps publishedAt", sfYtRow.publishedAt !== null);
  await expectError(
    "a look-alike YouTube host is refused",
    () =>
      createRecording(prisma, {
        lectureId: sfL1.id,
        actorId: ins,
        input: {
          provider: "YOUTUBE",
          url: "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
        },
      }),
    "INVALID_URL",
  );
  await expectError(
    "an http link is refused",
    () =>
      createRecording(prisma, {
        lectureId: sfL1.id,
        actorId: ins,
        input: { provider: "OTHER", url: "http://files.example/a.mp4" },
      }),
    "INVALID_URL",
  );
  const sfOther = await createRecording(prisma, {
    lectureId: sfL1.id,
    actorId: ins,
    input: { provider: "OTHER", url: "https://files.example/a.mp4" },
  });
  check("an unknown provider is never embedded", sfOther.embedUrl === null);
  const sfDrive = await createRecording(prisma, {
    lectureId: sfL1.id,
    actorId: ins,
    input: {
      provider: "GOOGLE_DRIVE",
      url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view",
    },
  });
  check(
    "a Drive link gets a preview URL",
    sfDrive.embedUrl?.endsWith("/preview") === true,
    sfDrive.embedUrl,
  );
  await expectError(
    "a material needs a file or a link",
    () =>
      createMaterial(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: { titleAr: "ملف", type: "PDF" },
      }),
    "INVALID_URL",
  );
  await expectError(
    "a path-traversal storage path is refused",
    () =>
      createMaterial(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: { titleAr: "ملف", type: "PDF", storagePath: "../secret.pdf" },
      }),
    "INVALID_URL",
  );
  const sfMat = await createMaterial(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: {
      titleAr: "ملف",
      type: "PDF",
      externalUrl: "https://files.example/notes.pdf",
      lectureId: sfL1.id,
      status: "PUBLISHED",
    },
  });
  check(
    "a material takes the course's default visibility",
    sfMat.visibility === "PUBLIC" && sfMat.status === "PUBLISHED",
  );

  // Withdraw and reactivate
  await staffSetEnrollment(prisma, {
    courseId: sfCourse.id,
    userId: B,
    status: "WITHDRAWN",
    actorId: ins,
  });
  const sfActive = await listCourseStudents(prisma, {
    courseId: sfCourse.id,
    status: "ACTIVE",
    page: 1,
    pageSize: 50,
  });
  check(
    "withdrawn students drop out of the active list",
    sfActive.total === 1 && sfActive.items[0].userId === A,
  );
  await staffSetEnrollment(prisma, {
    courseId: sfCourse.id,
    userId: B,
    status: "ACTIVE",
    actorId: ins,
  });
  const sfAll = await listCourseStudents(prisma, {
    courseId: sfCourse.id,
    page: 1,
    pageSize: 50,
  });
  check(
    "reactivating brings them back",
    sfAll.total === 2 && sfAll.items.every((i) => i.status === "ACTIVE"),
  );

  const sfActions = new Set(
    (
      await prisma.auditLog.findMany({
        where: { actorId: ins },
        select: { action: true },
      })
    ).map((a) => a.action),
  );
  for (const a of [
    "course.create",
    "course.update",
    "course.publish",
    "course.settings",
    "course.content",
    "lecture.create",
    "lecture.delete",
    "attendance.save",
    "recording.create",
    "material.create",
    "enrollment.staff_add",
    "enrollment.staff_withdraw",
  ]) {
    check(`audit log has '${a}'`, sfActions.has(a));
  }

  // ---- Authoring and grader views --------------------------------------------------------
  section("Question and exam authoring, grader views");
  await updateCourse(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: { questionsEnabled: true, examEnabled: true },
  });

  // Lecture questions
  const mcInput = {
    type: "MULTIPLE_CHOICE" as const,
    body: "اختر الإجابة الصحيحة",
    points: 10,
    status: "PUBLISHED" as const,
    explanation: "AUTHORING-EXPLANATION",
    options: [
      { text: "أ", isCorrect: false },
      { text: "ب", isCorrect: true },
      { text: "ج", isCorrect: false },
    ],
  };
  const auParent = { kind: "lecture" as const, lectureId: sfL1.id };
  const auMc = await createQuestion(prisma, {
    parent: auParent,
    actorId: ins,
    input: mcInput,
  });
  check(
    "a multiple-choice question is created",
    auMc.type === "MULTIPLE_CHOICE" && auMc.status === "PUBLISHED",
  );
  await expectError(
    "no correct option -> INVALID_QUESTION",
    () =>
      createQuestion(prisma, {
        parent: auParent,
        actorId: ins,
        input: {
          ...mcInput,
          options: [
            { text: "أ", isCorrect: false },
            { text: "ب", isCorrect: false },
          ],
        },
      }),
    "INVALID_QUESTION",
  );
  await expectError(
    "two correct options -> INVALID_QUESTION",
    () =>
      createQuestion(prisma, {
        parent: auParent,
        actorId: ins,
        input: {
          ...mcInput,
          options: [
            { text: "أ", isCorrect: true },
            { text: "ب", isCorrect: true },
          ],
        },
      }),
    "INVALID_QUESTION",
  );
  await expectError(
    "duplicate option texts -> INVALID_QUESTION",
    () =>
      createQuestion(prisma, {
        parent: auParent,
        actorId: ins,
        input: {
          ...mcInput,
          options: [
            { text: "نعم", isCorrect: true },
            { text: " نعم ", isCorrect: false },
          ],
        },
      }),
    "INVALID_QUESTION",
  );
  await expectError(
    "true/false without correctAnswer -> INVALID_QUESTION",
    () =>
      createQuestion(prisma, {
        parent: auParent,
        actorId: ins,
        input: { type: "TRUE_FALSE", body: "صح أم خطأ؟", points: 5 },
      }),
    "INVALID_QUESTION",
  );
  await expectError(
    "a late cutoff before the due date -> INVALID_QUESTION",
    () =>
      createQuestion(prisma, {
        parent: auParent,
        actorId: ins,
        input: {
          type: "OPEN",
          body: "اكتب",
          points: 5,
          dueAt: at(2),
          lateCutoffAt: at(1),
        },
      }),
    "INVALID_QUESTION",
  );
  await createQuestion(prisma, {
    parent: auParent,
    actorId: ins,
    input: {
      type: "TRUE_FALSE",
      body: "صح أم خطأ؟",
      points: 5,
      correctAnswer: true,
    },
  });
  const auOpen = await createQuestion(prisma, {
    parent: auParent,
    actorId: ins,
    input: {
      type: "OPEN",
      body: "اشرح بأسلوبك",
      points: 10,
      status: "PUBLISHED",
      dueAt: at(5),
    },
  });
  const auList = await listQuestionsForStaff(prisma, auParent);
  const auMcStaff = auList.items.find((i) => i.id === auMc.id)!;
  check(
    "the staff list shows all three questions in order, with the key",
    auList.items.map((i) => i.position).join() === "0,1,2" &&
      auMcStaff.options.some((o) => o.isCorrect),
  );
  const auView = await getQuestionForStudent(prisma, {
    userId: A,
    questionId: auMc.id,
  });
  check(
    "the student view of the same question carries no key",
    !leaks(auView) && auView.question.options.length === 3,
    "key leaked",
  );

  // Editing rules once students have answered
  const auSub = await submitAnswer(prisma, {
    questionId: auMc.id,
    userId: A,
    selectedOptionId: auMcStaff.options.find((o) => o.isCorrect)!.id,
  });
  check(
    "A answers it correctly and is graded straight away",
    Number(auSub.finalScore) === 10,
  );
  await expectError(
    "options are locked once students have answered",
    () =>
      updateQuestion(prisma, {
        questionId: auMc.id,
        actorId: ins,
        input: {
          options: [
            { text: "أ", isCorrect: true },
            { text: "ب", isCorrect: false },
          ],
        },
      }),
    "QUESTION_LOCKED",
  );
  await expectError(
    "points are locked once students have answered",
    () =>
      updateQuestion(prisma, {
        questionId: auMc.id,
        actorId: ins,
        input: { points: 5 },
      }),
    "QUESTION_LOCKED",
  );
  await updateQuestion(prisma, {
    questionId: auMc.id,
    actorId: ins,
    input: { body: "نص مصحّح", explanation: "شرح جديد" },
  });
  const auAfter = await getQuestionForStaff(prisma, auMc.id);
  check(
    "the wording can still be corrected",
    auAfter.body === "نص مصحّح" &&
      auAfter.answerCount === 1 &&
      auAfter.locked === true,
  );

  // Submission queue
  const auOpenSub = await submitAnswer(prisma, {
    questionId: auOpen.id,
    userId: A,
    answerText: "إجابة الطالب",
  });
  const auQ1 = await listSubmissionQueue(prisma, {
    courseId: sfCourse.id,
    status: "UNGRADED",
    page: 1,
    pageSize: 50,
  });
  check(
    "the queue lists the open answer waiting for a grade, not the auto-graded one",
    auQ1.items.some(
      (i) => i.id === auOpenSub.id && i.answerText === "إجابة الطالب",
    ) && !auQ1.items.some((i) => i.question.id === auMc.id),
  );
  await gradeSubmission(prisma, {
    submissionId: auOpenSub.id,
    actorId: ins,
    rawScore: 9,
  });
  const auQ2 = await listSubmissionQueue(prisma, {
    courseId: sfCourse.id,
    status: "UNGRADED",
    page: 1,
    pageSize: 50,
  });
  const auQ3 = await listSubmissionQueue(prisma, {
    courseId: sfCourse.id,
    status: "GRADED",
    questionId: auOpen.id,
    page: 1,
    pageSize: 50,
  });
  check(
    "a graded answer leaves the queue and shows under GRADED",
    !auQ2.items.some((i) => i.id === auOpenSub.id) &&
      auQ3.items.length === 1 &&
      auQ3.items[0].finalScore === 9,
  );

  // Exam authoring
  const auExam = await createExam(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: { titleAr: "الامتحان النهائي", passingPercent: 60 },
  });
  check(
    "the exam is created as a DRAFT with the chosen pass mark",
    auExam.status === "DRAFT" && auExam.passingPercent === 60,
  );
  await expectError(
    "a second exam is refused",
    () =>
      createExam(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: { titleAr: "امتحان آخر" },
      }),
    "EXAM_EXISTS",
  );
  await expectError(
    "an exam with no questions cannot be published",
    () =>
      updateExam(prisma, {
        examId: auExam.id,
        actorId: ins,
        input: { status: "PUBLISHED" },
      }),
    "EXAM_NOT_READY",
  );
  await expectError(
    "an exam question cannot carry its own deadline",
    () =>
      createQuestion(prisma, {
        parent: { kind: "exam", examId: auExam.id },
        actorId: ins,
        input: { type: "OPEN", body: "اكتب", points: 5, dueAt: at(1) },
      }),
    "INVALID_QUESTION",
  );
  const auEq1 = await createQuestion(prisma, {
    parent: { kind: "exam", examId: auExam.id },
    actorId: ins,
    input: { ...mcInput, points: 5, explanation: null },
  });
  const auEq2 = await createQuestion(prisma, {
    parent: { kind: "exam", examId: auExam.id },
    actorId: ins,
    input: {
      type: "OPEN",
      body: "اكتب مقالًا",
      points: 10,
      status: "PUBLISHED",
    },
  });
  await updateExam(prisma, {
    examId: auExam.id,
    actorId: ins,
    input: { status: "PUBLISHED" },
  });
  const auExamStaff = await getExamForStaff(prisma, auExam.id);
  check(
    "the exam is published with 2 questions and 15 points",
    auExamStaff.status === "PUBLISHED" &&
      auExamStaff.publishedQuestionCount === 2 &&
      auExamStaff.maxScore === 15,
  );

  // Exam grading queue
  const auAtt = await startAttempt(prisma, { examId: auExam.id, userId: A });
  const auEqList = await listQuestionsForStaff(prisma, {
    kind: "exam",
    examId: auExam.id,
  });
  const auEq1Right = auEqList.items
    .find((i) => i.id === auEq1.id)!
    .options.find((o) => o.isCorrect)!.id;
  await saveAnswers(prisma, {
    attemptId: auAtt.attempt.id,
    userId: A,
    answers: [
      { questionId: auEq1.id, selectedOptionId: auEq1Right },
      { questionId: auEq2.id, answerText: "مقال الطالب" },
    ],
  });
  await submitAttempt(prisma, { attemptId: auAtt.attempt.id, userId: A });
  const auAtts = await listExamAttempts(prisma, {
    examId: auExam.id,
    status: "SUBMITTED",
    page: 1,
    pageSize: 50,
  });
  check(
    "the exam queue shows A with one answer waiting",
    auAtts.items.length === 1 && auAtts.items[0].pendingManual === 1,
    JSON.stringify(auAtts.items.map((i) => i.pendingManual)),
  );
  const auDetail = await getAttemptForGrader(prisma, auAtt.attempt.id);
  check(
    "the grader sees the student's text and the answer key",
    auDetail.answers.some((a) => a.answerText === "مقال الطالب") &&
      auDetail.answers.some((a) => a.question.options.some((o) => o.isCorrect)),
  );
  const auEssay = auDetail.answers.find((a) => a.question.type === "OPEN")!;
  check(
    "the open answer is flagged as needing a grade, the objective one as auto-graded",
    auEssay.needsGrading === true &&
      auDetail.answers.find((a) => a.question.type === "MULTIPLE_CHOICE")
        ?.autoGraded === true,
  );
  await gradeExamAnswer(prisma, {
    answerId: auEssay.id,
    actorId: ins,
    score: 8,
  });
  const auAtts2 = await listExamAttempts(prisma, {
    examId: auExam.id,
    status: "GRADED",
    page: 1,
    pageSize: 50,
  });
  check(
    "after grading, the attempt moves to GRADED with a 13-point total",
    auAtts2.items.length === 1 && auAtts2.items[0].totalScore === 13,
    JSON.stringify(auAtts2.items.map((i) => i.totalScore)),
  );
  await expectError(
    "an exam with attempts cannot be deleted",
    () => deleteExam(prisma, { examId: auExam.id, actorId: ins }),
    "EXAM_HAS_ATTEMPTS",
  );
  await expectError(
    "exam question points are locked once answered",
    () =>
      updateQuestion(prisma, {
        questionId: auEq1.id,
        actorId: ins,
        input: { points: 7 },
      }),
    "QUESTION_LOCKED",
  );

  // Certificate review list and export download
  const auReviews = await listCertificateReviews(prisma, {
    courseId: sfCourse.id,
    page: 1,
    pageSize: 50,
  });
  const auRevA = auReviews.items.find((i) => i.userId === A)!;
  check(
    "the review list shows live numbers beside the stored status",
    auRevA.live.attendance.percent === 100 &&
      auRevA.review?.status === "AUTO_ELIGIBLE",
    `${auRevA.live.attendance.percent} ${auRevA.review?.status}`,
  );
  const auOnlyIneligible = await listCertificateReviews(prisma, {
    courseId: sfCourse.id,
    status: "AUTO_INELIGIBLE",
    page: 1,
    pageSize: 50,
  });
  check(
    "filtering by status returns only B",
    auOnlyIneligible.items.length === 1 &&
      auOnlyIneligible.items[0].userId === B,
  );

  await decideCertificate(prisma, {
    courseId: sfCourse.id,
    userId: A,
    decision: "APPROVED",
    actorId: ins,
  });
  await prisma.user.update({ where: { id: A }, data: { fullName: "=1+1" } });
  const auExp = await exportCertificates(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
  });
  const auCsv = await getCertificateExportCsv(prisma, {
    exportId: auExp.export.id,
    actorId: ins,
  });
  await prisma.user.update({
    where: { id: A },
    data: { fullName: "Smoke studentA" },
  });
  check(
    "the CSV starts with a BOM and the header row",
    auCsv.csv.startsWith("\uFEFFFull name,Email,"),
  );
  check(
    "a formula in a student's name is neutralized in the CSV",
    auCsv.csv.includes("'=1+1") && !/\r\n=/.test(auCsv.csv),
  );
  const auExports = await listCertificateExports(prisma, sfCourse.id);
  check(
    "the export appears in the course's export history",
    auExports.items.some((e) => e.id === auExp.export.id && e.itemCount === 1),
  );

  const auActions = new Set(
    (
      await prisma.auditLog.findMany({
        where: { actorId: ins },
        select: { action: true },
      })
    ).map((a) => a.action),
  );
  for (const a of [
    "question.create",
    "question.update",
    "exam.create",
    "exam.update",
    "certificate.export.download",
  ]) {
    check(`audit log has '${a}'`, auActions.has(a));
  }

  // ---- Operations ------------------------------------------------------------------------
  section("Operations: rate limiting, maintenance, files");

  // Rate limiter (fixed window, counters in Postgres)
  const rlNow = new Date("2026-10-01T12:00:10Z");
  const rlArgs = {
    scope: `smoke-${Date.now()}`,
    subject: "user-1",
    limit: 3,
    windowSeconds: 60,
  };
  const passes = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return true;
    } catch {
      return false;
    }
  };
  let rlAllowed = 0;
  for (let i = 0; i < 3; i++)
    if (await passes(() => enforceRateLimit(prisma, { ...rlArgs, now: rlNow })))
      rlAllowed++;
  check(
    "three requests inside the limit are allowed",
    rlAllowed === 3,
    rlAllowed,
  );
  await expectError(
    "the fourth request in the same window is refused",
    () => enforceRateLimit(prisma, { ...rlArgs, now: rlNow }),
    "RATE_LIMITED",
  );
  check(
    "another subject is not affected",
    await passes(() =>
      enforceRateLimit(prisma, { ...rlArgs, subject: "user-2", now: rlNow }),
    ),
  );
  check(
    "the next window starts fresh",
    await passes(() =>
      enforceRateLimit(prisma, {
        ...rlArgs,
        now: new Date(rlNow.getTime() + 60_000),
      }),
    ),
  );

  // Scheduled maintenance
  const mt = await runMaintenance(prisma);
  check(
    "maintenance syncs the published certificate courses without errors",
    mt.errors.length === 0 && mt.coursesSynced >= 1,
    JSON.stringify(mt),
  );

  // Files: who may download what, and where a stored file may live
  const sfMatEnr = await createMaterial(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: {
      titleAr: "للمسجلين",
      type: "PDF",
      externalUrl: "https://files.example/enrolled.pdf",
      visibility: "ENROLLED",
      status: "PUBLISHED",
    },
  });
  const sfMatFile = await createMaterial(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: {
      titleAr: "ملف مخزن",
      type: "PDF",
      storagePath: `courses/${sfCourse.id}/${randomUUID()}.pdf`,
      visibility: "ENROLLED",
      status: "PUBLISHED",
    },
  });
  await expectError(
    "a file stored under another course cannot be attached",
    () =>
      createMaterial(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: {
          titleAr: "ملف",
          type: "PDF",
          storagePath: `courses/${courseId}/${randomUUID()}.pdf`,
        },
      }),
    "INVALID_URL",
  );
  const maPublic = await getMaterialAccess(prisma, {
    materialId: sfMat.id,
    viewerId: null,
  });
  check(
    "a PUBLIC material is reachable by a visitor",
    maPublic.kind === "external",
  );
  await expectError(
    "an ENROLLED material is hidden from a visitor",
    () =>
      getMaterialAccess(prisma, { materialId: sfMatEnr.id, viewerId: null }),
    "NOT_FOUND",
  );
  await expectError(
    "an ENROLLED material is hidden from a signed-in non-member",
    () => getMaterialAccess(prisma, { materialId: sfMatEnr.id, viewerId: C }),
    "NOT_FOUND",
  );
  const maEnrolled = await getMaterialAccess(prisma, {
    materialId: sfMatFile.id,
    viewerId: A,
  });
  check(
    "an enrolled student is pointed at the private file in this course's folder",
    maEnrolled.kind === "storage" &&
      maEnrolled.path.startsWith(`courses/${sfCourse.id}/`) &&
      maEnrolled.downloadName.endsWith(".pdf"),
  );

  // Course cover images only come from the cover upload flow
  await expectError(
    "a cover from another course's folder is refused",
    () =>
      updateCourse(prisma, {
        courseId: sfCourse.id,
        actorId: ins,
        input: { coverImagePath: `covers/${courseId}/x.png` },
      }),
    "INVALID_URL",
  );
  await updateCourse(prisma, {
    courseId: sfCourse.id,
    actorId: ins,
    input: { coverImagePath: `covers/${sfCourse.id}/${randomUUID()}.png` },
  });
  const sfCover = await prisma.course.findUniqueOrThrow({
    where: { id: sfCourse.id },
    select: { coverImagePath: true },
  });
  check(
    "a cover from this course's own folder is accepted",
    sfCover.coverImagePath?.startsWith(`covers/${sfCourse.id}/`) === true,
  );

  // Deleting an auth account disables the profile instead of leaving it dangling
  const delId = await createUser("deleted", false);
  await prisma.$executeRaw`DELETE FROM auth.users WHERE id = ${delId}::uuid`;
  const delProfile = await prisma.user.findUniqueOrThrow({
    where: { id: delId },
  });
  check(
    "deleting the auth account disables the profile and frees its email",
    delProfile.deletedAt !== null &&
      delProfile.status === "SUSPENDED" &&
      delProfile.email.startsWith("deleted+"),
    `${delProfile.status} ${delProfile.email}`,
  );
  await prisma.user.delete({ where: { id: delId } });

  // ---- Audit trail ------------------------------------------------------------------------
  section("Audit trail");
  const actions = new Set(
    (
      await prisma.auditLog.findMany({
        where: { actorId: ins },
        select: { action: true },
      })
    ).map((a) => a.action),
  );
  for (const a of [
    "submission.grade",
    "submission.release",
    "submission.excuse",
    "submission.excuse.revoke",
    "submission.extend",
    "submission.reopen",
    "certificate.decide",
    "certificate.requirements.update",
    "certificate.export",
    "exam.grade",
    "exam.reopen",
  ]) {
    check(`audit log has '${a}'`, actions.has(a));
  }
}

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    return;
  }
  await cleanup(); // clear leftovers from a previous crashed run
  try {
    await run();
  } catch (e) {
    failed++;
    failures.push("UNEXPECTED CRASH");
    console.error("\nUNEXPECTED ERROR:", e);
  } finally {
    section("Cleanup");
    await cleanup();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log("Failures:\n - " + failures.join("\n - "));
  process.exitCode = failed ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
