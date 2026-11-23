// lib/staff/attendance-import-service.ts
// Import attendance from a file, in two steps that share one code path:
//   preview (dryRun)  -> the plan, nothing is written
//   apply             -> the SAME plan is rebuilt on the server and written in one transaction
// The browser never sends "entries": it sends the file and the options, and the server decides.
// Records written here are marked source = IMPORT.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "../api/errors";
import {
  AttendanceCsvError,
  buildPlan,
  parseAttendanceCsv,
  type ExistingRecord,
  type ImportPlan,
  type ParsedCsv,
  type PlanOptions,
} from "./attendance-import";
import { audit, inTx, safeSync } from "./common";

type Db = PrismaClient | Prisma.TransactionClient;

export async function planAttendanceImport(db: Db, args: { lectureId: string; csv: string; options: PlanOptions }) {
  const lecture = await db.lecture.findFirst({
    where: { id: args.lectureId, deletedAt: null },
    select: { courseId: true, startsAt: true, endsAt: true },
  });
  if (!lecture) throw new ApiError(404, "NOT_FOUND");

  let parsed: ParsedCsv;
  try {
    parsed = parseAttendanceCsv(args.csv);
  } catch (e) {
    if (e instanceof AttendanceCsvError) throw new ApiError(422, "INVALID_CSV", e.code);
    throw e;
  }

  const [enrolled, records] = await Promise.all([
    db.enrollment.findMany({
      where: { courseId: lecture.courseId, status: "ACTIVE" },
      select: { userId: true, user: { select: { email: true, fullName: true } } },
    }),
    db.attendanceRecord.findMany({ where: { lectureId: args.lectureId }, select: { userId: true, status: true, source: true } }),
  ]);

  const students = enrolled.map((e) => ({ userId: e.userId, email: e.user.email, fullName: e.user.fullName }));
  const existing = new Map<string, ExistingRecord>(records.map((r) => [r.userId, { status: r.status, source: r.source }]));
  const lectureMinutes = Math.max(1, Math.round((lecture.endsAt.getTime() - lecture.startsAt.getTime()) / 60_000));

  return { courseId: lecture.courseId, parsed, plan: buildPlan({ parsed, lectureMinutes, students, existing, options: args.options }) };
}

/** What the preview screen shows. Long lists are cut (the totals are always exact). */
export function previewOf(parsed: ParsedCsv, plan: ImportPlan, cap = 300) {
  return {
    headerLine: parsed.headerLine,
    columns: parsed.columns,
    rowsRead: parsed.rows.length,
    invalid: parsed.invalid.slice(0, 20),
    invalidTotal: parsed.invalid.length,
    lectureMinutes: plan.lectureMinutes,
    counts: plan.counts,
    totals: {
      entries: plan.entries.length,
      unmatched: plan.unmatched.length,
      notInFile: plan.notInFile.length,
      skippedManual: plan.skippedManual.length,
    },
    entries: plan.entries.slice(0, cap),
    unmatched: plan.unmatched.slice(0, cap),
    notInFile: plan.notInFile.slice(0, cap),
    skippedManual: plan.skippedManual.slice(0, cap),
  };
}

export async function applyAttendanceImport(
  db: PrismaClient,
  args: { lectureId: string; csv: string; options: PlanOptions; actorId: string },
) {
  const { lectureId, actorId } = args;

  const result = await inTx(db, async (tx) => {
    // Planned inside the transaction, so it reflects the records as they are right now
    const { courseId, parsed, plan } = await planAttendanceImport(tx, args);
    const userIds = plan.entries.map((e) => e.userId);

    if (userIds.length > 0) {
      await tx.attendanceRecord.deleteMany({ where: { lectureId, userId: { in: userIds } } });
      await tx.attendanceRecord.createMany({
        data: plan.entries.map((e) => ({
          courseId,
          lectureId,
          userId: e.userId,
          status: e.status,
          source: "IMPORT" as const,
          minutesAttended: e.minutes != null ? Math.round(e.minutes) : null,
          recordedById: actorId,
        })),
      });
    }

    await audit(tx, {
      actorId,
      action: "attendance.import",
      entityType: "Lecture",
      entityId: lectureId,
      metadata: {
        written: userIds.length,
        rowsRead: parsed.rows.length,
        unmatched: plan.unmatched.length,
        skippedManual: plan.skippedManual.length,
        markedMissingAbsent: plan.entries.filter((e) => e.matchedBy === "missing").length,
        options: args.options,
      },
    });
    return { courseId, userIds, plan };
  });

  // Certificate eligibility follows attendance
  await safeSync(db, result.courseId, result.userIds);

  return {
    written: result.userIds.length,
    counts: result.plan.counts,
    unmatched: result.plan.unmatched.length,
    skippedManual: result.plan.skippedManual.length,
  };
}
