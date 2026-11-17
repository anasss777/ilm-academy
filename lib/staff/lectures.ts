// lib/staff/lectures.ts
// Lecture management. Routes verify lecture.create / lecture.edit / lecture.delete first.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GradingError } from "../grading/grading";
import type { CreateLectureInput, UpdateLectureInput } from "../validation/staff";
import { audit, inTx, isUniqueViolation, normalizeFields, safeSync, validTimezone } from "./common";
import { validateExternalUrl } from "./rules";

/** Which lectures count as "held" for attendance maths: published and already ended. */
const countsAsHeld = (l: { status: string; endsAt: Date }, now: Date) =>
  l.status === "PUBLISHED" && l.endsAt.getTime() <= now.getTime();

function checkTimes(startsAt: Date, endsAt: Date, timezone: string) {
  if (!(endsAt.getTime() > startsAt.getTime())) throw new GradingError("INVALID_DATE", "endsAt must be after startsAt");
  if (!validTimezone(timezone)) throw new GradingError("INVALID_DATE", "Unknown timezone");
}

/** undefined = untouched, blank/null = cleared, otherwise a validated https link. */
function zoomUrlValue(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  return raw?.trim() ? validateExternalUrl("OTHER", raw) : null;
}

export async function createLecture(
  db: PrismaClient,
  args: { courseId: string; input: CreateLectureInput; actorId: string; now?: Date },
) {
  const { courseId, input, actorId } = args;
  const now = args.now ?? new Date();
  const timezone = input.timezone ?? "UTC";
  checkTimes(input.startsAt, input.endsAt, timezone);
  const zoomUrl = zoomUrlValue(input.zoomUrl);

  try {
    const lecture = await inTx(db, async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true } });
      if (!course) throw new GradingError("NOT_FOUND");

      const number =
        input.number ??
        ((await tx.lecture.aggregate({ where: { courseId, deletedAt: null }, _max: { number: true } }))._max.number ?? 0) + 1;

      const row = await tx.lecture.create({
        data: {
          courseId,
          number,
          titleAr: input.titleAr.trim(),
          ...(normalizeFields({
            titleEn: input.titleEn, descriptionAr: input.descriptionAr, descriptionEn: input.descriptionEn,
            zoomMeetingId: input.zoomMeetingId, zoomPassword: input.zoomPassword,
          }) as Partial<Prisma.LectureUncheckedCreateInput>),
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timezone,
          zoomUrl: zoomUrl ?? null,
          status: input.status ?? "DRAFT",
        },
        select: { id: true, number: true, status: true, endsAt: true },
      });
      await audit(tx, {
        actorId, action: "lecture.create", entityType: "Lecture", entityId: row.id,
        metadata: { courseId, number },
      });
      return row;
    });
    if (countsAsHeld(lecture, now)) await safeSync(db, courseId);
    return { id: lecture.id, number: lecture.number, status: lecture.status };
  } catch (e) {
    if (isUniqueViolation(e)) throw new GradingError("LECTURE_NUMBER_TAKEN");
    throw e;
  }
}

export async function updateLecture(
  db: PrismaClient,
  args: { lectureId: string; input: UpdateLectureInput; actorId: string; now?: Date },
) {
  const { lectureId, input, actorId } = args;
  const now = args.now ?? new Date();
  const { zoomUrl: rawZoom, number, startsAt, endsAt, status, timezone, ...text } = input;

  try {
    const result = await inTx(db, async (tx) => {
      const existing = await tx.lecture.findFirst({
        where: { id: lectureId, deletedAt: null },
        select: { courseId: true, startsAt: true, endsAt: true, timezone: true, status: true },
      });
      if (!existing) throw new GradingError("NOT_FOUND");

      const nextStarts = startsAt ?? existing.startsAt;
      const nextEnds = endsAt ?? existing.endsAt;
      checkTimes(nextStarts, nextEnds, timezone ?? existing.timezone);

      const data = {
        ...normalizeFields(text),
        ...(number !== undefined ? { number } : {}),
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {}),
        ...(status ? { status } : {}),
        ...(timezone ? { timezone } : {}),
      } as Prisma.LectureUncheckedUpdateInput;
      const zoomUrl = zoomUrlValue(rawZoom);
      if (zoomUrl !== undefined) data.zoomUrl = zoomUrl;

      const row = await tx.lecture.update({
        where: { id: lectureId },
        data,
        select: { id: true, number: true, status: true, endsAt: true },
      });
      await audit(tx, {
        actorId, action: "lecture.update", entityType: "Lecture", entityId: lectureId,
        metadata: { fields: Object.keys(data) },
      });
      return { row, courseId: existing.courseId, wasHeld: countsAsHeld(existing, now) };
    });

    // Publishing, unpublishing or moving a lecture across "now" changes the attendance denominator
    if (result.wasHeld || countsAsHeld(result.row, now)) await safeSync(db, result.courseId);
    return { id: result.row.id, number: result.row.number, status: result.row.status };
  } catch (e) {
    if (isUniqueViolation(e)) throw new GradingError("LECTURE_NUMBER_TAKEN");
    throw e;
  }
}

/** Soft delete: attendance, questions and submissions stay in the database; the number is freed. */
export async function deleteLecture(
  db: PrismaClient,
  args: { lectureId: string; actorId: string; now?: Date },
) {
  const { lectureId, actorId } = args;
  const now = args.now ?? new Date();

  const { courseId, wasHeld } = await inTx(db, async (tx) => {
    const existing = await tx.lecture.findFirst({
      where: { id: lectureId, deletedAt: null },
      select: { courseId: true, status: true, endsAt: true, number: true },
    });
    if (!existing) throw new GradingError("NOT_FOUND");
    await tx.lecture.update({ where: { id: lectureId }, data: { deletedAt: now } });
    await audit(tx, {
      actorId, action: "lecture.delete", entityType: "Lecture", entityId: lectureId,
      metadata: { courseId: existing.courseId, number: existing.number },
    });
    return { courseId: existing.courseId, wasHeld: countsAsHeld(existing, now) };
  });

  if (wasHeld) await safeSync(db, courseId);
  return { id: lectureId };
}
