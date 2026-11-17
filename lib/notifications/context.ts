// lib/notifications/context.ts
// Loads the titles and dates a batch of notifications refers to, in four queries in total.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { asPayload, payloadString } from "./catalog";
import type { NotificationContext } from "./view";

export async function loadContexts(
  db: PrismaClient,
  rows: { id: string; payload: unknown }[],
): Promise<Map<string, NotificationContext>> {
  const courseIds = new Set<string>();
  const lectureIds = new Set<string>();
  const questionIds = new Set<string>();
  const examIds = new Set<string>();

  for (const r of rows) {
    const p = asPayload(r.payload);
    const add = (set: Set<string>, key: string) => {
      const v = payloadString(p, key);
      if (v) set.add(v);
    };
    add(courseIds, "courseId");
    add(lectureIds, "lectureId");
    add(questionIds, "questionId");
    add(examIds, "examId");
  }

  const [courses, lectures, questions, exams] = await Promise.all([
    courseIds.size
      ? db.course.findMany({ where: { id: { in: [...courseIds] } }, select: { id: true, titleAr: true, titleEn: true } })
      : [],
    lectureIds.size
      ? db.lecture.findMany({
          where: { id: { in: [...lectureIds] } },
          select: { id: true, number: true, titleAr: true, titleEn: true, startsAt: true },
        })
      : [],
    questionIds.size
      ? db.question.findMany({ where: { id: { in: [...questionIds] } }, select: { id: true, dueAt: true } })
      : [],
    examIds.size
      ? db.exam.findMany({ where: { id: { in: [...examIds] } }, select: { id: true, dueAt: true } })
      : [],
  ]);

  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  const courseBy = byId(courses);
  const lectureBy = byId(lectures);
  const questionBy = byId(questions);
  const examBy = byId(exams);

  const out = new Map<string, NotificationContext>();
  for (const r of rows) {
    const p = asPayload(r.payload);
    const course = courseBy.get(payloadString(p, "courseId") ?? "");
    const lecture = lectureBy.get(payloadString(p, "lectureId") ?? "");
    const question = questionBy.get(payloadString(p, "questionId") ?? "");
    const exam = examBy.get(payloadString(p, "examId") ?? "");
    out.set(r.id, {
      courseTitleAr: course?.titleAr ?? null,
      courseTitleEn: course?.titleEn ?? null,
      lectureNumber: lecture?.number ?? null,
      lectureTitleAr: lecture?.titleAr ?? null,
      lectureTitleEn: lecture?.titleEn ?? null,
      lectureStartsAt: lecture?.startsAt ?? null,
      questionDueAt: question?.dueAt ?? null,
      examDueAt: exam?.dueAt ?? null,
    });
  }
  return out;
}
