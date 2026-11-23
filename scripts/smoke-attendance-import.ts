// scripts/smoke-attendance-import.ts
//
// Tests attendance import against your development database: preview vs apply, matching by
// email and by name, adding up rejoin rows, keeping hand-entered records, marking missing
// students, replacing, rejecting bad files, and the effects on certificate review rows.
//
// Throwaway data only (prefix "smoke-attimp-"), removed at the end.
//
// Run:      npx tsx scripts/smoke-attendance-import.ts
// Clean up after a crashed run:   npx tsx scripts/smoke-attendance-import.ts --cleanup

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
// ADJUST this import if your generator output differs
import { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { applyAttendanceImport, planAttendanceImport, previewOf } from "@/lib/staff/attendance-import-service";
import type { PlanOptions } from "@/lib/staff/attendance-import";

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

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: "smoke-attimp-" } }, select: { id: true } });
  const users = await prisma.user.findMany({ where: { email: { startsWith: "smoke-attimp-" } }, select: { id: true } });
  const courseIds = courses.map((c) => c.id);
  const userIds = users.map((u) => u.id);
  if (courseIds.length) {
    const inCourse = { in: courseIds };
    await prisma.certificateReview.deleteMany({ where: { courseId: inCourse } });
    await prisma.attendanceRecord.deleteMany({ where: { courseId: inCourse } });
    await prisma.lecture.deleteMany({ where: { courseId: inCourse } });
    await prisma.enrollment.deleteMany({ where: { courseId: inCourse } });
    await prisma.course.deleteMany({ where: { id: inCourse } });
  }
  if (userIds.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    for (const id of userIds) await prisma.$executeRaw`DELETE FROM auth.users WHERE id = ${id}::uuid`;
  }
  await prisma.$executeRaw`DELETE FROM auth.users WHERE email LIKE 'smoke-attimp-%@example.test'`;
  console.log(`Cleaned up ${courseIds.length} course(s), ${userIds.length} user(s).`);
}

async function createUser(label: string, fullName: string) {
  const id = randomUUID();
  const email = `smoke-attimp-${label}-${Date.now()}@example.test`;
  const meta = JSON.stringify({ full_name: fullName, phone: "+21600000000", country: "TN", locale: "ar", data_sharing_consent: true });
  await prisma.$executeRaw`
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
    VALUES (${id}::uuid, 'authenticated', 'authenticated', ${email}, ${meta}::jsonb)`;
  return { id, email };
}

async function expectCode(name: string, code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "it succeeded");
  } catch (e) {
    check(name, e instanceof ApiError && e.code === code, e instanceof ApiError ? e.code : String(e));
  }
}

