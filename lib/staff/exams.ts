// lib/staff/exams.ts
// Authoring the final exam. Routes verify exam.create / exam.edit first.
// A course has at most one exam (the loaders assume it).

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GradingError } from "../grading/grading";
import type { CreateExamInput, UpdateExamInput } from "../validation/staff";
import { audit, inTx, normalizeFields, safeSync } from "./common";

const examSelect = {
  id: true, courseId: true, titleAr: true, titleEn: true, descriptionAr: true, descriptionEn: true,
  opensAt: true, dueAt: true, passingPercent: true, attemptLimit: true, durationMinutes: true, status: true,
};

const toDto = (e: {
  id: string; courseId: string; titleAr: string; titleEn: string | null; descriptionAr: string | null;
  descriptionEn: string | null; opensAt: Date | null; dueAt: Date | null;
  passingPercent: { toNumber(): number }; attemptLimit: number; durationMinutes: number | null; status: string;
}) => ({ ...e, passingPercent: e.passingPercent.toNumber() });

export async function createExam(
  db: PrismaClient,
  args: { courseId: string; input: CreateExamInput; actorId: string },
) {
  const { courseId, input, actorId } = args;

  return inTx(db, async (tx) => {
    const course = await tx.course.findUnique({ where: { id: courseId }, select: { examEnabled: true } });
    if (!course) throw new GradingError("NOT_FOUND");
    if (!course.examEnabled) throw new GradingError("COURSE_FEATURE_DISABLED", "Enable the exam for this course first");

    const existing = await tx.exam.count({ where: { courseId, deletedAt: null } });
    if (existing > 0) throw new GradingError("EXAM_EXISTS");

    const exam = await tx.exam.create({
      data: {
        courseId,
        ...(normalizeFields({
          titleAr: input.titleAr, titleEn: input.titleEn,
          descriptionAr: input.descriptionAr, descriptionEn: input.descriptionEn,
        }) as Partial<Prisma.ExamUncheckedCreateInput>),
        titleAr: input.titleAr.trim(),
        opensAt: input.opensAt ?? null,
        dueAt: input.dueAt ?? null,
        ...(input.passingPercent !== undefined ? { passingPercent: input.passingPercent } : {}),
        ...(input.attemptLimit !== undefined ? { attemptLimit: input.attemptLimit } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        status: "DRAFT", // publish only after questions exist
      },
      select: examSelect,
    });
    await audit(tx, { actorId, action: "exam.create", entityType: "Exam", entityId: exam.id, metadata: { courseId } });
    return toDto(exam);
  });
}

export async function updateExam(
  db: PrismaClient,
  args: { examId: string; input: UpdateExamInput; actorId: string },
) {
  const { examId, input, actorId } = args;
  const { status, passingPercent, attemptLimit, durationMinutes, opensAt, dueAt, ...text } = input;

  const { exam, courseId } = await inTx(db, async (tx) => {
    const existing = await tx.exam.findFirst({
      where: { id: examId, deletedAt: null },
      select: { courseId: true, opensAt: true, dueAt: true },
    });
    if (!existing) throw new GradingError("NOT_FOUND");

    const nextOpens = opensAt !== undefined ? opensAt : existing.opensAt;
    const nextDue = dueAt !== undefined ? dueAt : existing.dueAt;
    if (nextOpens && nextDue && nextDue.getTime() <= nextOpens.getTime()) {
      throw new GradingError("INVALID_DATE", "dueAt must be after opensAt");
    }

    if (status === "PUBLISHED") {
      const questions = await tx.question.count({
        where: { examId, deletedAt: null, status: "PUBLISHED" },
      });
      if (questions === 0) throw new GradingError("EXAM_NOT_READY", "Publish at least one question first");
    }

    const data = {
      ...normalizeFields(text),
      ...(opensAt !== undefined ? { opensAt } : {}),
      ...(dueAt !== undefined ? { dueAt } : {}),
      ...(passingPercent !== undefined ? { passingPercent } : {}),
      ...(attemptLimit !== undefined ? { attemptLimit } : {}),
      // changes apply to attempts started AFTER this; running attempts keep the end they were given
      ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      ...(status !== undefined ? { status } : {}),
    } as Prisma.ExamUncheckedUpdateInput;

    const row = await tx.exam.update({ where: { id: examId }, data, select: examSelect });
    await audit(tx, {
      actorId, action: "exam.update", entityType: "Exam", entityId: examId,
      metadata: { fields: Object.keys(data) },
    });
    return { exam: toDto(row), courseId: existing.courseId };
  });

  // Publishing or unpublishing changes whether the exam counts toward certificates
  if (status !== undefined) await safeSync(db, courseId);
  return exam;
}

/** Soft delete, only while nobody has attempted it. After that, set it back to DRAFT instead. */
export async function deleteExam(db: PrismaClient, args: { examId: string; actorId: string }) {
  const courseId = await inTx(db, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { id: args.examId, deletedAt: null },
      select: { courseId: true },
    });
    if (!exam) throw new GradingError("NOT_FOUND");
    const attempts = await tx.examAttempt.count({ where: { examId: args.examId } });
    if (attempts > 0) throw new GradingError("EXAM_HAS_ATTEMPTS");

    await tx.exam.update({ where: { id: args.examId }, data: { deletedAt: new Date() } });
    await audit(tx, {
      actorId: args.actorId, action: "exam.delete", entityType: "Exam", entityId: args.examId,
      metadata: { courseId: exam.courseId },
    });
    return exam.courseId;
  });
  await safeSync(db, courseId);
  return { id: args.examId };
}

export async function getExamForStaff(db: PrismaClient, examId: string) {
  const exam = await db.exam.findFirst({
    where: { id: examId, deletedAt: null },
    select: {
      ...examSelect,
      questions: { where: { deletedAt: null }, select: { points: true, status: true } },
      _count: { select: { attempts: true } },
    },
  });
  if (!exam) throw new GradingError("NOT_FOUND");
  const { questions, _count, ...rest } = exam;
  return {
    ...toDto(rest),
    questionCount: questions.length,
    publishedQuestionCount: questions.filter((q) => q.status === "PUBLISHED").length,
    maxScore: questions.filter((q) => q.status === "PUBLISHED").reduce((s, q) => s + q.points.toNumber(), 0),
    attemptCount: _count.attempts,
  };
}
