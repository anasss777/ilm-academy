// lib/staff/courses.ts
// Course management. No permission checks here: routes verify course.create / course.edit /
// course.publish / course.archive before calling. Every change is audit-logged.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GradingError, normalizePenalty, type PenaltyType } from "../grading/grading";
import type {
  CourseContentInput,
  CourseSettingsInput,
  CreateCourseInput,
  UpdateCourseInput,
} from "../validation/staff";
import { isStoragePathForCourse } from "../storage/rules";
import { audit, inTx, isUniqueViolation, normalizeFields, safeSync } from "./common";
import { assertValidSlug, nextCourseStatus, publishReadiness, type CourseAction } from "./rules";

/** Toggles that change what counts toward certificates */
const ELIGIBILITY_TOGGLES = ["attendanceEnabled", "questionsEnabled", "examEnabled", "certificateEnabled"];

export async function createCourse(db: PrismaClient, args: { input: CreateCourseInput; actorId: string }) {
  const { input, actorId } = args;
  const slug = assertValidSlug(input.slug);
  const { instructorIds, slug: _slug, ...fields } = input;
  if (input.coverImagePath?.trim()) {
    throw new GradingError("INVALID_URL", "Upload the cover after the course has been created");
  }
  // The creator teaches the course unless told otherwise
  const instructors = [...new Set(instructorIds ?? [actorId])];

  try {
    return await inTx(db, async (tx) => {
      const found = await tx.user.count({ where: { id: { in: instructors }, deletedAt: null } });
      if (found !== instructors.length) throw new GradingError("NOT_FOUND", "Unknown instructor");

      const course = await tx.course.create({
        data: {
          ...(normalizeFields(fields) as Partial<Prisma.CourseUncheckedCreateInput>),
          slug,
          titleAr: input.titleAr.trim(),
          status: "DRAFT",
          settings: { create: {} },
          instructors: { create: instructors.map((userId, i) => ({ userId, displayOrder: i })) },
        },
        select: { id: true, slug: true, status: true },
      });
      await audit(tx, {
        actorId, action: "course.create", entityType: "Course", entityId: course.id,
        metadata: { slug: course.slug, instructors },
      });
      return course;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new GradingError("SLUG_TAKEN");
    throw e;
  }
}

export async function updateCourse(
  db: PrismaClient,
  args: { courseId: string; input: UpdateCourseInput; actorId: string },
) {
  const { courseId, input, actorId } = args;
  const { slug: newSlug, ...fields } = input;
  const data = normalizeFields(fields) as Prisma.CourseUncheckedUpdateInput;
  if (typeof data.coverImagePath === "string" && !isStoragePathForCourse("cover", data.coverImagePath, courseId)) {
    throw new GradingError("INVALID_URL", "Set the cover through the cover upload endpoint");
  }

  try {
    const updated = await inTx(db, async (tx) => {
      const course = await tx.course.findUnique({
        where: { id: courseId },
        select: { id: true, slug: true, status: true },
      });
      if (!course) throw new GradingError("NOT_FOUND");

      if (newSlug !== undefined) {
        const slug = assertValidSlug(newSlug);
        if (slug !== course.slug) {
          // Public links and emails already point at the old one
          if (course.status !== "DRAFT") throw new GradingError("SLUG_LOCKED");
          data.slug = slug;
        }
      }
      if (Object.keys(data).length === 0) return course;

      const row = await tx.course.update({
        where: { id: courseId },
        data,
        select: { id: true, slug: true, status: true },
      });
      await audit(tx, {
        actorId, action: "course.update", entityType: "Course", entityId: courseId,
        metadata: { fields: Object.keys(data) },
      });
      return row;
    });
    if (ELIGIBILITY_TOGGLES.some((k) => k in data)) await safeSync(db, courseId);
    return updated;
  } catch (e) {
    if (isUniqueViolation(e)) throw new GradingError("SLUG_TAKEN");
    throw e;
  }
}

export async function updateCourseSettings(
  db: PrismaClient,
  args: { courseId: string; input: CourseSettingsInput; actorId: string },
) {
  const { courseId, input, actorId } = args;

  await inTx(db, async (tx) => {
    const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new GradingError("NOT_FOUND");

    if (input.partialWeight !== undefined && !(input.partialWeight >= 0 && input.partialWeight <= 1)) {
      throw new GradingError("INVALID_SETTINGS", "partialWeight must be between 0 and 1");
    }
    // The penalty type and value must make sense together, including the one not being changed
    if (input.defaultPenaltyType !== undefined || input.defaultPenaltyValue !== undefined) {
      const existing = await tx.courseSettings.findUnique({ where: { courseId } });
      normalizePenalty(
        (input.defaultPenaltyType ?? existing?.defaultPenaltyType ?? "NONE") as PenaltyType,
        input.defaultPenaltyValue ?? (existing ? Number(existing.defaultPenaltyValue) : 0),
      );
    }

    await tx.courseSettings.upsert({
      where: { courseId },
      create: { courseId, ...input },
      update: input,
    });
    await audit(tx, {
      actorId, action: "course.settings", entityType: "Course", entityId: courseId,
      metadata: { fields: Object.keys(input) },
    });
  });

  // Partial credit changes every student's attendance percentage
  if (input.partialWeight !== undefined) await safeSync(db, courseId);
  return { courseId };
}

/** Replace the learning objectives and/or FAQ list wholesale (order = array order). */
export async function replaceCourseContent(
  db: PrismaClient,
  args: { courseId: string; input: CourseContentInput; actorId: string },
) {
  const { courseId, input, actorId } = args;
  return inTx(db, async (tx) => {
    const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new GradingError("NOT_FOUND");

    if (input.objectives) {
      await tx.courseObjective.deleteMany({ where: { courseId } });
      if (input.objectives.length) {
        await tx.courseObjective.createMany({
          data: input.objectives.map((o, position) => ({
            courseId, position, textAr: o.textAr, textEn: o.textEn?.trim() || null,
          })),
        });
      }
    }
    if (input.faqs) {
      await tx.courseFaq.deleteMany({ where: { courseId } });
      if (input.faqs.length) {
        await tx.courseFaq.createMany({
          data: input.faqs.map((f, position) => ({
            courseId, position, questionAr: f.questionAr, questionEn: f.questionEn?.trim() || null,
            answerAr: f.answerAr, answerEn: f.answerEn?.trim() || null,
          })),
        });
      }
    }
    await audit(tx, {
      actorId, action: "course.content", entityType: "Course", entityId: courseId,
      metadata: { objectives: input.objectives?.length ?? null, faqs: input.faqs?.length ?? null },
    });
    return { objectives: input.objectives?.length, faqs: input.faqs?.length };
  });
}

export async function setCourseInstructors(
  db: PrismaClient,
  args: { courseId: string; userIds: string[]; actorId: string },
) {
  const { courseId, actorId } = args;
  const userIds = [...new Set(args.userIds)];

  return inTx(db, async (tx) => {
    const course = await tx.course.findUnique({ where: { id: courseId }, select: { status: true } });
    if (!course) throw new GradingError("NOT_FOUND");
    // A public course must always have someone teaching it
    if (course.status === "PUBLISHED" && userIds.length === 0) {
      throw new GradingError("COURSE_NOT_READY", "instructor");
    }
    const found = await tx.user.count({ where: { id: { in: userIds }, deletedAt: null } });
    if (found !== userIds.length) throw new GradingError("NOT_FOUND", "Unknown instructor");

    await tx.courseInstructor.deleteMany({ where: { courseId } });
    if (userIds.length) {
      await tx.courseInstructor.createMany({
        data: userIds.map((userId, displayOrder) => ({ courseId, userId, displayOrder })),
      });
    }
    await audit(tx, {
      actorId, action: "course.instructors", entityType: "Course", entityId: courseId,
      metadata: { userIds },
    });
    return { userIds };
  });
}

/** publish / unpublish / archive / unarchive, with the readiness and enrollment checks. */
export async function transitionCourse(
  db: PrismaClient,
  args: { courseId: string; action: CourseAction; actorId: string },
) {
  const { courseId, action, actorId } = args;

  return inTx(db, async (tx) => {
    const course = await tx.course.findUnique({
      where: { id: courseId },
      select: {
        status: true, titleAr: true, shortDescAr: true, descriptionAr: true,
        certificateEnabled: true, publishedAt: true,
      },
    });
    if (!course) throw new GradingError("NOT_FOUND");

    const activeEnrollments = await tx.enrollment.count({ where: { courseId, status: "ACTIVE" } });
    const to = nextCourseStatus({ from: course.status, action, activeEnrollments });

    if (to === "PUBLISHED") {
      const instructorCount = await tx.courseInstructor.count({ where: { courseId } });
      const requirements = await tx.certificateRequirement.count({ where: { courseId, isCurrent: true } });
      const missing = publishReadiness({
        ...course,
        instructorCount,
        hasCertificateRequirement: requirements > 0,
      });
      if (missing.length > 0) throw new GradingError("COURSE_NOT_READY", missing.join(","));
    }

    const updated = await tx.course.update({
      where: { id: courseId },
      data: {
        status: to,
        publishedAt: to === "PUBLISHED" && !course.publishedAt ? new Date() : undefined,
      },
      select: { id: true, slug: true, status: true, publishedAt: true },
    });
    await audit(tx, {
      actorId, action: `course.${action}`, entityType: "Course", entityId: courseId,
      metadata: { from: course.status, to },
    });
    return updated;
  });
}