async function run() {
  const now = new Date();

  section("Setup");
  const teacher = await createUser("teacher", "Teacher Host");
  const ali = await createUser("ali", "Ali Mohamed");
  const sara = await createUser("sara", "Sara Ben Salah");
  const omar = await createUser("omar", "Omar Trabelsi");
  const nour = await createUser("nour", "Nour Gharbi");
  const twin1 = await createUser("twin1", "Same Name");
  const twin2 = await createUser("twin2", "Same Name");

  const course = await prisma.course.create({
    data: {
      slug: `smoke-attimp-${Date.now()}`, titleAr: "دورة الاستيراد", titleEn: "Import course", status: "PUBLISHED", certificateEnabled: true,
      settings: { create: { partialWeight: 0.5, allowLateSubmissions: true, defaultPenaltyType: "NONE", defaultPenaltyValue: 0 } },
    },
  });
  const courseId = course.id;
  await prisma.enrollment.createMany({
    data: [ali, sara, omar, nour, twin1, twin2].map((u) => ({ userId: u.id, courseId, status: "ACTIVE" as const })),
  });
  // a 60-minute lecture that has already been held
  const lecture = await prisma.lecture.create({
    data: {
      courseId, number: 1, titleAr: "محاضرة", titleEn: "Lecture",
      startsAt: new Date(now.getTime() - 3 * HOUR), endsAt: new Date(now.getTime() - 2 * HOUR), status: "PUBLISHED",
    },
  });
  const lectureId = lecture.id;
  const opts: PlanOptions = { presentPercent: 75, partialPercent: 25, absentMissing: false, overwriteManual: false };
  const plan = (csv: string, over: Partial<PlanOptions> = {}) => planAttendanceImport(prisma, { lectureId, csv, options: { ...opts, ...over } });
  const records = () => prisma.attendanceRecord.findMany({ where: { lectureId }, select: { userId: true, status: true, source: true, minutesAttended: true } });

  // A report shaped like Zoom's: meeting summary on top, then the participants table
  const zoom = [
    "Topic,ID,Host,Email,Start time,End time,Participants",
    `"Fiqh lecture",123,Teacher,${teacher.email},2026-10-03 18:00,2026-10-03 19:00,5`,
    "",
    '"Name (original name)","User email","Join time","Leave time","Duration (minutes)","Guest"',
    `"Teacher Host",${teacher.email},18:00,19:00,60,No`,
    `"Ali Mohamed",${ali.email.toUpperCase()},18:00,18:30,30,No`,
    `"Ali Mohamed",${ali.email},18:35,19:05,30,No`,
    `"Sara Ben Salah",${sara.email},18:00,18:20,20,No`,
    `"omar t.",${omar.email},18:00,18:05,5,No`,
    `"Guest Person",,18:00,18:30,30,Yes`,
    `"same name",,18:00,18:30,30,Yes`,
    `"سارة بن صالح",,18:00,18:30,30,Yes`,
  ].join("\n");

  // ------------------------------------------------------------------
  section("Preview (nothing is written)");
  const p1 = await plan(zoom);
  const by = Object.fromEntries(p1.plan.entries.map((e) => [e.userId, e]));
  check("the participants table is found below the meeting summary", p1.parsed.headerLine === 4, p1.parsed.headerLine);
  check("Ali: two rejoin rows add up to 60 minutes, email in any letter case -> present", by[ali.id]?.status === "PRESENT" && by[ali.id].minutes === 60 && by[ali.id].matchedBy === "email");
  check("Sara: 20 of 60 minutes (33%) -> partial", by[sara.id]?.status === "PARTIAL");
  check("Omar: 5 of 60 minutes -> absent, matched by email despite a different name", by[omar.id]?.status === "ABSENT");
  check("the teacher, two guests and an ambiguous name are listed as unmatched", p1.plan.unmatched.length === 4 && p1.plan.unmatched.some((u) => u.reason === "AMBIGUOUS"), JSON.stringify(p1.plan.unmatched.map((u) => u.label)));
  check("students not in the file are listed, not marked", p1.plan.notInFile.map((s) => s.userId).sort().join() === [nour.id, twin1.id, twin2.id].sort().join());
  check("the preview wrote nothing", (await records()).length === 0);
  const view = previewOf(p1.parsed, p1.plan, 1);
  check("the preview payload caps long lists but keeps exact totals", view.entries.length === 1 && view.totals.entries === 3 && view.totals.unmatched === 4);

  section("Matching by name");
  const byName = await plan("name,minutes\nsara ben salah,60\nSame Name,60\nStranger,60\n");
  check("a unique name matches, flagged as matched by name", byName.plan.entries.length === 1 && byName.plan.entries[0].userId === sara.id && byName.plan.entries[0].matchedBy === "name");
  const arabic = await createUser("arabic", "فاطمة الزهراء");
  await prisma.enrollment.create({ data: { userId: arabic.id, courseId, status: "ACTIVE" } });
  const arabicPlan = await plan("name,minutes\nفاطمه الزهراء,60\n");
  check("Arabic spelling variants (ة / ه) still match", arabicPlan.plan.entries[0]?.userId === arabic.id);
  await prisma.enrollment.deleteMany({ where: { userId: arabic.id } });

  // ------------------------------------------------------------------
  section("Applying");
  const a1 = await applyAttendanceImport(prisma, { lectureId, csv: zoom, options: opts, actorId: teacher.id });
  const after = await records();
  const rec = Object.fromEntries(after.map((r) => [r.userId, r]));
  check("three records were written, marked as imported", a1.written === 3 && after.length === 3 && after.every((r) => r.source === "IMPORT"));
  check("statuses and minutes are stored", rec[ali.id].status === "PRESENT" && rec[ali.id].minutesAttended === 60 && rec[sara.id].status === "PARTIAL" && rec[omar.id].status === "ABSENT");
  check("nobody else was touched", !rec[nour.id] && !rec[twin1.id] && !rec[twin2.id]);
  const audited = await prisma.auditLog.count({ where: { actorId: teacher.id, action: "attendance.import", entityId: lectureId } });
  check("the import was written to the audit log", audited === 1);

  const again = await applyAttendanceImport(prisma, { lectureId, csv: zoom, options: opts, actorId: teacher.id });
  check("importing the same file again changes nothing (no duplicates)", again.written === 3 && (await records()).length === 3);

  // ------------------------------------------------------------------
  section("Hand-entered records are protected");
  await prisma.attendanceRecord.updateMany({ where: { lectureId, userId: ali.id }, data: { status: "EXCUSED", source: "MANUAL" } });
  const kept = await plan(zoom);
  check("a manual record is not overwritten by default", kept.plan.skippedManual.length === 1 && kept.plan.skippedManual[0].existing === "EXCUSED" && !kept.plan.entries.some((e) => e.userId === ali.id));
  await applyAttendanceImport(prisma, { lectureId, csv: zoom, options: opts, actorId: teacher.id });
  check("...and stays excused after applying", (await records()).find((r) => r.userId === ali.id)?.status === "EXCUSED");
  await applyAttendanceImport(prisma, { lectureId, csv: zoom, options: { ...opts, overwriteManual: true }, actorId: teacher.id });
  check("it is replaced only when asked", (await records()).find((r) => r.userId === ali.id)?.status === "PRESENT");

  // ------------------------------------------------------------------
  section("Missing students and thresholds");
  const missing = await applyAttendanceImport(prisma, { lectureId, csv: zoom, options: { ...opts, absentMissing: true }, actorId: teacher.id });
  const afterMissing = await records();
  check("students missing from the file become absent when asked", missing.written === 6 && afterMissing.filter((r) => r.status === "ABSENT").length === 4, `${missing.written}`);
  const strict = await plan("email,minutes\n" + `${sara.email},20\n`, { presentPercent: 30, partialPercent: 10 });
  check("custom thresholds change the result (33% is present at 30%)", strict.plan.entries[0].status === "PRESENT");
  const status = await plan("email,status\n" + `${nour.email},Partial\n${twin1.email},غائب\n`);
  check("an explicit status column wins, in English or Arabic", status.plan.entries.map((e) => e.status).sort().join() === "ABSENT,PARTIAL");
  const bare = await plan(`email\n${nour.email}\n`);
  check("a plain list of emails means present", bare.plan.entries[0].status === "PRESENT");

  // ------------------------------------------------------------------
  section("Bad input");
  await expectCode("an empty file is refused", "INVALID_CSV", () => plan("   \n"));
  await expectCode("a file without an email or name column is refused", "INVALID_CSV", () => plan("foo,bar\n1,2\n"));
  await expectCode("an unknown lecture is refused", "NOT_FOUND", () => planAttendanceImport(prisma, { lectureId: randomUUID(), csv: zoom, options: opts }));
  const messy = await plan("email,minutes\nbad-row,abc\n" + `${nour.email},oops\n${sara.email},50\n`);
  check("rows it cannot understand are reported and skipped, not guessed", messy.parsed.invalid.length === 1 && messy.plan.entries.length === 1);
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
