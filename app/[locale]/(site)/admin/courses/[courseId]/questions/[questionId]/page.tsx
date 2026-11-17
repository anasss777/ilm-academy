import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { parseUuid } from "@/lib/auth/params";
import { getQuestionForStaff } from "@/lib/staff/questions";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { QuestionForm } from "@/components/admin/question-form";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string; questionId: string }>;
}) {
  const ctx = await adminCourseContext(params, "/questions");
  const { locale, courseId, perms, base } = ctx;
  const questionId = parseUuid(ctx.questionId);
  if (!questionId) notFound();
  const t = await getTranslations("admin.questions.form");

  // The question must belong to this course; which permission applies depends on where it lives
  const owner = await db.question.findFirst({
    where: { id: questionId, courseId, deletedAt: null },
    select: { examId: true, lectureId: true },
  });
  if (!owner) notFound();
  if (!perms.has(owner.examId ? "exam.edit" : "question.edit")) redirect({ href: "/admin/no-access", locale });

  const q = await getQuestionForStaff(db, questionId);

  return (
    <div className="stack gap-4">
      <h2 className="title-section">{t("editTitle")}</h2>
      <QuestionForm
        mode="edit"
        courseId={courseId}
        parent={owner.examId ? { kind: "exam", examId: owner.examId } : { kind: "lecture", lectureId: owner.lectureId as string }}
        backHref={owner.examId ? `${base}/exam` : `${base}/questions`}
        initial={{
          id: q.id,
          type: q.type as "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN",
          body: q.body,
          points: q.points,
          explanation: q.explanation ?? "",
          status: q.status as "DRAFT" | "PUBLISHED",
          options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
          dueAt: q.dueAt ? q.dueAt.toISOString() : null,
          lateCutoffAt: q.lateCutoffAt ? q.lateCutoffAt.toISOString() : null,
          allowLate: q.allowLate,
          answerCount: q.answerCount,
          locked: q.locked,
        }}
      />
    </div>
  );
}
