// lib/staff/questions.ts
// Authoring lecture questions and exam questions (one `questions` table, two kinds of parent).
// Routes verify question.create / question.edit (lecture) or exam.edit (exam) first.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GradingError, round2 } from "../grading/grading";
import type { CreateQuestionInput, UpdateQuestionInput } from "../validation/staff";
import { audit, inTx, safeSync } from "./common";
import {
  buildOptions,
  isStructureLocked,
  validatePoints,
  validateQuestionTiming,
} from "./question-rules";

export type QuestionParent = { kind: "lecture"; lectureId: string } | { kind: "exam"; examId: string };

export async function createQuestion(
  db: PrismaClient,
  args: { parent: QuestionParent; input: CreateQuestionInput; actorId: string },
) {
  const { parent, input, actorId } = args;
  const points = validatePoints(input.points);
  const options = buildOptions(input.type, input);
  validateQuestionTiming({
    kind: parent.kind,
    dueAt: input.dueAt,
    lateCutoffAt: input.lateCutoffAt,
    allowLate: input.allowLate,
  });

  const { question, courseId } = await inTx(db, async (tx) => {
    let courseId: string;
    let lectureId: string | null = null;
    let examId: string | null = null;

    if (parent.kind === "lecture") {
      const lecture = await tx.lecture.findFirst({
        where: { id: parent.lectureId, deletedAt: null },
        select: { id: true, courseId: true, course: { select: { questionsEnabled: true } } },
      });
      if (!lecture) throw new GradingError("NOT_FOUND");
      if (!lecture.course.questionsEnabled) throw new GradingError("COURSE_FEATURE_DISABLED");
      courseId = lecture.courseId;
      lectureId = lecture.id;
    } else {
      const exam = await tx.exam.findFirst({
        where: { id: parent.examId, deletedAt: null },
        select: { id: true, courseId: true },
      });
      if (!exam) throw new GradingError("NOT_FOUND");
      courseId = exam.courseId;
      examId = exam.id;
    }

    const siblings: Prisma.QuestionWhereInput = lectureId
      ? { lectureId, deletedAt: null }
      : { examId, deletedAt: null };
    const position =
      input.position ??
      ((await tx.question.aggregate({ where: siblings, _max: { position: true } }))._max.position ?? -1) + 1;

    const row = await tx.question.create({
      data: {
        courseId,
        lectureId,
        examId,
        type: input.type,
        body: input.body.trim(),
        explanation: input.explanation?.trim() || null,
        points,
        position,
        status: input.status ?? "DRAFT",
        dueAt: input.dueAt ?? null,
        lateCutoffAt: input.lateCutoffAt ?? null,
        allowLate: input.allowLate ?? null,
        options: { create: options },
      },
      select: { id: true, type: true, status: true },
    });
    await audit(tx, {
      actorId, action: "question.create", entityType: "Question", entityId: row.id,
      metadata: { courseId, lectureId, examId, type: input.type },
    });
    return { question: row, courseId };
  });

  // New published points change everyone's question score
  if (question.status === "PUBLISHED") await safeSync(db, courseId);
  return question;
}

