// scripts/smoke-exam-timer.ts
//
// Tests the per-attempt time limit against your development database. Time is controlled: every
// service call is given an explicit "now", so the test needs no waiting.
//
// Throwaway data only (prefix "smoke-timer-"), removed at the end.
//
// Run:      npx tsx scripts/smoke-exam-timer.ts
// Clean up after a crashed run:   npx tsx scripts/smoke-exam-timer.ts --cleanup

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
// ADJUST this import if your generator output differs
import { PrismaClient } from "@/generated/prisma/client";
import { ATTEMPT_GRACE_MS } from "@/lib/exams/exam";
import { finalizeAttemptIfExpired, finalizeExpiredAttempts, saveAnswers, startAttempt, submitAttempt } from "@/lib/exams/service";
import { getAttemptForStudent, getExamForStudent } from "@/lib/read/service";
import { createExam, updateExam } from "@/lib/staff/exams";
import { createQuestion } from "@/lib/staff/questions";
import { createExamSchema, updateExamSchema } from "@/lib/validation/staff";

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `  -> ${String(detail)}` : ""}`);
  }
}
const section = (title: string) => console.log(`\n== ${title}`);

const MIN = 60_000;
const HOUR = 60 * MIN;

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: "smoke-timer-" } }, select: { id: true } });
  const users = await prisma.user.findMany({ where: { email: { startsWith: "smoke-timer-" } }, select: { id: true } });
  const courseIds = courses.map((c) => c.id);
  const userIds = users.map((u) => u.id);
  if (courseIds.length) {
    const inCourse = { in: courseIds };
    await prisma.certificateReview.deleteMany({ where: { courseId: inCourse } });
    await prisma.examAnswer.deleteMany({ where: { attempt: { exam: { courseId: inCourse } } } });
    await prisma.examAttempt.deleteMany({ where: { exam: { courseId: inCourse } } });
    await prisma.examAttemptGrant.deleteMany({ where: { exam: { courseId: inCourse } } });
    await prisma.question.deleteMany({ where: { courseId: inCourse } });
    await prisma.exam.deleteMany({ where: { courseId: inCourse } });
    await prisma.enrollment.deleteMany({ where: { courseId: inCourse } });
    await prisma.course.deleteMany({ where: { id: inCourse } });
  }
  if (userIds.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const id of userIds) await prisma.$executeRaw`DELETE FROM auth.users WHERE id = ${id}::uuid`;
  }
  await prisma.$executeRaw`DELETE FROM auth.users WHERE email LIKE 'smoke-timer-%@example.test'`;
  console.log(`Cleaned up ${courseIds.length} course(s), ${userIds.length} user(s).`);
}

async function createUser(label: string) {
  const id = randomUUID();
  const email = `smoke-timer-${label}-${Date.now()}@example.test`;
  const meta = JSON.stringify({ full_name: `Smoke ${label}`, phone: "+21600000000", country: "TN", locale: "ar", data_sharing_consent: true });
  await prisma.$executeRaw`
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
    VALUES (${id}::uuid, 'authenticated', 'authenticated', ${email}, ${meta}::jsonb)`;
  return { id, email };
}

async function code(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

async function run() {
  const base = new Date();
  const at = (ms: number) => new Date(base.getTime() + ms);

  section("Setup");
  const ins = await createUser("ins");
  const students = {} as Record<string, { id: string; email: string }>;
  for (const k of ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]) students[k] = await createUser(k);

  const course = await prisma.course.create({
    data: {
      slug: `smoke-timer-${Date.now()}`, titleAr: "دورة الوقت", titleEn: "Timer course", status: "PUBLISHED", examEnabled: true,
      settings: { create: { partialWeight: 1, allowLateSubmissions: true, defaultPenaltyType: "NONE", defaultPenaltyValue: 0 } },
    },
  });
  const courseId = course.id;
  await prisma.enrollment.createMany({ data: Object.values(students).map((u) => ({ userId: u.id, courseId, status: "ACTIVE" as const })) });

  const exam = await createExam(prisma, {
    courseId, actorId: ins.id,
    input: { titleAr: "امتحان مؤقّت", passingPercent: 50, attemptLimit: 1, durationMinutes: 30, dueAt: at(2 * HOUR) },
  });
  const examId = exam.id;
  check("the time limit is stored when the exam is created", exam.durationMinutes === 30, exam.durationMinutes);

  const tf = await createQuestion(prisma, { parent: { kind: "exam", examId }, actorId: ins.id, input: { type: "TRUE_FALSE", body: "صح؟", correctAnswer: true, points: 5, status: "PUBLISHED" } });
  const open = await createQuestion(prisma, { parent: { kind: "exam", examId }, actorId: ins.id, input: { type: "OPEN", body: "اشرح", points: 5, status: "PUBLISHED" } });
  await updateExam(prisma, { examId, actorId: ins.id, input: { status: "PUBLISHED" } });
  const correct = (await prisma.question.findUniqueOrThrow({ where: { id: tf.id }, select: { options: { select: { id: true, isCorrect: true } } } })).options.find((o) => o.isCorrect)!;
  const answerTf = [{ questionId: tf.id, selectedOptionId: correct.id }];

  const start = (userId: string, now: Date) => startAttempt(prisma, { examId, userId, now });
  const attemptOf = (id: string) => prisma.examAttempt.findUniqueOrThrow({ where: { id } });

  // ------------------------------------------------------------------
  section("The clock starts when the student starts");
  const a1 = (await start(students.s1.id, base)).attempt;
  check("the end is the start plus the time limit", a1.expiresAt?.getTime() === at(30 * MIN).getTime(), String(a1.expiresAt));
  const resumed = await start(students.s1.id, at(5 * MIN));
  check("starting again resumes the same attempt with the SAME end (the clock never restarts)", resumed.resumed && resumed.attempt.id === a1.id && resumed.attempt.expiresAt?.getTime() === at(30 * MIN).getTime());
  const view = await getAttemptForStudent(prisma, { userId: students.s1.id, attemptId: a1.id, now: at(10 * MIN) });
  check("the student view carries the end, the server clock and the limit", view.mode === "IN_PROGRESS" && view.endsAt?.getTime() === at(30 * MIN).getTime() && view.serverNow.getTime() === at(10 * MIN).getTime() && view.timeLimitMinutes === 30);
  check("...and says the time is not up yet", view.mode === "IN_PROGRESS" && !view.expired && !view.overdue);
  const info = await getExamForStudent(prisma, { userId: students.s1.id, examId, now: at(10 * MIN) });
  check("the exam page learns the time limit", info.durationMinutes === 30);

  // ------------------------------------------------------------------
  section("Saving and submitting around the end");
  check("saving before the end works", (await code(() => saveAnswers(prisma, { attemptId: a1.id, userId: students.s1.id, answers: answerTf, now: at(29 * MIN) }))) === null);
  check("saving just after the end still works (grace period)", (await code(() => saveAnswers(prisma, { attemptId: a1.id, userId: students.s1.id, answers: answerTf, now: at(30 * MIN + 10_000) }))) === null);
  const lateView = await getAttemptForStudent(prisma, { userId: students.s1.id, attemptId: a1.id, now: at(30 * MIN + 10_000) });
  check("in the grace period the time is up for the student but the attempt is not overdue yet", lateView.mode === "IN_PROGRESS" && lateView.expired && !lateView.overdue);

  await submitAttempt(prisma, { attemptId: a1.id, userId: students.s1.id, now: at(30 * MIN + 10_000) });
  const done1 = await attemptOf(a1.id);
  check("a submit inside the grace period is accepted", done1.status !== "IN_PROGRESS");
  check("...and is recorded at the END, not after it", done1.submittedAt?.getTime() === at(30 * MIN).getTime(), String(done1.submittedAt));

  // ------------------------------------------------------------------
  section("After the end plus grace");
  const a2 = (await start(students.s2.id, base)).attempt;
  const a3 = (await start(students.s3.id, base)).attempt;
  const a5 = (await start(students.s5.id, base)).attempt;
  await saveAnswers(prisma, { attemptId: a2.id, userId: students.s2.id, answers: answerTf, now: at(20 * MIN) });
  const tooLate = at(30 * MIN + ATTEMPT_GRACE_MS + 5_000);
  check("saving is refused", (await code(() => saveAnswers(prisma, { attemptId: a2.id, userId: students.s2.id, answers: answerTf, now: tooLate }))) === "EXAM_CLOSED");
  check("submitting is refused", (await code(() => submitAttempt(prisma, { attemptId: a2.id, userId: students.s2.id, now: tooLate }))) === "EXAM_CLOSED");
  const overdueView = await getAttemptForStudent(prisma, { userId: students.s2.id, attemptId: a2.id, now: tooLate });
  check("the student view reports it overdue", overdueView.mode === "IN_PROGRESS" && overdueView.overdue);

  // ------------------------------------------------------------------
  section("Coming back after the time ran out");
  const back = await code(() => start(students.s5.id, at(31 * MIN)));
  check("the old attempt is closed first and counts as the one allowed attempt", back === "NO_ATTEMPTS_LEFT" && (await attemptOf(a5.id)).status !== "IN_PROGRESS", back);
  check("finalizing an attempt that is already closed does nothing", (await finalizeAttemptIfExpired(prisma, { attemptId: a5.id, now: at(40 * MIN) })) === false);

  // ------------------------------------------------------------------
  section("Attempts that ran out while the student was away");
  const early = await finalizeExpiredAttempts(prisma, { examId, now: at(30 * MIN + 5_000) });
  check("nothing is finalized inside the grace period", early.finalized === 0, early.finalized);
  const sweep = await finalizeExpiredAttempts(prisma, { examId, now: at(31 * MIN) });
  check("afterwards the sweep submits the two attempts nobody came back to", sweep.finalized === 2, sweep.finalized);
  const f2 = await attemptOf(a2.id);
  check("an abandoned attempt is submitted at the moment its time ran out", f2.status !== "IN_PROGRESS" && f2.submittedAt?.getTime() === at(30 * MIN).getTime(), String(f2.submittedAt));
  const ans2 = await prisma.examAnswer.findFirst({ where: { attemptId: a2.id, questionId: tf.id } });
  check("the answers saved before the end were graded", ans2?.isCorrect === true);
  check("an attempt with nothing saved is also closed, not left open", (await attemptOf(a3.id)).status !== "IN_PROGRESS");
  check("running the sweep again finds nothing", (await finalizeExpiredAttempts(prisma, { examId, now: at(32 * MIN) })).finalized === 0);

  // ------------------------------------------------------------------
  section("The exam's closing time cuts an attempt short");
  const a4 = (await start(students.s4.id, at(5 * MIN))).attempt;
  check("the attempt's own limit still ends 30 minutes after it started", a4.expiresAt?.getTime() === at(35 * MIN).getTime());
  await prisma.exam.update({ where: { id: examId }, data: { dueAt: at(10 * MIN) } });
  const cutView = await getAttemptForStudent(prisma, { userId: students.s4.id, attemptId: a4.id, now: at(8 * MIN) });
  check("but the exam closes at minute 10, so that is when the attempt ends", cutView.mode === "IN_PROGRESS" && cutView.endsAt?.getTime() === at(10 * MIN).getTime());
  check("saving at the closing time + 10 s works", (await code(() => saveAnswers(prisma, { attemptId: a4.id, userId: students.s4.id, answers: answerTf, now: at(10 * MIN + 10_000) }))) === null);
  check("saving at the closing time + 20 s is refused", (await code(() => saveAnswers(prisma, { attemptId: a4.id, userId: students.s4.id, answers: answerTf, now: at(10 * MIN + 20_000) }))) === "EXAM_CLOSED");
  check("it is finalized at the closing time", (await finalizeAttemptIfExpired(prisma, { attemptId: a4.id, now: at(11 * MIN) })) === true && (await attemptOf(a4.id)).submittedAt?.getTime() === at(10 * MIN).getTime());
  await prisma.exam.update({ where: { id: examId }, data: { dueAt: at(2 * HOUR) } });

  // ------------------------------------------------------------------
  section("Changing the limit");
  const a6 = (await start(students.s6.id, base)).attempt;
  await updateExam(prisma, { examId, actorId: ins.id, input: { durationMinutes: 5 } });
  check("a running attempt keeps the end it was given", (await attemptOf(a6.id)).expiresAt?.getTime() === at(30 * MIN).getTime());
  const a7 = (await start(students.s7.id, base)).attempt;
  check("a new attempt gets the new limit", a7.expiresAt?.getTime() === at(5 * MIN).getTime(), String(a7.expiresAt));

  section("No time limit");
  await updateExam(prisma, { examId, actorId: ins.id, input: { durationMinutes: null } });
  const a8 = (await start(students.s8.id, base)).attempt;
  check("without a limit the attempt has no personal end", a8.expiresAt === null);
  check("it still ends at the exam's closing time (+ grace)", (await code(() => saveAnswers(prisma, { attemptId: a8.id, userId: students.s8.id, answers: answerTf, now: at(2 * HOUR + 10_000) }))) === null && (await code(() => saveAnswers(prisma, { attemptId: a8.id, userId: students.s8.id, answers: answerTf, now: at(2 * HOUR + 20_000) }))) === "EXAM_CLOSED");

  // ------------------------------------------------------------------
  section("What staff may enter");
  const ok = (input: object) => createExamSchema.safeParse({ titleAr: "امتحان", ...input }).success;
  check("a normal limit, no limit (null) and an omitted limit are accepted", ok({ durationMinutes: 45 }) && ok({ durationMinutes: null }) && ok({}));
  check("0, negative, fractional and absurdly long limits are refused", !ok({ durationMinutes: 0 }) && !ok({ durationMinutes: -5 }) && !ok({ durationMinutes: 1.5 }) && !ok({ durationMinutes: 601 }));
  check("the update schema accepts clearing the limit and refuses a bad one", updateExamSchema.safeParse({ durationMinutes: null }).success && !updateExamSchema.safeParse({ durationMinutes: 700 }).success);
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
