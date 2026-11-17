import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { parseUuid } from "@/lib/auth/params";
import { formatDateTime } from "@/lib/format";
import { GradingError } from "@/lib/grading/grading";
import { getAttemptForGrader } from "@/lib/staff/queues";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { ExamAnswerGrader } from "@/components/admin/exam-answer-grader";
import { ExamGrantForm } from "@/components/admin/exam-grant-form";

export default async function AdminExamAttemptPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string; attemptId: string }>;
}) {
  const ctx = await adminCourseContext(params, "/grading", "exam.grade");
  const { locale, courseId, user, perms, base } = ctx;
  const attemptId = parseUuid(ctx.attemptId);
  if (!attemptId) notFound();
  const t = await getTranslations("admin.grading");

  const attempt = await getAttemptForGrader(db, attemptId).catch((e: unknown): never => {
    if (e instanceof GradingError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  // The attempt must belong to this course's exam
  if (attempt.exam.courseId !== courseId) notFound();

  return (
    <div className="stack gap-6">
      <Link href={`${base}/grading`} className="link text-sm">
        {t("back")}
      </Link>

      <section className="card stack gap-2">
        <h2 className="title-section">{t("attemptTitle", { number: String(attempt.attemptNumber) })}</h2>
        <p className="text-sm">
          <span className="text-muted">{t("student")}: </span>
          <span className="font-medium text-ink" dir="auto">{attempt.student.fullName}</span>{" "}
          <span className="text-muted" dir="ltr">({attempt.student.email})</span>
        </p>
        {attempt.submittedAt ? (
          <p className="text-sm text-muted">{t("submitted", { date: formatDateTime(attempt.submittedAt, locale, user.timezone) })}</p>
        ) : null}
        {attempt.totalScore != null ? (
          <p className="text-sm font-semibold text-ink">
            {t("total")}: {attempt.totalScore}
          </p>
        ) : null}
      </section>

      <ExamAnswerGrader
        canGrade
        answers={attempt.answers.map((a, i) => ({
          id: a.id,
          number: i + 1,
          type: a.question.type,
          body: a.question.body,
          points: a.question.points,
          answerText: a.answerText,
          selectedOptionId: a.selectedOptionId,
          options: a.question.options,
          isCorrect: a.isCorrect,
          score: a.score,
          autoGraded: a.autoGraded,
          feedback: a.feedback,
        }))}
      />

      {perms.has("exam.reopen") ? <ExamGrantForm examId={attempt.examId} userId={attempt.student.id} /> : null}
    </div>
  );
}