export async function updateQuestion(
  db: PrismaClient,
  args: { questionId: string; input: UpdateQuestionInput; actorId: string },
) {
  const { questionId, input, actorId } = args;

  const { courseId, changesScoring, row } = await inTx(db, async (tx) => {
    const q = await tx.question.findFirst({
      where: { id: questionId, deletedAt: null },
      select: {
        id: true, courseId: true, type: true, status: true, points: true, lectureId: true, examId: true,
        dueAt: true, lateCutoffAt: true, allowLate: true,
        _count: { select: { submissions: true, examAnswers: true } },
      },
    });
    if (!q) throw new GradingError("NOT_FOUND");

    const wantsStructure = input.options !== undefined || input.correctAnswer !== undefined;
    const pointsChange = input.points !== undefined && round2(input.points) !== Number(q.points);
    if (isStructureLocked(q._count.submissions + q._count.examAnswers) && (wantsStructure || pointsChange)) {
      throw new GradingError(
        "QUESTION_LOCKED",
        "Students have already answered: options, correct answer and points can no longer change",
      );
    }

    validateQuestionTiming({
      kind: q.examId ? "exam" : "lecture",
      dueAt: input.dueAt !== undefined ? input.dueAt : q.dueAt,
      lateCutoffAt: input.lateCutoffAt !== undefined ? input.lateCutoffAt : q.lateCutoffAt,
      allowLate: input.allowLate !== undefined ? input.allowLate : q.allowLate,
    });

    const data: Prisma.QuestionUncheckedUpdateInput = {};
    if (input.body !== undefined) data.body = input.body.trim();
    if (input.explanation !== undefined) data.explanation = input.explanation?.trim() || null;
    if (input.points !== undefined) data.points = validatePoints(input.points);
    if (input.position !== undefined) data.position = input.position;
    if (input.status !== undefined) data.status = input.status;
    if (input.dueAt !== undefined) data.dueAt = input.dueAt;
    if (input.lateCutoffAt !== undefined) data.lateCutoffAt = input.lateCutoffAt;
    if (input.allowLate !== undefined) data.allowLate = input.allowLate;

    if (wantsStructure) {
      const options = buildOptions(q.type, { options: input.options, correctAnswer: input.correctAnswer });
      await tx.questionOption.deleteMany({ where: { questionId } });
      if (options.length) {
        await tx.questionOption.createMany({ data: options.map((o) => ({ questionId, ...o })) });
      }
    }

    const updated = await tx.question.update({
      where: { id: questionId },
      data,
      select: { id: true, type: true, status: true },
    });
    await audit(tx, {
      actorId, action: "question.update", entityType: "Question", entityId: questionId,
      metadata: { fields: Object.keys(data), structure: wantsStructure },
    });
    return {
      courseId: q.courseId,
      row: updated,
      changesScoring: wantsStructure || pointsChange || input.status !== undefined,
    };
  });

  if (changesScoring) await safeSync(db, courseId);
  return row;
}

/** Soft delete: students' answers and grades are kept for the record. */
export async function deleteQuestion(db: PrismaClient, args: { questionId: string; actorId: string }) {
  const courseId = await inTx(db, async (tx) => {
    const q = await tx.question.findFirst({
      where: { id: args.questionId, deletedAt: null },
      select: { courseId: true },
    });
    if (!q) throw new GradingError("NOT_FOUND");
    await tx.question.update({ where: { id: args.questionId }, data: { deletedAt: new Date() } });
    await audit(tx, {
      actorId: args.actorId, action: "question.delete", entityType: "Question", entityId: args.questionId,
      metadata: { courseId: q.courseId },
    });
    return q.courseId;
  });
  await safeSync(db, courseId);
  return { id: args.questionId };
}

const staffSelect = {
  id: true, type: true, body: true, points: true, explanation: true, position: true, status: true,
  dueAt: true, lateCutoffAt: true, allowLate: true, lectureId: true, examId: true,
  options: { orderBy: { position: "asc" as const }, select: { id: true, text: true, isCorrect: true, position: true } },
  _count: { select: { submissions: true, examAnswers: true } },
};

type StaffQuestionRow = Prisma.QuestionGetPayload<{ select: typeof staffSelect }>;

/** Staff see the answer key (isCorrect) and how many students have answered. */
const toStaffDto = (q: StaffQuestionRow) => ({
  id: q.id,
  type: q.type,
  body: q.body,
  points: q.points.toNumber(),
  explanation: q.explanation,
  position: q.position,
  status: q.status,
  dueAt: q.dueAt,
  lateCutoffAt: q.lateCutoffAt,
  allowLate: q.allowLate,
  lectureId: q.lectureId,
  examId: q.examId,
  options: q.options,
  answerCount: q._count.submissions + q._count.examAnswers,
  locked: isStructureLocked(q._count.submissions + q._count.examAnswers),
});

export async function listQuestionsForStaff(db: PrismaClient, parent: QuestionParent) {
  const rows = await db.question.findMany({
    where: parent.kind === "lecture"
      ? { lectureId: parent.lectureId, deletedAt: null }
      : { examId: parent.examId, deletedAt: null },
    orderBy: { position: "asc" },
    select: staffSelect,
  });
  return { items: rows.map(toStaffDto) };
}

export async function getQuestionForStaff(db: PrismaClient, questionId: string) {
  const q = await db.question.findFirst({ where: { id: questionId, deletedAt: null }, select: staffSelect });
  if (!q) throw new GradingError("NOT_FOUND");
  return toStaffDto(q);
}
