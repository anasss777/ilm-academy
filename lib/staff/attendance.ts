// lib/staff/attendance.ts
// Manual attendance entry. Routes verify attendance.view / attendance.edit first.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GradingError } from "../grading/grading";
import { audit, inTx, safeSync } from "./common";
import { validateAttendanceEntries, type AttendanceEntryInput } from "./rules";

/** The class list for one lecture: every ACTIVE student with their recorded status (or null). */
export async function listRoster(
  db: PrismaClient,
  args: { lectureId: string; q?: string; page: number; pageSize: number },
) {
  const { lectureId, q, page, pageSize } = args;
  const lecture = await db.lecture.findFirst({
    where: { id: lectureId, deletedAt: null },
    select: { id: true, courseId: true, number: true, titleAr: true, titleEn: true, startsAt: true, endsAt: true },
  });
  if (!lecture) throw new GradingError("NOT_FOUND");

  const ci = "insensitive" as const;
  const where = {
    courseId: lecture.courseId,
    status: "ACTIVE" as const,
    ...(q ? { user: { OR: [{ fullName: { contains: q, mode: ci } }, { email: { contains: q, mode: ci } }] } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.enrollment.count({ where }),
    db.enrollment.findMany({
      where,
      orderBy: { user: { fullName: "asc" } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { userId: true, user: { select: { fullName: true, email: true } } },
    }),
  ]);

  const records = rows.length
    ? await db.attendanceRecord.findMany({
        where: { lectureId, userId: { in: rows.map((r) => r.userId) } },
        select: { userId: true, status: true, minutesAttended: true, note: true },
      })
    : [];
  const byUser = new Map(records.map((r) => [r.userId, r]));

  return {
    lecture,
    total,
    page,
    pageSize,
    items: rows.map((r) => {
      const rec = byUser.get(r.userId);
      return {
        userId: r.userId,
        fullName: r.user.fullName,
        email: r.user.email,
        status: rec?.status ?? null, // null = not recorded yet
        minutesAttended: rec?.minutesAttended ?? null,
        note: rec?.note ?? null,
      };
    }),
  };
}

/**
 * Save attendance for many students at once. Entries replace what was there for those students;
 * `status: null` clears a record. Students not in the batch are untouched.
 */
export async function saveAttendance(
  db: PrismaClient,
  args: { lectureId: string; entries: AttendanceEntryInput[]; actorId: string },
) {
  const { lectureId, entries, actorId } = args;
  const userIds = entries.map((e) => e.userId);

  const courseId = await inTx(db, async (tx) => {
    const lecture = await tx.lecture.findFirst({
      where: { id: lectureId, deletedAt: null },
      select: { courseId: true },
    });
    if (!lecture) throw new GradingError("NOT_FOUND");

    const active = await tx.enrollment.findMany({
      where: { courseId: lecture.courseId, status: "ACTIVE", userId: { in: userIds } },
      select: { userId: true },
    });
    validateAttendanceEntries(entries, new Set(active.map((a) => a.userId)));

    // Two statements for the whole class instead of one upsert per student
    await tx.attendanceRecord.deleteMany({ where: { lectureId, userId: { in: userIds } } });
    const rows = entries
      .filter((e) => e.status !== null)
      .map((e) => ({
        courseId: lecture.courseId,
        lectureId,
        userId: e.userId,
        status: e.status!,
        source: "MANUAL" as const,
        minutesAttended: e.minutesAttended ?? null,
        note: e.note?.trim() || null,
        recordedById: actorId,
      }));
    if (rows.length) await tx.attendanceRecord.createMany({ data: rows });

    await audit(tx, {
      actorId, action: "attendance.save", entityType: "Lecture", entityId: lectureId,
      metadata: { set: rows.length, cleared: entries.length - rows.length },
    });
    return lecture.courseId;
  });

  await safeSync(db, courseId, userIds);
  const set = entries.filter((e) => e.status !== null).length;
  return { set, cleared: entries.length - set };
}
