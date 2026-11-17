// scripts/smoke-insights.ts
//
// Tests the numbers behind the reports and the audit log filters against your development
// database. It builds a small course with known data (attendance, answers, an exam, certificate
// decisions) and checks that every figure comes out exactly as expected.
//
// Throwaway data only (slug / email prefix "smoke-insights-"); removed at the end.
//
// Run:      npx tsx scripts/smoke-insights.ts
// Clean up after a crashed run:   npx tsx scripts/smoke-insights.ts --cleanup

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
// ADJUST this import if your generator output differs
import { PrismaClient } from "@/generated/prisma/client";
import { parseAuditFilter } from "@/lib/staff/audit-filter";
import {
  buildAuditCsv,
  listAuditEntityTypes,
  listAuditLog,
} from "@/lib/staff/audit-log";
import { audit } from "@/lib/staff/common";
import {
  courseReport,
  platformOverview,
  reportScope,
} from "@/lib/staff/reports";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
});

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
const section = (title: string) => console.log(`\n== ${title}`);
const near = (a: number | null | undefined, b: number) =>
  a != null && Math.abs(a - b) < 0.001;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function cleanup() {
  const courses = await prisma.course.findMany({
    where: { slug: { startsWith: "smoke-insights-" } },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "smoke-insights-" } },
    select: { id: true },
  });
  const courseIds = courses.map((c) => c.id);
  const userIds = users.map((u) => u.id);
  if (courseIds.length) {
    const inCourse = { in: courseIds };
    await prisma.certificateReview.deleteMany({
      where: { courseId: inCourse },
    });
    await prisma.examAttempt.deleteMany({
      where: { exam: { courseId: inCourse } },
    });
    await prisma.questionSubmission.deleteMany({
      where: { question: { courseId: inCourse } },
    });
    await prisma.question.deleteMany({ where: { courseId: inCourse } });
    await prisma.exam.deleteMany({ where: { courseId: inCourse } });
    await prisma.attendanceRecord.deleteMany({ where: { courseId: inCourse } });
    await prisma.lecture.deleteMany({ where: { courseId: inCourse } });
    await prisma.enrollment.deleteMany({ where: { courseId: inCourse } });
    await prisma.course.deleteMany({ where: { id: inCourse } });
  }
  if (userIds.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // role assignments cascade
    for (const id of userIds)
      await prisma.$executeRaw`DELETE FROM auth.users WHERE id = ${id}::uuid`;
  }
  await prisma.$executeRaw`DELETE FROM auth.users WHERE email LIKE 'smoke-insights-%@example.test'`;
  await prisma.role.deleteMany({
    where: { key: { startsWith: "smoke-" }, isSystem: false },
  });
  console.log(
    `Cleaned up ${courseIds.length} course(s), ${userIds.length} user(s).`,
  );
}

async function createUser(label: string, fullName = `Smoke ${label}`) {
  const id = randomUUID();
  const email = `smoke-insights-${label}-${Date.now()}@example.test`;
  const meta = JSON.stringify({
    full_name: fullName,
    phone: "+21600000000",
    country: "TN",
    locale: "ar",
    data_sharing_consent: true,
  });
  await prisma.$executeRaw`
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
    VALUES (${id}::uuid, 'authenticated', 'authenticated', ${email}, ${meta}::jsonb)`;
  return { id, email };
}

