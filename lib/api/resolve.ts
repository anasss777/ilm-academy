// lib/api/resolve.ts
// Find the course a resource belongs to, so permissions can be checked against that course.
// A missing resource is a 404 before any permission check.

import { db } from "@/lib/db";
import { ApiError } from "./errors";

const notFound = () => new ApiError(404, "NOT_FOUND");

export async function courseIdOfQuestion(questionId: string): Promise<string> {
  const row = await db.question.findUnique({ where: { id: questionId }, select: { courseId: true } });
  if (!row) throw notFound();
  return row.courseId;
}

export async function courseIdOfSubmission(submissionId: string): Promise<string> {
  const row = await db.questionSubmission.findUnique({
    where: { id: submissionId },
    select: { question: { select: { courseId: true } } },
  });
  if (!row) throw notFound();
  return row.question.courseId;
}

export async function courseIdOfExam(examId: string): Promise<string> {
  const row = await db.exam.findUnique({ where: { id: examId }, select: { courseId: true } });
  if (!row) throw notFound();
  return row.courseId;
}

export async function courseIdOfExamAnswer(answerId: string): Promise<string> {
  const row = await db.examAnswer.findUnique({
    where: { id: answerId },
    select: { attempt: { select: { exam: { select: { courseId: true } } } } },
  });
  if (!row) throw notFound();
  return row.attempt.exam.courseId;
}

export async function assertCourseExists(courseId: string): Promise<void> {
  const row = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!row) throw notFound();
}

export async function courseIdOfLecture(lectureId: string): Promise<string> {
  const row = await db.lecture.findFirst({ where: { id: lectureId, deletedAt: null }, select: { courseId: true } });
  if (!row) throw notFound();
  return row.courseId;
}

export async function courseIdOfRecording(recordingId: string): Promise<string> {
  const row = await db.recording.findUnique({
    where: { id: recordingId },
    select: { lecture: { select: { courseId: true } } },
  });
  if (!row) throw notFound();
  return row.lecture.courseId;
}

export async function courseIdOfMaterial(materialId: string): Promise<string> {
  const row = await db.material.findFirst({ where: { id: materialId, deletedAt: null }, select: { courseId: true } });
  if (!row) throw notFound();
  return row.courseId;
}

/** Where a question lives: lecture questions and exam questions need different permissions. */
export async function questionContextOf(questionId: string): Promise<{ courseId: string; examId: string | null }> {
  const row = await db.question.findFirst({
    where: { id: questionId, deletedAt: null },
    select: { courseId: true, examId: true },
  });
  if (!row) throw notFound();
  return row;
}

export async function courseIdOfExamAttempt(attemptId: string): Promise<string> {
  const row = await db.examAttempt.findUnique({
    where: { id: attemptId },
    select: { exam: { select: { courseId: true } } },
  });
  if (!row) throw notFound();
  return row.exam.courseId;
}

export async function courseIdOfCertificateExport(exportId: string): Promise<string> {
  const row = await db.certificateExport.findUnique({ where: { id: exportId }, select: { courseId: true } });
  if (!row) throw notFound();
  return row.courseId;
}
