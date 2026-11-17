// scripts/smoke-notifications.ts
//
// Tests the notification system against your REAL (development) database:
//   - the database triggers (what creates a notification, and what must NOT)
//   - the reminder job and its de-duplication
//   - email delivery, using a fake sender (no email is really sent)
//   - reading, marking read, retention, and the wording of every type
//
// It creates a throwaway course ("smoke-notif-<time>") and four throwaway users, and deletes
// them at the end. Every job it runs is limited to that throwaway course and those users, so
// your real data is never touched.
//
// Run:      npx tsx scripts/smoke-notifications.ts
// Clean up after a crashed run:   npx tsx scripts/smoke-notifications.ts --cleanup
//
// Needs the notifications migration applied first.

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
// ADJUST this import if your generator output differs
import { PrismaClient } from "@/generated/prisma/client";
import { EMAIL_TYPES, NOTIFICATION_TYPES } from "@/lib/notifications/catalog";
import { loadContexts } from "@/lib/notifications/context";
import { deliverPendingEmails } from "@/lib/notifications/deliver";
import type { SendFn } from "@/lib/notifications/email";
import { generateReminders } from "@/lib/notifications/reminders";
import { listNotifications, markRead, purgeOldNotifications } from "@/lib/notifications/service";
import { buildView } from "@/lib/notifications/view";

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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: "smoke-notif-" } }, select: { id: true } });
  const users = await prisma.user.findMany({ where: { email: { startsWith: "smoke-notif-" } }, select: { id: true } });
  const courseIds = courses.map((c) => c.id);
  const userIds = users.map((u) => u.id);

  if (courseIds.length) {
    const inCourse = { in: courseIds };
    await prisma.certificateReview.deleteMany({ where: { courseId: inCourse } });
    await prisma.examAttempt.deleteMany({ where: { exam: { courseId: inCourse } } });
    await prisma.questionSubmission.deleteMany({ where: { question: { courseId: inCourse } } });
    await prisma.question.deleteMany({ where: { courseId: inCourse } });
    await prisma.exam.deleteMany({ where: { courseId: inCourse } });
    await prisma.recording.deleteMany({ where: { lecture: { courseId: inCourse } } });
    await prisma.lecture.deleteMany({ where: { courseId: inCourse } });
    await prisma.enrollment.deleteMany({ where: { courseId: inCourse } });
    await prisma.course.deleteMany({ where: { id: inCourse } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // notifications cascade
    for (const id of userIds) await prisma.$executeRaw`DELETE FROM auth.users WHERE id = ${id}::uuid`;
  }
  await prisma.$executeRaw`DELETE FROM auth.users WHERE email LIKE 'smoke-notif-%@example.test'`;
  console.log(`Cleaned up ${courseIds.length} course(s) and ${userIds.length} user(s).`);
}

async function createUser(label: string) {
  const id = randomUUID();
  const email = `smoke-notif-${label}-${Date.now()}@example.test`;
  const meta = JSON.stringify({ full_name: `Smoke ${label}`, phone: "+21600000000", country: "TN", locale: "ar", data_sharing_consent: true });
  await prisma.$executeRaw`
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
    VALUES (${id}::uuid, 'authenticated', 'authenticated', ${email}, ${meta}::jsonb)`;
  return { id, email };
}

const forUser = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });
const pl = (n: { payload: unknown }) => n.payload as Record<string, string>;