async function run() {
  const now = new Date();

  section("Setup: a course with known data");
  const ins = await createUser("ins");
  const A = await createUser("a");
  const B = await createUser("b");
  const C = await createUser("c");
  const nobody = await createUser("nobody");
  const owner = await createUser("owner");

  const course = await prisma.course.create({
    data: {
      slug: `smoke-insights-${Date.now()}`,
      titleAr: "دورة التقارير",
      titleEn: "Reports course",
      status: "PUBLISHED",
      questionsEnabled: true,
      examEnabled: true,
      certificateEnabled: true,
      settings: {
        create: {
          partialWeight: 0.5,
          allowLateSubmissions: true,
          defaultPenaltyType: "NONE",
          defaultPenaltyValue: 0,
        },
      },
    },
  });
  const courseId = course.id;
  const other = await prisma.course.create({
    data: {
      slug: `smoke-insights-other-${Date.now()}`,
      titleAr: "دورة أخرى",
      status: "PUBLISHED",
      settings: {
        create: {
          partialWeight: 1,
          allowLateSubmissions: true,
          defaultPenaltyType: "NONE",
          defaultPenaltyValue: 0,
        },
      },
    },
  });
  await prisma.enrollment.createMany({
    data: [
      { userId: A.id, courseId, status: "ACTIVE" },
      {
        userId: B.id,
        courseId,
        status: "ACTIVE",
        enrolledAt: new Date(now.getTime() - 10 * DAY),
      },
      { userId: C.id, courseId, status: "WITHDRAWN", withdrawnAt: now },
      { userId: A.id, courseId: other.id, status: "ACTIVE" }, // must NOT leak into the first course's numbers
    ],
  });

  const lec = (number: number, startsInMs: number) =>
    prisma.lecture.create({
      data: {
        courseId,
        number,
        titleAr: `محاضرة ${number}`,
        titleEn: `Lecture ${number}`,
        startsAt: new Date(now.getTime() + startsInMs),
        endsAt: new Date(now.getTime() + startsInMs + HOUR),
        status: "PUBLISHED",
      },
    });
  const L1 = await lec(1, -3 * DAY);
  const L2 = await lec(2, -2 * DAY);
  await lec(3, 2 * DAY); // upcoming
  await prisma.attendanceRecord.createMany({
    data: [
      { courseId, lectureId: L1.id, userId: A.id, status: "PRESENT" },
      { courseId, lectureId: L1.id, userId: B.id, status: "ABSENT" },
      { courseId, lectureId: L2.id, userId: A.id, status: "PARTIAL" },
      { courseId, lectureId: L2.id, userId: B.id, status: "PRESENT" },
    ],
  });

  const qA = await prisma.question.create({
    data: {
      courseId,
      lectureId: L1.id,
      type: "OPEN",
      body: "سؤال أ",
      points: 10,
      status: "PUBLISHED",
    },
  });
  const qB = await prisma.question.create({
    data: {
      courseId,
      lectureId: L1.id,
      type: "OPEN",
      body: "سؤال ب",
      points: 10,
      status: "PUBLISHED",
    },
  });
  await prisma.question.create({
    data: {
      courseId,
      lectureId: L1.id,
      type: "OPEN",
      body: "مسودة",
      points: 10,
      status: "DRAFT",
    },
  });
  const graded = { gradedAt: now };
  await prisma.questionSubmission.create({
    data: {
      questionId: qA.id,
      userId: A.id,
      answerText: "x",
      rawScore: 8,
      finalScore: 8,
      ...graded,
    },
  });
  await prisma.questionSubmission.create({
    data: {
      questionId: qA.id,
      userId: B.id,
      answerText: "y",
      rawScore: 4,
      finalScore: 4,
      isLate: true,
      ...graded,
    },
  });
  await prisma.questionSubmission.create({
    data: { questionId: qB.id, userId: A.id, answerText: "z" },
  }); // not graded yet

  const exam = await prisma.exam.create({
    data: {
      courseId,
      titleAr: "امتحان",
      status: "PUBLISHED",
      passingPercent: 50,
    },
  });
  await prisma.question.create({
    data: {
      courseId,
      examId: exam.id,
      type: "OPEN",
      body: "امتحان 1",
      points: 10,
      status: "PUBLISHED",
    },
  });
  await prisma.question.create({
    data: {
      courseId,
      examId: exam.id,
      type: "OPEN",
      body: "امتحان 2",
      points: 10,
      status: "PUBLISHED",
    },
  });
  await prisma.examAttempt.create({
    data: {
      examId: exam.id,
      userId: A.id,
      attemptNumber: 1,
      status: "GRADED",
      totalScore: 10,
      submittedAt: now,
      gradedAt: now,
    },
  });
  await prisma.examAttempt.create({
    data: {
      examId: exam.id,
      userId: A.id,
      attemptNumber: 2,
      status: "GRADED",
      totalScore: 18,
      submittedAt: now,
      gradedAt: now,
    },
  });
  await prisma.examAttempt.create({
    data: {
      examId: exam.id,
      userId: B.id,
      attemptNumber: 1,
      status: "GRADED",
      totalScore: 6,
      submittedAt: now,
      gradedAt: now,
    },
  });
  await prisma.examAttempt.create({
    data: {
      examId: exam.id,
      userId: C.id,
      attemptNumber: 1,
      status: "SUBMITTED",
      submittedAt: now,
    },
  });

  await prisma.certificateReview.create({
    data: {
      courseId,
      userId: A.id,
      status: "APPROVED",
      decidedById: ins.id,
      decidedAt: now,
    },
  });
  await prisma.certificateReview.create({
    data: {
      courseId,
      userId: B.id,
      status: "AUTO_ELIGIBLE",
      needsReReview: true,
    },
  });
  check("setup done", true);

  // ------------------------------------------------------------------
  section("Course report: enrollment");
  const r = await courseReport(prisma, courseId, now);
  check(
    "2 active and 1 withdrawn (the other course is not counted)",
    r.enrollment.active === 2 && r.enrollment.withdrawn === 1,
    `${r.enrollment.active}/${r.enrollment.withdrawn}`,
  );
  check(
    "the weekly trend has 12 weeks and counts all 3 enrollments",
    r.enrollment.weekly.length === 12 &&
      r.enrollment.weekly.reduce((a, b) => a + b.count, 0) === 3,
    r.enrollment.weekly.map((w) => w.count).join(","),
  );
  check("this week is the last bucket", r.enrollment.weekly[11].count >= 1);

  section("Course report: attendance");
  check(
    "only lectures that have been held are listed (the upcoming one is not)",
    r.lectures.length === 2,
  );
  const l1 = r.lectures.find((l) => l.number === 1)!;
  const l2 = r.lectures.find((l) => l.number === 2)!;
  check(
    "lecture 1: 1 present, 1 absent -> 50%",
    l1.PRESENT === 1 && l1.ABSENT === 1 && near(l1.rate, 50),
    l1.rate,
  );
  check(
    "lecture 2: 1 present, 1 partial at weight 0.5 -> 75%",
    near(l2.rate, 75),
    l2.rate,
  );
  check(
    "everyone was recorded, so nobody is 'unrecorded'",
    l1.unrecorded === 0 && l2.unrecorded === 0,
  );

  section("Course report: questions");
  check(
    "only published lecture questions are listed (not the draft, not exam questions)",
    r.questions.length === 2,
  );
  const qa = r.questions.find((q) => q.id === qA.id)!;
  const qb = r.questions.find((q) => q.id === qB.id)!;
  check(
    "question A: 2 answered, 2 graded, 1 late",
    qa.submitted === 2 && qa.graded === 2 && qa.late === 1,
  );
  check(
    "question A: average (8 + 4) / 2 = 6 of 10 -> 60%",
    near(qa.averagePercent, 60),
    qa.averagePercent,
  );
  check(
    "question B: 1 answered, not graded, no average yet",
    qb.submitted === 1 && qb.graded === 0 && qb.averagePercent === null,
  );

  section("Course report: exam");
  const ex = r.exam!;
  check(
    "participants = 3 students, attempts submitted = 4",
    ex?.participants === 3 && ex.submittedAttempts === 4,
    `${ex?.participants}/${ex?.submittedAttempts}`,
  );
  check("1 attempt is waiting for grading", ex.awaitingGrading === 1);
  check(
    "scores use each student's BEST attempt: A 18/20 = 90%, B 6/20 = 30%",
    ex.scored === 2 && near(ex.averagePercent, 60),
    ex.averagePercent,
  );
  check(
    "pass rate at 50% pass mark -> 1 of 2 = 50%",
    near(ex.passRate, 50),
    ex.passRate,
  );
  check(
    "the histogram puts 90% in the top band and 30% in the 30s",
    ex.distribution[9].count === 1 &&
      ex.distribution[3].count === 1 &&
      ex.distribution.reduce((a, b) => a + b.count, 0) === 2,
  );

  section("Course report: certificates");
  check(
    "stored decisions are counted by status",
    r.certificates.byStatus.APPROVED === 1 &&
      r.certificates.byStatus.AUTO_ELIGIBLE === 1,
  );
  check("one decision needs a new review", r.certificates.needsReReview === 1);
  check(
    "no exports yet",
    r.certificates.exports === 0 && r.certificates.lastExportAt === null,
  );

  let missing = "";
  try {
    await courseReport(prisma, randomUUID());
  } catch (e) {
    missing = (e as { code?: string }).code ?? "";
  }
  check("an unknown course is refused", missing === "NOT_FOUND", missing);

  // ------------------------------------------------------------------
  section("Platform overview and who sees what");
  const roleRow = await prisma.role.create({
    data: {
      key: "smoke-reporter",
      name: "Smoke reporter",
      isSystem: false,
      permissions: {
        create: [{ permission: { connect: { key: "report.view" } } }],
      },
    },
  });
  await prisma.userRole.create({
    data: { userId: ins.id, roleId: roleRow.id, courseId },
  });
  const ownerRole = await prisma.role.findFirstOrThrow({
    where: { key: "owner" },
  });
  await prisma.userRole.create({
    data: { userId: owner.id, roleId: ownerRole.id, courseId: null },
  });

  const insScope = await reportScope(prisma, ins.id);
  check(
    "a course-scoped reporter sees only that course",
    !insScope.all &&
      insScope.courseIds.length === 1 &&
      insScope.courseIds[0] === courseId,
  );
  const ownerScope = await reportScope(prisma, owner.id);
  check("an owner sees every course", ownerScope.all === true);
  const noScope = await reportScope(prisma, nobody.id);
  check(
    "a person with no report permission sees nothing",
    !noScope.all && noScope.courseIds.length === 0,
  );

  const o = await platformOverview(prisma, insScope, now);
  check(
    "the overview covers only the allowed course",
    o.totals.courses === 1 &&
      o.courses.length === 1 &&
      o.courses[0].id === courseId,
  );
  check(
    "active students counted once each (2)",
    o.totals.students === 2,
    o.totals.students,
  );
  check(
    "enrollments in the last 30 days (3 rows)",
    o.totals.newEnrollments === 3,
    o.totals.newEnrollments,
  );
  check("1 lecture in the next 7 days", o.totals.upcomingLectures === 1);
  check(
    "1 answer waits to be graded, 1 exam attempt waits",
    o.totals.ungradedAnswers === 1 && o.totals.examsWaiting === 1,
    `${o.totals.ungradedAnswers}/${o.totals.examsWaiting}`,
  );
  check(
    "1 approved certificate, 0 exports",
    o.totals.approvedCertificates === 1 && o.totals.exports30 === 0,
  );
  const row = o.courses[0];
  check(
    "the course row: 2 active, 1 withdrawn, 2 lectures held",
    row.active === 2 && row.withdrawn === 1 && row.heldLectures === 2,
  );
  check(
    "overall attendance (2 present + 1 partial at 0.5) / 4 = 62.5%",
    near(row.attendanceRate, 62.5),
    row.attendanceRate,
  );
  check("1 eligible, 1 approved", row.eligible === 1 && row.approved === 1);

  const empty = await platformOverview(
    prisma,
    { all: false, courseIds: [] },
    now,
  );
  check(
    "an empty scope gives empty totals",
    empty.totals.courses === 0 &&
      empty.totals.students === 0 &&
      empty.courses.length === 0,
  );

  // ------------------------------------------------------------------
  section("Audit log filters");
  const evil = await createUser("evil", "=1+1");
  const entry = (
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: object = {},
  ) => audit(prisma, { actorId, action, entityType, entityId, metadata });
  await entry(ins.id, "course.update", "Course", courseId, {
    fields: ["titleAr"],
  });
  await entry(ins.id, "lecture.create", "Lecture", L1.id);
  await entry(ins.id, "submission.grade", "Submission", randomUUID(), {
    score: 8,
  });
  await entry(A.id, "user.consent.grant", "User", A.id);
  await entry(evil.id, "course.update", "Course", courseId);

  const tz = "UTC";
  const find = (sp: Record<string, string>, page = 1, pageSize = 50) => {
    const { filter } = parseAuditFilter(sp, tz);
    return listAuditLog(prisma, { filter, page, pageSize });
  };
  const byIns = await find({ actor: ins.id });
  check(
    "filtering by person returns exactly their 3 entries",
    byIns.total === 3 && byIns.items.every((i) => i.actor?.id === ins.id),
  );
  check("newest first", byIns.items[0].createdAt >= byIns.items[2].createdAt);
  check(
    "area filter: course.* by that person -> 1",
    (await find({ actor: ins.id, area: "course" })).total === 1,
  );
  check(
    "area filter does not match other areas",
    (await find({ actor: ins.id, area: "exam" })).total === 0,
  );
  check("entity filter", (await find({ entityId: courseId })).total === 2);
  check(
    "entity type filter",
    (await find({ actor: ins.id, entityType: "Lecture" })).total === 1,
  );
  check(
    "text search on the action",
    (await find({ actor: ins.id, q: "grade" })).total === 1,
  );
  check(
    "text search on the person's email",
    (await find({ q: ins.email.slice(0, 26) })).total >= 3,
  );
  check(
    "text search is case-insensitive",
    (await find({ actor: ins.id, q: "COURSE.UPDATE" })).total === 1,
  );

  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + DAY).toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10);
  check(
    "a 'from' date of today includes today's entries",
    (await find({ actor: ins.id, from: today })).total === 3,
  );
  check(
    "a 'from' date of tomorrow excludes them",
    (await find({ actor: ins.id, from: tomorrow })).total === 0,
  );
  check(
    "a 'to' date of today includes the whole day",
    (await find({ actor: ins.id, to: today })).total === 3,
  );
  check(
    "a 'to' date of yesterday excludes them",
    (await find({ actor: ins.id, to: yesterday })).total === 0,
  );

  const p1 = await find({ actor: ins.id }, 1, 2);
  const p2 = await find({ actor: ins.id }, 2, 2);
  check(
    "paging: 2 + 1 of 3, no overlap",
    p1.items.length === 2 &&
      p2.items.length === 1 &&
      p1.total === 3 &&
      !p2.items.some((i) => p1.items.some((j) => j.id === i.id)),
  );
  check(
    "the entity-type menu lists the types in the log",
    (await listAuditEntityTypes(prisma)).includes("Course"),
  );

  section("Audit CSV");
  const csv = await buildAuditCsv(prisma, { actorId: ins.id });
  check(
    "the CSV holds the 3 entries with a header and a BOM",
    csv.count === 3 &&
      csv.csv.startsWith("\uFEFFtime_utc,") &&
      csv.csv.trim().split("\r\n").length === 4,
  );
  const evilCsv = await buildAuditCsv(prisma, { actorId: evil.id });
  check(
    "a name that looks like a formula is neutralized",
    evilCsv.csv.includes("'=1+1") && !evilCsv.csv.includes(",=1+1,"),
  );
  check(
    "the limit is respected",
    (await buildAuditCsv(prisma, { actorId: ins.id }, 2)).count === 2,
  );
}

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    await prisma.$disconnect();
    return;
  }
  try {
    await run();
  } catch (e) {
    failed++;
    failures.push("crashed");
    console.error("\nThe test crashed:", e);
  } finally {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log("Failed:\n - " + failures.join("\n - "));
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main();
