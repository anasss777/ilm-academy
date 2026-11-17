import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { parseUuid } from "@/lib/auth/params";
import { formatDateTime, formatNumber } from "@/lib/format";
import { localized } from "@/lib/i18n-content";
import { getQuestionForStudent } from "@/lib/read/service";
import { courseContext } from "@/lib/ui/context";
import { orLeave } from "@/lib/ui/data";
import { QuestionForm, type LockReason, type SubmissionView } from "@/components/student/question-form";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string; questionId: string }>;
}) {
  const ctx = await courseContext(params);
  const { locale, courseId, user, base } = ctx;
  const questionId = parseUuid(ctx.questionId);
  if (!questionId) notFound();

  const t = await getTranslations("question");
  const tl = await getTranslations("student");

  const q = await orLeave(getQuestionForStudent(db, { userId: user.id, questionId }), locale);
  // The question must belong to the course in the URL
  const meta = await db.question.findUnique({
    where: { id: questionId },
    select: { courseId: true, lecture: { select: { id: true, number: true, titleAr: true, titleEn: true } } },
  });
  if (!meta || meta.courseId !== courseId) notFound();

  const sub = q.submission;
  const submission: SubmissionView | null = sub
    ? {
        answerText: sub.answerText,
        selectedOptionId: sub.selectedOptionId,
        released: sub.released,
        isLate: sub.isLate,
        excuseGranted: sub.excuseGranted,
        feedback: sub.feedback,
        result:
          sub.released && sub.score
            ? {
                finalText: formatNumber(sub.score.final ?? 0, locale),
                outOfText: formatNumber(q.question.points, locale),
                rawText:
                  sub.score.raw != null && sub.score.raw !== sub.score.final ? formatNumber(sub.score.raw, locale) : null,
                penaltyKind:
                  sub.isLate && !sub.excuseGranted && sub.score.penaltyType !== "NONE"
                    ? (sub.score.penaltyType as "PERCENT" | "POINTS")
                    : null,
                penaltyText: sub.score.penaltyValue != null ? formatNumber(sub.score.penaltyValue, locale) : null,
              }
            : null,
      }
    : null;

  const lockReason: LockReason | null = q.state.canSubmit ? null : (q.state.reason as LockReason | null);
  const lecture = meta.lecture;

  return (
    <div className="stack gap-6">
      {lecture ? (
        <Link href={`${base}/lectures/${lecture.id}`} className="link text-sm">
          {t("backToLecture")} · {localized(locale, lecture.titleAr, lecture.titleEn)}
        </Link>
      ) : null}

      <section className="card stack gap-4">
        <div className="cluster gap-2">
          <span className="badge-primary">{t(`types.${q.question.type}`)}</span>
          <span className="badge-muted">{t("points", { points: formatNumber(q.question.points, locale) })}</span>
          {lecture ? <span className="badge-muted">{tl("lectureNumber", { number: String(lecture.number) })}</span> : null}
        </div>
        <p className="prose-block text-lg" dir="auto">{q.question.body}</p>
        <div className="stack gap-1 text-sm text-muted">
          <p>{q.dueAt ? t("due", { date: formatDateTime(q.dueAt, locale, user.timezone) }) : t("noDeadline")}</p>
          {q.allowLate && q.lateCutoffAt ? (
            <p>{t("cutoff", { date: formatDateTime(q.lateCutoffAt, locale, user.timezone) })}</p>
          ) : null}
        </div>
      </section>

      <QuestionForm
        question={{
          id: q.question.id,
          type: q.question.type,
          options: q.question.options,
          correctOptionIds: q.question.correctOptionIds,
          explanation: q.question.explanation,
        }}
        submission={submission}
        canSubmit={q.state.canSubmit}
        lockReason={lockReason}
        isLateNow={q.state.isLate}
      />
    </div>
  );
}