async function run() {
  const now = new Date();

  section("Setup");
  const ins = await createUser("ins");
  const A = await createUser("a");
  const B = await createUser("b");
  const C = await createUser("c");

  const course = await prisma.course.create({
    data: {
      slug: `smoke-notif-${Date.now()}`,
      titleAr: "دورة الإشعارات",
      titleEn: "Notifications course",
      status: "PUBLISHED",
      questionsEnabled: true,
      examEnabled: true,
      certificateEnabled: true,
      recordingsEnabled: true,
      settings: { create: { partialWeight: 1, allowLateSubmissions: true, defaultPenaltyType: "NONE", defaultPenaltyValue: 0 } },
    },
  });
  const courseId = course.id;
  await prisma.enrollment.createMany({
    data: [
      { userId: A.id, courseId, status: "ACTIVE" },
      { userId: B.id, courseId, status: "ACTIVE" },
      { userId: C.id, courseId, status: "WITHDRAWN", withdrawnAt: now },
    ],
  });
  const mkLecture = (number: number, startsInMs: number) =>
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
  const L0 = await mkLecture(1, -2 * HOUR); // already started
  const L1 = await mkLecture(2, 30 * 60_000); // in 30 minutes
  const L2 = await mkLecture(3, 5 * HOUR); // in 5 hours
  const L3 = await mkLecture(4, 3 * DAY); // in 3 days
  check("setup: course, lectures and 3 enrollments created", true);
  check("creating a course, enrollments and lectures notifies nobody", (await prisma.notification.count({ where: { userId: { in: [A.id, B.id, C.id, ins.id] } } })) === 0);

  // ------------------------------------------------------------------
  section("Trigger: a lecture question is published");
  const qWritten = await prisma.question.create({
    data: { courseId, lectureId: L3.id, type: "OPEN", body: "اكتب فقرة", points: 10, status: "PUBLISHED" },
  });
  const pubA = await forUser(A.id, "question.published");
  check("active student A was notified", pubA.length === 1 && pl(pubA[0]).questionId === qWritten.id, pubA.length);
  check("active student B was notified", (await forUser(B.id, "question.published")).length === 1);
  check("a withdrawn student is not notified", (await forUser(C.id, "question.published")).length === 0);
  check("the instructor (not enrolled) is not notified", (await forUser(ins.id, "question.published")).length === 0);
  check("payload carries the course and lecture", pl(pubA[0]).courseId === courseId && pl(pubA[0]).lectureId === L3.id);

  const qDraft = await prisma.question.create({
    data: { courseId, lectureId: L3.id, type: "OPEN", body: "مسودة", points: 5, status: "DRAFT" },
  });
  check("a draft question notifies nobody", (await forUser(A.id, "question.published")).length === 1);
  await prisma.question.update({ where: { id: qDraft.id }, data: { status: "PUBLISHED" } });
  check("publishing the draft notifies", (await forUser(A.id, "question.published")).length === 2);
  await prisma.question.update({ where: { id: qDraft.id }, data: { status: "DRAFT" } });
  await prisma.question.update({ where: { id: qDraft.id }, data: { status: "PUBLISHED" } });
  check("publishing the same question again does not notify twice", (await forUser(A.id, "question.published")).length === 2);

  // ------------------------------------------------------------------
  section("Trigger: a recording is published");
  await prisma.recording.create({ data: { lectureId: L3.id, provider: "OTHER", url: "https://example.com/draft", status: "DRAFT" } });
  check("a draft recording notifies nobody", (await forUser(A.id, "recording.added")).length === 0);
  const rec = await prisma.recording.create({ data: { lectureId: L3.id, provider: "OTHER", url: "https://example.com/v", status: "PUBLISHED" } });
  check("a published recording notifies A and B", (await forUser(A.id, "recording.added")).length === 1 && (await forUser(B.id, "recording.added")).length === 1);
  check("...and carries the recording id", pl((await forUser(A.id, "recording.added"))[0]).recordingId === rec.id);

  // ------------------------------------------------------------------
  section("Trigger: a grade is released to the student");
  const subA = await prisma.questionSubmission.create({ data: { questionId: qWritten.id, userId: A.id, answerText: "x" } });
  check("a new submission notifies nobody", (await forUser(A.id, "question.graded")).length === 0);
  await prisma.questionSubmission.update({
    where: { id: subA.id },
    data: { gradedById: ins.id, gradedAt: new Date(), rawScore: 8, finalScore: 8 },
  });
  check("grading without releasing notifies nobody", (await forUser(A.id, "question.graded")).length === 0);
  await prisma.questionSubmission.update({ where: { id: subA.id }, data: { releasedAt: new Date() } });
  const gradedA = await forUser(A.id, "question.graded");
  check("releasing the grade notifies the student once", gradedA.length === 1 && pl(gradedA[0]).questionId === qWritten.id, gradedA.length);
  await prisma.questionSubmission.update({ where: { id: subA.id }, data: { feedback: "well done" } });
  check("a later edit does not notify again", (await forUser(A.id, "question.graded")).length === 1);

  const subB = await prisma.questionSubmission.create({ data: { questionId: qWritten.id, userId: B.id, answerText: "y" } });
  await prisma.questionSubmission.update({ where: { id: subB.id }, data: { releasedAt: new Date() } });
  check("an automatically graded answer (no grader) is not announced", (await forUser(B.id, "question.graded")).length === 0);

  // ------------------------------------------------------------------
  section("Trigger: the exam is published and results are released");
  const exam = await prisma.exam.create({
    data: { courseId, titleAr: "امتحان", titleEn: "Exam", status: "DRAFT", dueAt: new Date(now.getTime() + 5 * HOUR) },
  });
  check("a draft exam notifies nobody", (await forUser(A.id, "exam.published")).length === 0);
  await prisma.exam.update({ where: { id: exam.id }, data: { status: "PUBLISHED" } });
  check("publishing the exam notifies A and B, not C", (await forUser(A.id, "exam.published")).length === 1 && (await forUser(B.id, "exam.published")).length === 1 && (await forUser(C.id, "exam.published")).length === 0);

  // C's own submit auto-graded the attempt and showed the result at once: no announcement
  const attemptC = await prisma.examAttempt.create({ data: { examId: exam.id, userId: C.id, status: "IN_PROGRESS" } });
  await prisma.examAttempt.update({ where: { id: attemptC.id }, data: { status: "GRADED", submittedAt: new Date(), gradedAt: new Date(), releasedAt: new Date() } });
  check("an attempt auto-graded at submission is not announced", (await forUser(C.id, "exam.results_released")).length === 0);

  // B's attempt waited for a grader; releasing it is announced
  const attemptB = await prisma.examAttempt.create({ data: { examId: exam.id, userId: B.id, status: "SUBMITTED", submittedAt: new Date() } });
  await prisma.examAttempt.update({ where: { id: attemptB.id }, data: { status: "GRADED", gradedAt: new Date() } });
  check("grading without releasing notifies nobody", (await forUser(B.id, "exam.results_released")).length === 0);
  await prisma.examAttempt.update({ where: { id: attemptB.id }, data: { releasedAt: new Date() } });
  const resB = await forUser(B.id, "exam.results_released");
  check("releasing a graded attempt notifies the student", resB.length === 1 && pl(resB[0]).attemptId === attemptB.id && pl(resB[0]).examId === exam.id, resB.length);

  // ------------------------------------------------------------------
  section("Trigger: a certificate request is approved");
  const reviewA = await prisma.certificateReview.create({ data: { courseId, userId: A.id, status: "AUTO_ELIGIBLE" } });
  check("an automatic status notifies nobody", (await forUser(A.id, "certificate.approved")).length === 0);
  await prisma.certificateReview.update({ where: { id: reviewA.id }, data: { status: "APPROVED", decidedById: ins.id, decidedAt: new Date() } });
  check("approval notifies the student", (await forUser(A.id, "certificate.approved")).length === 1);
  await prisma.certificateReview.update({ where: { id: reviewA.id }, data: { needsReReview: true } });
  check("flagging for re-review does not notify again", (await forUser(A.id, "certificate.approved")).length === 1);
  await prisma.certificateReview.create({ data: { courseId, userId: B.id, status: "APPROVED", decidedById: ins.id, decidedAt: new Date() } });
  check("a review created already approved also notifies", (await forUser(B.id, "certificate.approved")).length === 1);

  // ------------------------------------------------------------------
  section("Reminders (limited to the throwaway course)");
  const qDue = await prisma.question.create({
    data: { courseId, lectureId: L3.id, type: "OPEN", body: "سؤال بموعد", points: 5, status: "PUBLISHED", dueAt: new Date(now.getTime() + 5 * HOUR) },
  });
  await prisma.questionSubmission.create({ data: { questionId: qDue.id, userId: B.id, answerText: "done" } }); // B already answered

  const first = await generateReminders(prisma, now, { courseIds: [courseId] });
  const lectureRemindersA = [...(await forUser(A.id, "lecture.upcoming_1h")), ...(await forUser(A.id, "lecture.upcoming_24h"))];
  const has = (type: string, lectureId: string) => lectureRemindersA.some((n) => n.type === type && pl(n).lectureId === lectureId);
  check("a lecture in 30 minutes gets the 1-hour reminder", has("lecture.upcoming_1h", L1.id));
  check("a lecture in 5 hours gets the 24-hour reminder", has("lecture.upcoming_24h", L2.id));
  check("a lecture in 3 days gets nothing yet", !lectureRemindersA.some((n) => pl(n).lectureId === L3.id));
  check("a lecture that already started gets nothing", !lectureRemindersA.some((n) => pl(n).lectureId === L0.id));
  check("the two windows do not overlap (one reminder per lecture here)", lectureRemindersA.length === 2, lectureRemindersA.length);
  check("a withdrawn student gets no reminder", (await prisma.notification.count({ where: { userId: C.id, type: { startsWith: "lecture.upcoming" } } })) === 0);

  check("an unanswered question due soon reminds A", (await forUser(A.id, "question.due_soon")).some((n) => pl(n).questionId === qDue.id));
  check("a student who already answered is not reminded (B)", (await forUser(B.id, "question.due_soon")).length === 0);
  check("a question with no deadline is never reminded", !(await forUser(A.id, "question.due_soon")).some((n) => pl(n).questionId === qWritten.id));
  check("a student with no attempt is told the exam closes soon (A)", (await forUser(A.id, "exam.closing_soon")).length === 1);
  check("a student who already submitted is not (B)", (await forUser(B.id, "exam.closing_soon")).length === 0);
  check("the first run created reminders", first.lectures1h > 0 && first.lectures24h > 0 && first.questionsDue > 0 && first.examsClosing > 0, JSON.stringify(first));

  const second = await generateReminders(prisma, now, { courseIds: [courseId] });
  check("running again creates nothing new (de-duplicated)", second.lectures1h + second.lectures24h + second.questionsDue + second.examsClosing === 0, JSON.stringify(second));

  // ------------------------------------------------------------------
  section("Wording: every notification renders in both languages");
  const allA = await prisma.notification.findMany({ where: { userId: A.id } });
  const contexts = await loadContexts(prisma, allA);
  let wordingOk = true;
  for (const n of allA) {
    for (const locale of ["ar", "en"]) {
      const v = buildView({ type: n.type, payload: n.payload, ctx: contexts.get(n.id) ?? {}, locale, timezone: "Africa/Tunis" });
      if (!v.title || v.title.includes("{") || v.body.includes("{") || !v.path) wordingOk = false;
    }
  }
  check(`all ${allA.length} of A's notifications render cleanly (title, body, link)`, wordingOk);
  // Exam results go to B in this scenario, so look across everyone the test created
  const everyone = await prisma.notification.findMany({ where: { userId: { in: [A.id, B.id, C.id, ins.id] } }, select: { type: true } });
  const seenTypes = new Set(everyone.map((n) => n.type));
  const missing = NOTIFICATION_TYPES.filter((t) => t !== "enrollment.confirmed" && !seenTypes.has(t));
  check("this test produced every type except the enrollment one", missing.length === 0, missing.join(", "));

  // ------------------------------------------------------------------
  section("Email delivery (fake sender)");
  await prisma.user.update({ where: { id: B.id }, data: { emailNotifications: false } });
  const sent: { to: string; subject: string; html: string }[] = [];
  const okSender: SendFn = async (mail) => {
    sent.push({ to: mail.to, subject: mail.subject, html: mail.html });
    return { ok: true };
  };
  const scope = [A.id, B.id, C.id, ins.id];

  const expectedEmails = allA.filter((n) => (EMAIL_TYPES as readonly string[]).includes(n.type)).length;
  const r1 = await deliverPendingEmails(prisma, { now, send: okSender, userIds: scope });
  check(`sent one email per emailable notification of A (${expectedEmails})`, r1.sent === expectedEmails && sent.length === expectedEmails, `sent=${r1.sent}`);
  check("every email went to A, none to B (who opted out)", sent.every((m) => m.to === A.email));
  check("no email has an unfilled placeholder", sent.every((m) => !m.subject.includes("{") && !m.html.includes("{course}")));
  check("in-app only types were not emailed", (await prisma.notification.count({ where: { userId: A.id, type: { in: ["question.published", "recording.added"] }, emailedAt: { not: null } } })) === 0);
  check("sent rows are marked as emailed", (await prisma.notification.count({ where: { userId: A.id, emailedAt: { not: null } } })) === expectedEmails);
  const r2 = await deliverPendingEmails(prisma, { now, send: okSender, userIds: scope });
  check("a second run sends nothing", r2.sent === 0);

  const stale = await prisma.notification.create({
    data: { userId: A.id, type: "lecture.upcoming_1h", payload: { courseId, lectureId: L0.id }, dedupeKey: `smoke-stale-${randomUUID()}` },
  });
  const r3 = await deliverPendingEmails(prisma, { now, send: okSender, userIds: scope });
  const staleRow = await prisma.notification.findUnique({ where: { id: stale.id } });
  check("a reminder for a lecture that already started is dropped, not sent", r3.dropped === 1 && r3.sent === 0 && staleRow?.emailError === "STALE");

  const flaky = await prisma.notification.create({
    data: { userId: A.id, type: "question.graded", payload: { courseId, lectureId: L3.id, questionId: qWritten.id }, dedupeKey: `smoke-flaky-${randomUUID()}` },
  });
  const attempts = async () => (await prisma.notification.findUnique({ where: { id: flaky.id } }))!;
  await deliverPendingEmails(prisma, { now, userIds: scope, send: async () => ({ ok: false, error: "HTTP 500", permanent: false, rateLimited: false }) });
  check("a temporary failure counts one attempt and keeps the email queued", (await attempts()).emailAttempts === 1 && (await attempts()).emailedAt === null);
  const rl = await deliverPendingEmails(prisma, { now, userIds: scope, send: async () => ({ ok: false, error: "HTTP 429", permanent: false, rateLimited: true }) });
  check("a rate-limit answer stops the run without using an attempt", rl.rateLimited && (await attempts()).emailAttempts === 1);
  await deliverPendingEmails(prisma, { now, userIds: scope, send: async () => ({ ok: false, error: "HTTP 422", permanent: true, rateLimited: false }) });
  check("a permanent failure gives up", (await attempts()).emailAttempts === 3);
  const after = await deliverPendingEmails(prisma, { now, send: okSender, userIds: scope });
  check("a given-up email is never retried", after.sent === 0);

  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  const unconfigured = await deliverPendingEmails(prisma, { userIds: scope });
  if (savedKey) process.env.RESEND_API_KEY = savedKey;
  if (savedFrom) process.env.EMAIL_FROM = savedFrom;
  check("without email settings nothing is sent and nothing breaks", unconfigured.configured === false && unconfigured.sent === 0);

  // ------------------------------------------------------------------
  section("Reading and marking as read");
  const listed = await listNotifications(prisma, { userId: A.id, page: 1, pageSize: 5 });
  check("the list is paged, newest first", listed.items.length === 5 && listed.total === listed.unread && listed.items[0].createdAt >= listed.items[4].createdAt);
  const target = listed.items[0].id;
  check("someone else cannot mark my notification as read", (await markRead(prisma, { userId: B.id, ids: [target] })).updated === 0 && (await prisma.notification.findUnique({ where: { id: target } }))?.readAt === null);
  check("I can mark one as read", (await markRead(prisma, { userId: A.id, ids: [target] })).updated === 1);
  check("marking it again changes nothing", (await markRead(prisma, { userId: A.id, ids: [target] })).updated === 0);
  const rest = await markRead(prisma, { userId: A.id, all: true });
  check("mark all read covers the rest", rest.updated === listed.total - 1 && (await listNotifications(prisma, { userId: A.id, page: 1, pageSize: 5 })).unread === 0, rest.updated);
  check("an empty request changes nothing", (await markRead(prisma, { userId: A.id })).updated === 0);

  // ------------------------------------------------------------------
  section("Retention");
  const old = (days: number, read: boolean) =>
    prisma.notification.create({
      data: {
        userId: A.id,
        type: "enrollment.confirmed",
        payload: { courseId },
        createdAt: new Date(now.getTime() - days * DAY),
        readAt: read ? new Date(now.getTime() - days * DAY) : null,
      },
    });
  const oldRead = await old(100, true);
  const oldUnread = await old(100, false);
  const ancient = await old(200, false);
  await purgeOldNotifications(prisma, now);
  const exists = async (id: string) => (await prisma.notification.findUnique({ where: { id } })) != null;
  check("a read notification older than 90 days is deleted", !(await exists(oldRead.id)));
  check("an unread notification of 100 days is kept", await exists(oldUnread.id));
  check("anything older than 180 days is deleted", !(await exists(ancient.id)));
}

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
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
